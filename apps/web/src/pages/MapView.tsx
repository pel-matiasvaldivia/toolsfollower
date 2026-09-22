import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type MapAsset = { id: string; name: string; tier: string; last_lng?: number; last_lat?: number };
export type MapGeofence = { id: string; name: string; geometry: any };

const MENDOZA: [number, number] = [-68.8458, -32.8895];

const OSM_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function assetsFC(assets: MapAsset[]) {
  return {
    type: 'FeatureCollection',
    features: assets
      .filter((a) => a.last_lng != null && a.last_lat != null)
      .map((a) => ({
        type: 'Feature',
        properties: { name: a.name, tier: a.tier },
        geometry: { type: 'Point', coordinates: [a.last_lng, a.last_lat] },
      })),
  } as any;
}

function geofencesFC(geofences: MapGeofence[]) {
  return {
    type: 'FeatureCollection',
    features: geofences.map((g) => ({
      type: 'Feature',
      properties: { name: g.name },
      geometry: g.geometry,
    })),
  } as any;
}

export default function MapView({
  assets, geofences, picking, onPick,
}: {
  assets: MapAsset[];
  geofences: MapGeofence[];
  picking: boolean;
  onPick: (lng: number, lat: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Refs para leer props actuales dentro de callbacks del mapa.
  const assetsRef = useRef(assets); assetsRef.current = assets;
  const geofencesRef = useRef(geofences); geofencesRef.current = geofences;
  const pickingRef = useRef(picking); pickingRef.current = picking;

  // Init una sola vez.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: MENDOZA,
      zoom: 11,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('geofences', { type: 'geojson', data: geofencesFC([]) });
      map.addLayer({ id: 'geofences-fill', type: 'fill', source: 'geofences',
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'geofences-line', type: 'line', source: 'geofences',
        paint: { 'line-color': '#f59e0b', 'line-width': 2 } });

      map.addSource('assets', { type: 'geojson', data: assetsFC([]) });
      map.addLayer({ id: 'assets-dot', type: 'circle', source: 'assets',
        paint: {
          'circle-radius': 7,
          'circle-color': '#f59e0b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0e1116',
        } });
      map.addLayer({ id: 'assets-label', type: 'symbol', source: 'assets',
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.4],
          'text-anchor': 'top' },
        paint: { 'text-color': '#e5e7eb', 'text-halo-color': '#0e1116', 'text-halo-width': 1.5 } });

      readyRef.current = true;
      (map.getSource('assets') as any)?.setData(assetsFC(assetsRef.current));
      (map.getSource('geofences') as any)?.setData(geofencesFC(geofencesRef.current));
    });

    map.on('click', (e) => {
      if (pickingRef.current) onPickRef.current(e.lngLat.lng, e.lngLat.lat);
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, []);

  // Actualizar datos cuando cambian.
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    (mapRef.current.getSource('assets') as any)?.setData(assetsFC(assets));
  }, [assets]);

  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
    (mapRef.current.getSource('geofences') as any)?.setData(geofencesFC(geofences));
  }, [geofences]);

  // Cursor según modo.
  useEffect(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = picking ? 'crosshair' : '';
  }, [picking]);

  return <div ref={containerRef} className="h-[420px] w-full overflow-hidden rounded-xl border border-graphite-700" />;
}
