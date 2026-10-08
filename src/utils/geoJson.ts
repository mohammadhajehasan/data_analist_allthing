import type { GeoJsonSource } from '../types';

export interface ParsedGeoJson {
  /** Parsed FeatureCollection object ready to hand to Plotly */
  json: any;
  /** Feature array (empty if invalid) */
  features: any[];
  /** The properties key used to label features (from the widget's GeoJsonSource) */
  featureProperty: string;
  /** First few sample names to help the user pick the right property */
  sampleNames: string[];
  /** All candidate property keys found across the first few features */
  candidateProperties: string[];
  error?: string;
}

/**
 * Parses a user-uploaded GeoJsonSource into a validated FeatureCollection.
 * Accepts a raw FeatureCollection or a single Feature and normalizes it.
 */
export function parseGeoJsonSource(src: GeoJsonSource): ParsedGeoJson | null {
  if (!src || !src.data) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(src.data);
  } catch {
    return {
      json: null,
      features: [],
      featureProperty: src.featureProperty || '',
      sampleNames: [],
      candidateProperties: [],
      error: 'invalid-json',
    };
  }
  // Normalize single Feature / bare geometry into a FeatureCollection
  if (parsed.type === 'Feature') {
    parsed = { type: 'FeatureCollection', features: [parsed] };
  } else if (parsed.type && parsed.type !== 'FeatureCollection' && (parsed.coordinates || parsed.geometries)) {
    // Bare geometry — wrap it
    parsed = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: parsed }] };
  }
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    return {
      json: null,
      features: [],
      featureProperty: src.featureProperty || '',
      sampleNames: [],
      candidateProperties: [],
      error: 'not-featurecollection',
    };
  }
  const features: any[] = parsed.features.filter(
    (f: any) => f && (f.type === 'Feature' || f.geometry)
  );

  // Collect candidate property keys from the first features
  const keys = new Set<string>();
  const sampleNames: string[] = [];
  features.slice(0, 20).forEach((f: any) => {
    const props = f.properties || {};
    Object.keys(props).forEach(k => {
      const v = props[k];
      if (typeof v === 'string' || typeof v === 'number') keys.add(k);
    });
  });
  features.slice(0, 5).forEach((f: any) => {
    const v = f.properties?.[src.featureProperty];
    if (v !== undefined && v !== null && sampleNames.length < 5) sampleNames.push(String(v));
  });

  return {
    json: { ...parsed, features },
    features,
    featureProperty: src.featureProperty || '',
    sampleNames,
    candidateProperties: Array.from(keys).slice(0, 20),
  };
}

/** Bounding box [w, s, e, n] across all feature coordinates */
export function geoJsonBBox(features: any[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  let has = false;
  const visit = (coords: any) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords;
      if (x < w) w = x;
      if (y < s) s = y;
      if (x > e) e = x;
      if (y > n) n = y;
      has = true;
      return;
    }
    coords.forEach(visit);
  };
  features.forEach(f => visit(f?.geometry?.coordinates));
  if (!has) return null;
  return [w, s, e, n];
}

/**
 * Plotly geo layout settings that auto-fit the map to the GeoJSON extent:
 * `{ geo: { lataxis: {range:[..]}, lonaxis: {range:[..]}, fitbounds: false } }`
 */
export function computeGeoJsonAutoFit(parsed: ParsedGeoJson): { geo: any } {
  const bbox = geoJsonBBox(parsed.features);
  if (!bbox) return { geo: {} };
  const [w, s, e, n] = bbox;
  const padLat = Math.max((n - s) * 0.05, 0.2);
  const padLon = Math.max((e - w) * 0.05, 0.2);
  return {
    geo: {
      lataxis: { range: [Math.max(s - padLat, -90), Math.min(n + padLat, 90)] },
      lonaxis: { range: [Math.max(w - padLon, -180), Math.min(e + padLon, 180)] },
    },
  };
}
