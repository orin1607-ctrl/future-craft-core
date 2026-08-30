/**
 * Modular basemap registry. FleetOS reads from here so OSM/Esri can be
 * swapped for MapTiler / Mapbox / Google later without rewriting the map UI.
 */
export type MapBasemapId = 'streets' | 'satellite';

export interface MapTileProvider {
  id: string;
  labelHe: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
}

export const MAP_BASEMAPS: Record<MapBasemapId, MapTileProvider> = {
  streets: {
    id: 'osm-streets',
    labelHe: 'רחובות',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: 'abc',
  },
  satellite: {
    id: 'esri-world-imagery',
    labelHe: 'לוויין',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
};

export const DEFAULT_MAP_VIEW = {
  center: [31.5, 34.85] as [number, number],
  zoom: 8,
};
