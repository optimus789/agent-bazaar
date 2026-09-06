import { describe, expect, it } from 'vitest';
import { buildDescription, buildRegistrationFile, RegistrationFileSchema } from '../src/registrationFile.js';
import { parseDescription } from '@bazaar/graph';

const routes = [
  { method: 'POST' as const, path: '/v1/usdc/brief/pool', priceUsd: 0.002, description: 'brief' },
  { method: 'POST' as const, path: '/v1/hbar/brief/pool', priceUsd: 0.002, description: 'brief hbar' },
];

describe('buildDescription', () => {
  it('round-trips through the Agent0 discovery parser', () => {
    const desc = buildDescription('hedera', 'http://localhost:4021', routes);
    const parsed = parseDescription(desc);
    expect(parsed.rail).toBe('hedera');
    expect(parsed.catalogUrl).toBe('http://localhost:4021/catalog');
  });
  it('handles zero routes', () => {
    expect(buildDescription('arc', 'http://x', [])).toMatch(/No paid endpoints/);
  });
});

describe('buildRegistrationFile', () => {
  it('produces a schema-valid file with x402Support true when routes exist', () => {
    const file = buildRegistrationFile({
      name: 'Bazaar Market Intel (Hedera)',
      rail: 'hedera',
      baseUrl: 'http://localhost:4021',
      routes,
      registrations: [{ chainId: 84532, agentId: '101' }],
      did: 'uaid:aid:abc;uid=0;registry=bazaar',
    });
    expect(() => RegistrationFileSchema.parse(file)).not.toThrow();
    expect(file.x402Support).toBe(true);
    expect(file.a2aEndpoint).toBe('http://localhost:4021');
    expect(file.services.find((s) => s.name === 'x402')?.endpoint).toBe('http://localhost:4021/catalog');
    expect(file.registrations).toEqual([{ agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e', agentId: '101' }]);
  });

  it('sets x402Support false when there are no paid routes', () => {
    const file = buildRegistrationFile({ name: 'X', rail: 'arc', baseUrl: 'http://x', routes: [], registrations: [] });
    expect(file.x402Support).toBe(false);
  });

  it('adds an MCP service entry only when an mcpEndpoint is given', () => {
    const withMcp = buildRegistrationFile({ name: 'X', rail: 'arc', baseUrl: 'http://x', routes, registrations: [], mcpEndpoint: 'http://x/mcp' });
    expect(withMcp.services.some((s) => s.name === 'MCP')).toBe(true);
    const without = buildRegistrationFile({ name: 'X', rail: 'arc', baseUrl: 'http://x', routes, registrations: [] });
    expect(without.services.some((s) => s.name === 'MCP')).toBe(false);
  });
});
