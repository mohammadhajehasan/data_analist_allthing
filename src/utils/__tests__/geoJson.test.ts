import { describe, it, expect } from 'vitest';
import { parseGeoJsonSource, geoJsonBBox, computeGeoJsonAutoFit } from '../geoJson';

const sample = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { governorate: 'الرياض', code: '01' },
      geometry: { type: 'Polygon', coordinates: [[[46, 24], [47, 24], [47, 25], [46, 25], [46, 24]]] },
    },
    {
      type: 'Feature',
      properties: { governorate: 'جدة', code: '02' },
      geometry: { type: 'Polygon', coordinates: [[[39, 21], [40, 21], [40, 22], [39, 22], [39, 21]]] },
    },
  ],
});

describe('parseGeoJsonSource', () => {
  it('parses a valid FeatureCollection and extracts candidate properties', () => {
    const parsed = parseGeoJsonSource({ name: 'test.geojson', data: sample, featureProperty: 'governorate', uploadedAt: '' });
    expect(parsed).not.toBeNull();
    expect(parsed!.error).toBeUndefined();
    expect(parsed!.features).toHaveLength(2);
    expect(parsed!.candidateProperties).toContain('governorate');
    expect(parsed!.sampleNames).toEqual(['الرياض', 'جدة']);
  });

  it('wraps a single Feature into a FeatureCollection', () => {
    const single = JSON.stringify({
      type: 'Feature',
      properties: { name: 'X' },
      geometry: { type: 'Point', coordinates: [10, 20] },
    });
    const parsed = parseGeoJsonSource({ name: 't', data: single, featureProperty: 'name', uploadedAt: '' });
    expect(parsed!.features).toHaveLength(1);
  });

  it('flags invalid JSON', () => {
    const parsed = parseGeoJsonSource({ name: 't', data: '{not json', featureProperty: '', uploadedAt: '' });
    expect(parsed!.error).toBe('invalid-json');
  });

  it('flags non-GeoJSON objects', () => {
    const parsed = parseGeoJsonSource({ name: 't', data: '{"foo": 1}', featureProperty: '', uploadedAt: '' });
    expect(parsed!.error).toBe('not-featurecollection');
  });
});

describe('geoJsonBBox', () => {
  it('computes the bounding box across features', () => {
    const parsed = parseGeoJsonSource({ name: 't', data: sample, featureProperty: 'governorate', uploadedAt: '' })!;
    const bbox = geoJsonBBox(parsed.features);
    expect(bbox).toEqual([39, 21, 47, 25]);
  });

  it('returns null for empty features', () => {
    expect(geoJsonBBox([])).toBeNull();
  });
});

describe('computeGeoJsonAutoFit', () => {
  it('adds a padded lat/lon range', () => {
    const parsed = parseGeoJsonSource({ name: 't', data: sample, featureProperty: 'governorate', uploadedAt: '' })!;
    const { geo } = computeGeoJsonAutoFit(parsed);
    expect(geo.lataxis.range[0]).toBeLessThan(21);
    expect(geo.lonaxis.range[1]).toBeGreaterThan(47);
  });
});
