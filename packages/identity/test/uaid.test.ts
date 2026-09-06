import { describe, expect, it } from 'vitest';
import { base58Encode, canonicalJson, computeAid, normalizeCanonicalAgentData, parseUaid, wrapExistingDid } from '../src/uaid.js';

/**
 * These four vectors were produced by running the reference implementation
 * (@hashgraphonline/standards-sdk@0.1.186, hcs-14 module) in an isolated
 * install on 2026-09-06 — see uaid.ts header. If this file ever needs to
 * change, re-run the reference SDK, don't just edit the expected string.
 */

describe('canonicalJson — matches the reference key order exactly', () => {
  it('vector 1: our provider-hedera identity', () => {
    const normalized = normalizeCanonicalAgentData({
      registry: 'bazaar',
      name: 'Bazaar Market Intel (Hedera)',
      version: '1.0.0',
      protocol: 'x402',
      nativeId: 'hedera:testnet:0.0.5000001',
      skills: [],
    });
    expect(canonicalJson(normalized)).toBe(
      '{"skills":[],"name":"Bazaar Market Intel (Hedera)","nativeId":"hedera:testnet:0.0.5000001","protocol":"x402","registry":"bazaar","version":"1.0.0"}',
    );
  });

  it('vector 2: skills are sorted numerically ascending regardless of input order', () => {
    const normalized = normalizeCanonicalAgentData({
      registry: 'hol',
      name: 'Support Agent',
      version: '1.0.0',
      protocol: 'hcs-10',
      nativeId: 'hedera:testnet:0.0.123456',
      skills: [17, 0, 5],
    });
    expect(normalized.skills).toEqual([0, 5, 17]);
    expect(canonicalJson(normalized)).toBe(
      '{"skills":[0,5,17],"name":"Support Agent","nativeId":"hedera:testnet:0.0.123456","protocol":"hcs-10","registry":"hol","version":"1.0.0"}',
    );
  });

  it('lowercases registry and protocol but not name, version, or nativeId', () => {
    const normalized = normalizeCanonicalAgentData({
      registry: 'Bazaar',
      name: 'X',
      version: '1.0.0',
      protocol: 'X402',
      nativeId: 'eip155:84532:0xABCDEF',
      skills: [],
    });
    expect(normalized.registry).toBe('bazaar');
    expect(normalized.protocol).toBe('x402');
    expect(normalized.nativeId).toBe('eip155:84532:0xABCDEF');
  });
});

describe('computeAid — full hash + UAID string, pinned against the reference SDK', () => {
  it('vector 1: provider-hedera, no skills, default params', () => {
    const { hash, uaid } = computeAid({
      registry: 'bazaar',
      name: 'Bazaar Market Intel (Hedera)',
      version: '1.0.0',
      protocol: 'x402',
      nativeId: 'hedera:testnet:0.0.5000001',
      skills: [],
    });
    expect(hash).toBe('4Mq1caFFV5K2LgGrsobSH9oEn4qsw4cp39dAWWbRTDLJnGBXeTv1VEDdYXSWVwfo69');
    expect(uaid).toBe(
      'uaid:aid:4Mq1caFFV5K2LgGrsobSH9oEn4qsw4cp39dAWWbRTDLJnGBXeTv1VEDdYXSWVwfo69;uid=0;registry=bazaar;nativeId=hedera:testnet:0.0.5000001',
    );
  });

  it('vector 2: with proto param and unsorted skills input', () => {
    const { hash, uaid } = computeAid(
      { registry: 'hol', name: 'Support Agent', version: '1.0.0', protocol: 'hcs-10', nativeId: 'hedera:testnet:0.0.123456', skills: [17, 0, 5] },
      { registry: 'hol', proto: 'hcs-10', nativeId: 'hedera:testnet:0.0.123456', uid: '0' },
    );
    expect(hash).toBe('2WdcvQgHwmu4NnQ5VEZ9jmbUyKqwmxjSK1Hc4vnQbt29qrrmUM7HPi2Fz8BcrUrcBR');
    expect(uaid).toBe(
      'uaid:aid:2WdcvQgHwmu4NnQ5VEZ9jmbUyKqwmxjSK1Hc4vnQbt29qrrmUM7HPi2Fz8BcrUrcBR;uid=0;registry=hol;proto=hcs-10;nativeId=hedera:testnet:0.0.123456',
    );
  });

  it('vector 3: eip155 nativeId (non-Hedera protocol) with one skill', () => {
    const { hash, uaid } = computeAid(
      { registry: 'bazaar', name: 'Bazaar Task Runner (Arc)', version: '1.0.0', protocol: 'x402', nativeId: 'eip155:84532:0x55555555555555555555555555555555555', skills: [1] },
      { registry: 'bazaar', proto: 'x402', nativeId: 'eip155:84532:0x55555555555555555555555555555555555' },
    );
    expect(hash).toBe('62JXm9rgUvZW6Hoz7DcWPE9M9xaVhs79xtNyaRAJkU9DkHhmQhMkjN93bkzLQ53Xd3');
    expect(uaid).toBe(
      'uaid:aid:62JXm9rgUvZW6Hoz7DcWPE9M9xaVhs79xtNyaRAJkU9DkHhmQhMkjN93bkzLQ53Xd3;uid=0;registry=bazaar;proto=x402;nativeId=eip155:84532:0x55555555555555555555555555555555555',
    );
  });

  it('rejects hcs-10 protocol with a non-CAIP-10-Hedera nativeId', () => {
    expect(() =>
      computeAid({ registry: 'hol', name: 'X', version: '2.0.0', protocol: 'hcs-10', nativeId: 'eip155:1:0xABC', skills: [] }),
    ).toThrow(/CAIP-10/);
  });
});

