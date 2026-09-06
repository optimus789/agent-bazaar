import { describe, expect, it } from 'vitest';
import { classifyRisk, summarise, templateSummarizer } from '../src/tasks.js';

describe('summarise', () => {
  it('returns short text unchanged', async () => {
    const r = await summarise('This is a short sentence.');
    expect(r.summary).toBe('This is a short sentence.');
    expect(r.summaryWordCount).toBe(r.originalWordCount);
  });
  it('truncates long text and reports word counts', async () => {
    const long = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const r = await summarise(long);
    expect(r.originalWordCount).toBe(100);
    expect(r.summary).toContain('…');
    expect(r.summary).toContain('100 words');
  });
  it('rejects empty text', async () => {
    await expect(summarise('')).rejects.toThrow(/non-empty/);
    await expect(summarise('   ')).rejects.toThrow(/non-empty/);
  });
  it('accepts an injected summarizer', async () => {
    const r = await summarise('x', async () => 'custom summary');
    expect(r.summary).toBe('custom summary');
  });
  it('templateSummarizer is deterministic', async () => {
    const a = await templateSummarizer('hello world');
    const b = await templateSummarizer('hello world');
    expect(a).toBe(b);
  });
});

describe('classifyRisk', () => {
  it('labels low/moderate/high by score band', () => {
    expect(classifyRisk({ brief: { riskScore: 10 } }).label).toBe('low');
    expect(classifyRisk({ brief: { riskScore: 55 } }).label).toBe('moderate');
    expect(classifyRisk({ brief: { riskScore: 85 } }).label).toBe('high');
  });
  it('confidence is lower near band boundaries and higher mid-band', () => {
    const nearBoundary = classifyRisk({ brief: { riskScore: 40 } }).confidence;
    const midBand = classifyRisk({ brief: { riskScore: 20 } }).confidence;
    expect(midBand).toBeGreaterThan(nearBoundary);
  });
  it('confidence stays within [0.5, 0.99]', () => {
    for (const score of [0, 1, 39, 40, 41, 69, 70, 71, 99, 100]) {
      const { confidence } = classifyRisk({ brief: { riskScore: score } });
      expect(confidence).toBeGreaterThanOrEqual(0.5);
      expect(confidence).toBeLessThanOrEqual(0.99);
    }
  });
  it('rationale samples up to two reasons', () => {
    const r = classifyRisk({ brief: { riskScore: 80, reasons: ['thin liquidity', 'high turnover', 'concentrated'] } });
    expect(r.rationale).toContain('thin liquidity; high turnover');
    expect(r.rationale).not.toContain('concentrated');
  });
  it('handles a brief with no reasons', () => {
    const r = classifyRisk({ brief: { riskScore: 50 } });
    expect(r.rationale).toContain('no reasons supplied');
  });
  it('rejects an out-of-range score', () => {
    expect(() => classifyRisk({ brief: { riskScore: 150 } })).toThrow();
    expect(() => classifyRisk({ brief: { riskScore: -1 } })).toThrow();
  });
});
