import { describe, expect, it } from 'vitest';
import { MAP_BASEMAPS } from './mapProviders';
import { assignmentOnlyOverlay } from './emptyOverlay';

describe('mapProviders', () => {
  it('exposes streets and satellite without a hard-coded single vendor', () => {
    expect(MAP_BASEMAPS.streets.id).toBe('osm-streets');
    expect(MAP_BASEMAPS.satellite.id).toBe('esri-world-imagery');
    expect(MAP_BASEMAPS.streets.attribution).toMatch(/OpenStreetMap/);
    expect(MAP_BASEMAPS.satellite.attribution).toMatch(/Esri/);
  });
});

describe('assignmentOnlyOverlay', () => {
  it('never marks an assigned device without GPS as live', () => {
    const t = assignmentOnlyOverlay('QA-MAP-NONE', '356000000000001');
    expect(t.live).toBe(false);
    expect(t.freshness).toBe('none');
    expect(t.lat).toBeNull();
    expect(t.lng).toBeNull();
    expect(t.trail).toEqual([]);
    expect(t.unitId).toBe('QA-MAP-NONE');
  });
});