describe('wrapExistingDid — vectors from the reference SDK', () => {
  it('strips both the did: prefix and the method name, keeping the method-specific id', () => {
    const wrapped = wrapExistingDid('did:web:example.com:agents:1', { proto: 'a2a', nativeId: 'eip155:1:0xdead' });
    expect(wrapped).toBe('uaid:did:example.com:agents:1;proto=a2a;nativeId=eip155:1:0xdead');
  });
  it('strips the method name for other DID methods too (not web-specific)', () => {
    expect(wrapExistingDid('did:web:example.com')).toBe('uaid:did:example.com');
    expect(wrapExistingDid('did:example:12345')).toBe('uaid:did:12345');
    expect(wrapExistingDid('did:ethr:0xabc123')).toBe('uaid:did:0xabc123');
  });
  it('adds no default params — uid is never implied for the did form', () => {
    expect(wrapExistingDid('did:web:example.com:agents:1')).toBe('uaid:did:example.com:agents:1');
    expect(wrapExistingDid('did:web:example.com:agents:1', { proto: 'a2a' })).toBe('uaid:did:example.com:agents:1;proto=a2a');
  });
  it('rejects non-DID input and a DID with no method-specific id', () => {
    expect(() => wrapExistingDid('not-a-did')).toThrow();
    expect(() => wrapExistingDid('did:web')).toThrow();
  });
});

describe('parseUaid', () => {
  it('round-trips computeAid output', () => {
    const { uaid, hash } = computeAid({ registry: 'bazaar', name: 'X', version: '1.0.0', protocol: 'x402', nativeId: 'hedera:testnet:0.0.1', skills: [] });
    const parsed = parseUaid(uaid);
    expect(parsed.method).toBe('aid');
    expect(parsed.id).toBe(hash);
    expect(parsed.params.registry).toBe('bazaar');
  });
  it('round-trips wrapExistingDid output', () => {
    const parsed = parseUaid('uaid:did:example.com:agents:1;proto=a2a;nativeId=eip155:1:0xdead');
    expect(parsed.method).toBe('did');
    expect(parsed.id).toBe('example.com:agents:1');
    expect(parsed.params).toEqual({ proto: 'a2a', nativeId: 'eip155:1:0xdead' });
  });
  it('rejects garbage', () => {
    expect(() => parseUaid('nonsense')).toThrow();
  });
});

describe('base58Encode', () => {
  it('handles leading zero bytes as leading 1s', () => {
    expect(base58Encode(new Uint8Array([0, 0, 1]))).toBe('112');
  });
  it('empty input yields empty string', () => {
    expect(base58Encode(new Uint8Array([]))).toBe('');
  });
});
