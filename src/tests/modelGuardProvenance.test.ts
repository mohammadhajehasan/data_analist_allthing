import { describe, expect, it } from 'vitest';
import { auditFeatures } from '../utils/modelGuard';
import {
  buildProvenanceBundle,
  buildProvenanceManifest,
  fingerprintRows,
  hashText,
} from '../utils/provenanceBundle';

const rows = (count: number): Record<string, number>[] =>
  Array.from({ length: count }, (_, i) => ({ t: i, sales: 100 + i * 2, revenue: (100 + i * 2) * 3, noise: i % 7 }));

describe('feature audit', () => {
  it('flags a feature that carries the target', () => {
    // The target is a curved function of time, so only `sales` reproduces it.
    const target = (i: number) => ((i * 37) % 29) * 3;
    const data = Array.from({ length: 60 }, (_, i) => ({ t: i, sales: target(i) * 2, target: target(i) }));
    const findings = auditFeatures(data, ['t', 'sales'], 'target');
    const leak = findings.find((finding) => finding.kind === 'target-leak');
    expect(leak).toBeDefined();
    expect(leak!.severity).toBe('high');
    expect(leak!.columns).toEqual(['sales', 'target']);
    expect(findings.filter((finding) => finding.kind === 'target-leak')).toHaveLength(1);
  });

  it('flags two identical features and leaves independent ones alone', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      a: i * 3,
      b: i * 3,
      c: (i * 37) % 13,
      y: (i * 7) % 11,
    }));
    const findings = auditFeatures(data, ['a', 'b', 'c'], 'y');
    const duplicate = findings.find((finding) => finding.kind === 'duplicate-feature');
    expect(duplicate?.columns.sort()).toEqual(['a', 'b']);
    expect(findings.filter((finding) => finding.kind === 'duplicate-feature')).toHaveLength(1);
  });

  it('flags a constant column and ignores a healthy pair', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ flat: 5, real: (i * 13) % 7, y: (i * 5) % 11 }));
    const findings = auditFeatures(data, ['flat', 'real'], 'y');
    expect(findings.some((finding) => finding.kind === 'constant-feature' && finding.columns[0] === 'flat')).toBe(true);
    expect(findings.some((finding) => finding.columns.includes('real') && finding.kind === 'target-leak')).toBe(false);
  });

  it('handles the sample dataset that leaked in the studio', () => {
    // Value2 = 0.6 * Value + 40 produced a confidence band 0.02 wide.
    const data = Array.from({ length: 72 }, (_, i) => ({ Value: 100 + i, Value2: (100 + i) * 0.6 + 40 }));
    const findings = auditFeatures(data, ['Value2'], 'Value');
    expect(findings.some((finding) => finding.kind === 'target-leak')).toBe(true);
  });
});

describe('provenance bundle', () => {
  it('hashes the same values the same way regardless of formatting', () => {
    const a = fingerprintRows(['x'], [[1], [2.5], ['3']]);
    const b = fingerprintRows(['x'], [['1.0'], ['2.50'], [3]]);
    expect(a).toBe(b);
    expect(a).not.toBe(fingerprintRows(['x'], [[1], [2.5], [4]]));
    expect(hashText('abc')).toHaveLength(16);
  });

  it('builds a manifest with the dataset fingerprint and the model settings', () => {
    const manifest = buildProvenanceManifest({
      datasetName: 'sales.csv',
      headers: ['t', 'sales'],
      rows: [[0, 100], [1, 102]],
      model: { type: 'linear', target: 'sales', features: ['t'], coefficients: [2], intercept: 100 },
      language: 'ar',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(manifest.dataset.rows).toBe(2);
    expect(manifest.dataset.numericColumns).toEqual(['t', 'sales']);
    expect(manifest.dataset.fingerprint).toHaveLength(16);
    expect(manifest.settings).toEqual({ features: ['t'], target: 'sales' });
    expect(manifest.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('packs manifest, model, dataset and README into one archive', () => {
    const bundle = buildProvenanceBundle({
      datasetName: 'sales.csv',
      headers: ['t', 'sales'],
      rows: [[0, 100], [1, 102]],
      model: { type: 'linear', target: 'sales', features: ['t'] },
      forecastTable: [['الفترة', 'التوقع'], ['P1', 104]],
      language: 'ar',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const text = new TextDecoder().decode(bundle.bytes);
    expect(text).toContain('manifest.json');
    expect(text).toContain('model.json');
    expect(text).toContain('dataset.csv');
    expect(text).toContain('forecast.csv');
    expect(text).toContain('README.md');
    expect(bundle.fileName.startsWith('provenance-sales-')).toBe(true);
    expect(bundle.fileName.endsWith('.zip')).toBe(true);
  });
});
