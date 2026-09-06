import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * HCS-14 Universal Agent ID.
 *
 * There is no published test-vector table with concrete hash outputs, so this
 * implementation was verified by running the reference implementation
 * (`@hashgraphonline/standards-sdk` 0.1.186, `hcs-14` module) in an isolated
 * throwaway install on 2026-09-06 and diffing byte-for-byte against this code's
 * output for four inputs. Those four inputs and their exact outputs are pinned
 * as regression tests in test/uaid.test.ts — do not change this file without
 * re-running the reference SDK and updating those vectors.
 *
 * Confirmed against the reference:
 *  - canonical JSON key order is the fixed sequence below (NOT alphabetical,
 *    NOT insertion order of the input object): skills, name, nativeId, protocol, registry, version.
 *  - skills are sorted numerically ascending.
 *  - registry and protocol are lowercased; name, version and nativeId are NOT case-changed.
 *  - hash = sha384(canonicalJson, utf8), encoded as plain Base58 (Bitcoin alphabet),
 *    NO multibase/multihash prefix byte.
 *  - default routing params always include `uid=0` even when the caller passes none.
 *  - params are emitted in the order: uid, registry, proto, nativeId, domain, src (only present ones).
 *  - protocol 'hcs-10' requires nativeId to be Hedera CAIP-10 (hedera:<network>:<account>);
 *    other protocols (e.g. 'x402') accept any non-empty nativeId.
 */

export const CanonicalAgentDataSchema = z.object({
  registry: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  protocol: z.string().min(1),
  nativeId: z.string().min(1),
  skills: z.array(z.number().int()).default([]),
});

export type CanonicalAgentDataInput = z.input<typeof CanonicalAgentDataSchema>;
export type CanonicalAgentData = z.output<typeof CanonicalAgentDataSchema>;

export interface DidRoutingParams {
  registry?: string;
  proto?: string;
  nativeId?: string;
  uid?: string;
  domain?: string;
  src?: string;
}

const HEDERA_CAIP10_RE = /^hedera:(mainnet|testnet|previewnet|devnet):\d+\.\d+\.\d+$/;

export function normalizeCanonicalAgentData(input: CanonicalAgentDataInput): CanonicalAgentData {
  const parsed = CanonicalAgentDataSchema.parse(input);
  const normalized: CanonicalAgentData = {
    ...parsed,
    registry: parsed.registry.trim().toLowerCase(),
    protocol: parsed.protocol.trim().toLowerCase(),
    skills: [...parsed.skills].sort((a, b) => a - b),
  };
  if (normalized.protocol === 'hcs-10' && !HEDERA_CAIP10_RE.test(normalized.nativeId)) {
    throw new Error(`HCS-14: for protocol hcs-10, nativeId must be CAIP-10 (hedera:<network>:<account>), got "${normalized.nativeId}"`);
  }
  return normalized;
}

/** Fixed key order matches the reference implementation; do not "fix" this to be alphabetical. */
export function canonicalJson(data: CanonicalAgentData): string {
  return JSON.stringify({
    skills: data.skills,
    name: data.name,
    nativeId: data.nativeId,
    protocol: data.protocol,
    registry: data.registry,
    version: data.version,
  });
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58 (Bitcoin alphabet) encode, no multibase prefix. Leading zero bytes become leading '1's. */
export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  for (let i = 0; i < bytes.length - 1 && bytes[i] === 0; i++) leadingZeros++;
  let out = '1'.repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]!];
  return out;
}

export function aidHash(data: CanonicalAgentData): string {
  const digest = createHash('sha384').update(canonicalJson(data), 'utf8').digest();
  return base58Encode(digest);
}

/** Emit routing params in the reference's fixed order: uid, registry, proto, nativeId, domain, src. */
function formatParams(params: DidRoutingParams): string {
  const order: (keyof DidRoutingParams)[] = ['uid', 'registry', 'proto', 'nativeId', 'domain', 'src'];
  return order
    .filter((k) => params[k] !== undefined)
    .map((k) => `${k}=${params[k]}`)
    .join(';');
}

/**
 * Build a deterministic did:aid, or uaid:aid with routing params for discovery.
 *
 * Confirmed against the reference (2026-09-06): for the `aid` form, `uid` always
 * defaults to '0' and `registry`/`nativeId` always default to the values from the
 * canonical data — even when the caller passes no params at all, or an empty
 * object. Explicit params override those defaults; `proto` is never auto-added.
 */
export function computeAid(input: CanonicalAgentDataInput, params: DidRoutingParams = {}): { normalized: CanonicalAgentData; canonicalJson: string; hash: string; uaid: string } {
  const normalized = normalizeCanonicalAgentData(input);
  const cj = canonicalJson(normalized);
  const hash = aidHash(normalized);
  const withDefaults: DidRoutingParams = { uid: '0', registry: normalized.registry, nativeId: normalized.nativeId, ...params };
  const uaid = `uaid:aid:${hash};${formatParams(withDefaults)}`;
  return { normalized, canonicalJson: cj, hash, uaid };
}

/**
 * Wrap an existing DID (e.g. did:web:example.com) as a uaid:did.
 *
 * Confirmed against the reference (2026-09-06): the wrapped id drops BOTH the
 * `did:` prefix AND the method name, keeping only the method-specific-id —
 * `did:web:example.com:agents:1` becomes `uaid:did:example.com:agents:1`, and
 * `did:ethr:0xabc` becomes `uaid:did:0xabc`, for every method tried (web, key,
 * pkh, example, ethr). Unlike computeAid, wrapping adds NO default params:
 * only what the caller passes appears, and `uid` is never implied.
 */
export function wrapExistingDid(existingDid: string, params: DidRoutingParams = {}): string {
  const m = /^did:[^:]+:(.+)$/.exec(existingDid.trim());
  if (!m) throw new Error(`not a DID with a method-specific id: ${existingDid}`);
  const paramStr = formatParams(params);
  return paramStr ? `uaid:did:${m[1]};${paramStr}` : `uaid:did:${m[1]}`;
}

export interface ParsedHcs14Did {
  method: 'aid' | 'did';
  id: string;
  params: Record<string, string>;
}

export function parseUaid(uaid: string): ParsedHcs14Did {
  const m = /^uaid:(aid|did):([^;]+)(;.*)?$/.exec(uaid.trim());
  if (!m) throw new Error(`not a valid uaid: ${uaid}`);
  const params: Record<string, string> = {};
  if (m[3]) {
    for (const pair of m[3].slice(1).split(';')) {
      const [k, v] = pair.split('=');
      if (k) params[k] = v ?? '';
    }
  }
  return { method: m[1] as 'aid' | 'did', id: m[2]!, params };
}
