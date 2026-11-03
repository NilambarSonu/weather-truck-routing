import React, { useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { useTripStore } from '../state/useTripStore';
import { Checkpoint } from '../api/types';
import { RISK_COLORS, COLOR_RAMP_RGBA, formatDateTime } from '../lib/colors';
import { decodePolyline } from '../lib/polyline';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const MapView: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const {
    plan,
    selectedRouteId,
    setHoveredCheckpoint,
    heatmapPayload,
    heatmapHour,
    activeLayer,
    showHeatmap,
  } = useTripStore();

  // Decode heatmap base64 matrices into Uint8Arrays once per payload
  const decodedMatrices = useMemo(() => {
    if (!heatmapPayload) return null;
    const layers = heatmapPayload.layers;
    const decodeB64 = (b64: string) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    };

    return {
      overall: decodeB64(layers.overall),
      wind: decodeB64(layers.wind),
      rain: decodeB64(layers.rain),
      snow: decodeB64(layers.snow),
      classes: decodeB64(layers.classes),
      hours: heatmapPayload.meta.hours || 49,
      cells: heatmapPayload.cells,
    };
  }, [heatmapPayload]);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [-98.5795, 39.8283], // Geographic center of US
      zoom: 4,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    const overlay = new MapboxOverlay({
      layers: [],
    });
    map.addControl(overlay as any);

    mapRef.current = map;
    deckOverlayRef.current = overlay;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update deck.gl H3HexagonLayer when heatmapHour, activeLayer, showHeatmap change
  useEffect(() => {
    if (!deckOverlayRef.current || !decodedMatrices || !showHeatmap) {
      if (deckOverlayRef.current) deckOverlayRef.current.setProps({ layers: [] });
      return;
    }

    const { hours, cells } = decodedMatrices;
    const matrix = decodedMatrices[activeLayer] || decodedMatrices.overall;

    const hFloor = Math.min(hours - 2, Math.max(0, Math.floor(heatmapHour)));
    const hCeil = hFloor + 1;
    const frac = heatmapHour - hFloor;

    const hexLayer = new H3HexagonLayer({
      id: 'h3-corridor-weather',
      data: cells,
      getHexagon: (d: string) => d,
      filled: true,
      extruded: false,
      wireframe: false,
      opacity: 0.55,
      getFillColor: (_: any, { index }: { index: number }) => {
        const idx0 = index * hours + hFloor;
        const idx1 = index * hours + hCeil;

        const val0 = matrix[idx0];
        const val1 = matrix[idx1];

        if (val0 === 255 || val1 === 255) return [0, 0, 0, 0];

        // Linear interpolation between the two adjacent hourly frames
        const blended = Math.round((1.0 - frac) * val0 + frac * val1);
        const rampOffset = blended * 4;

        return [
          COLOR_RAMP_RGBA[rampOffset],
          COLOR_RAMP_RGBA[rampOffset + 1],
          COLOR_RAMP_RGBA[rampOffset + 2],
          COLOR_RAMP_RGBA[rampOffset + 3],
        ];
      },
      updateTriggers: {
        getFillColor: [heatmapHour, activeLayer],
      },
      pickable: true,
    });

    deckOverlayRef.current.setProps({ layers: [hexLayer] });
  }, [decodedMatrices, heatmapHour, activeLayer, showHeatmap]);

  // Update GeoJSON route paths on MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plan) return;

    if (!map.isStyleLoaded()) {
      map.once('styledata', () => updateRouteLayers(map, plan, selectedRouteId));
    } else {
      updateRouteLayers(map, plan, selectedRouteId);
    }
  }, [plan, selectedRouteId]);

  const updateRouteLayers = (map: maplibregl.Map, currentPlan: typeof plan, selId: string | null) => {
    if (!currentPlan) return;

    // Bounds calculation
    const bounds = new maplibregl.LngLatBounds();

    currentPlan.routes.forEach((route) => {
      const sourceId = `route-source-${route.id}`;
      const casingLayerId = `route-casing-${route.id}`;
      const lineLayerId = `route-line-${route.id}`;

      // Decode polyline into GeoJSON coordinates [lon, lat]
      const pts = decodePolyline(route.geometry, 6);
      const coords = pts.map((p) => [p[1], p[0]]);

      coords.forEach((c) => bounds.extend(c as [number, number]));

      const geojsonData: GeoJSON.Feature = {
        type: 'Feature',
        properties: { id: route.id, label: route.label },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      };

      const isSelected = route.id === selId;

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          lineMetrics: true,
          data: geojsonData,
        });

        // Casing layer for visual separation
        map.addLayer({
          id: casingLayerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#0f172a',
            'line-width': isSelected ? 8 : 5,
            'line-opacity': 0.8,
          },
        });

        // Main colored line layer
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': isSelected ? '#3b82f6' : '#64748b',
            'line-width': isSelected ? 5 : 3,
            'line-opacity': isSelected ? 1.0 : 0.45,
          },
        });

        // Click to select route
        map.on('click', lineLayerId, () => {
          useTripStore.getState().setSelectedRouteId(route.id);
        });
      } else {
        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource;
        src.setData(geojsonData);

        map.setPaintProperty(casingLayerId, 'line-width', isSelected ? 8 : 5);
        map.setPaintProperty(lineLayerId, 'line-width', isSelected ? 5 : 3);
        map.setPaintProperty(lineLayerId, 'line-opacity', isSelected ? 1.0 : 0.45);
        map.setPaintProperty(lineLayerId, 'line-color', isSelected ? '#3b82f6' : '#64748b');
      }
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 1000 });
    }
  };

  // Open Popup when checkpoint is clicked
  const handleCheckpointClick = (cp: Checkpoint) => {
    if (!mapRef.current) return;

    if (popupRef.current) popupRef.current.remove();

    const popupHtml = `
      <div class="p-3 font-sans text-xs bg-slate-900 text-slate-100 rounded-lg max-w-xs shadow-2xl border border-slate-700">
        <div class="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
          <span class="font-bold text-sm text-slate-100">Checkpoint ${cp.index}</span>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold" style="background-color: ${RISK_COLORS[cp.risk.overall]}; color: ${cp.risk.overall === 'MODERATE' ? '#000' : '#fff'};">
            ${cp.risk.overall}
          </span>
        </div>

        <div class="space-y-1 mb-2">
          <div class="flex justify-between">
            <span class="text-slate-400">Mileage:</span>
            <span class="font-mono text-slate-200">${cp.dist_mi.toFixed(1)} mi (${cp.owned_mi.toFixed(1)} mi span)</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Truck ETA:</span>
            <span class="font-mono text-blue-400 font-semibold">${formatDateTime(cp.eta_utc)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Forecast Hour:</span>
            <span class="font-mono text-slate-300">${formatDateTime(cp.weather.forecast_hour_used)}</span>
          </div>
        </div>

        <div class="p-2 bg-slate-950 rounded border border-slate-800 space-y-1 text-[11px]">
          <div class="flex justify-between">
            <span class="text-slate-400">Sustained Wind:</span>
            <span class="font-mono font-bold">${cp.weather.wind_mph.toFixed(1)} mph</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Wind Gusts:</span>
            <span class="font-mono">${cp.weather.gust_mph.toFixed(1)} mph</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Precipitation:</span>
            <span class="font-mono">${cp.weather.rain_in_hr.toFixed(2)} in/hr</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Snowfall:</span>
            <span class="font-mono">${cp.weather.snow_in_hr.toFixed(2)} in/hr</span>
          </div>
        </div>

        ${
          cp.risk.load_rule_applied
            ? `<div class="mt-2 p-1.5 bg-amber-950/40 border border-amber-500/40 rounded text-[10px] text-amber-300">
                <strong>Load Rule Fired:</strong> ${cp.risk.load_rule_applied}
               </div>`
            : ''
        }
      </div>
    `;

    const popup = new maplibregl.Popup({ offset: 12, closeButton: true, className: 'custom-popup' })
      .setLngLat([cp.lon, cp.lat])
      .setHTML(popupHtml)
      .addTo(mapRef.current);

    popupRef.current = popup;
  };

  const selectedRoute = plan?.routes.find((r) => r.id === selectedRouteId) || plan?.routes[0];

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Checkpoint Markers Overlay for Selected Route */}
      {selectedRoute && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Markers are rendered natively or via DOM buttons */}
        </div>
      )}

      {/* Floating Checkpoints List on selected route (Interactive Pins) */}
      {selectedRoute && (
        <div className="absolute top-4 right-14 z-20 flex flex-col gap-1 max-h-48 overflow-y-auto bg-slate-900/90 backdrop-blur p-2 rounded-xl border border-slate-800 shadow-xl w-48 pointer-events-auto">
          <span className="text-[10px] uppercase font-bold text-slate-400 px-1">
            Checkpoints ({selectedRoute.checkpoints.length})
          </span>
          {selectedRoute.checkpoints.map((cp) => (
            <button
              key={cp.index}
              onClick={() => handleCheckpointClick(cp)}
              onMouseEnter={() => setHoveredCheckpoint(cp)}
              onMouseLeave={() => setHoveredCheckpoint(null)}
              className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-slate-800 text-left transition"
            >
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: RISK_COLORS[cp.risk.overall] }}
                />
                <span className="font-mono text-slate-300 text-[11px]">
                  Mi {cp.dist_mi.toFixed(0)}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {cp.risk.overall}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-xl max-w-xs space-y-2 pointer-events-auto">
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
          Weather Risk Index
        </span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#2E9E5B]" />
            <span className="text-slate-300">Low (Safe)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#F2C230]" />
            <span className="text-slate-300">Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#F08A24]" />
            <span className="text-slate-300">High Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#D93A2B]" />
            <span className="text-slate-300">Severe</span>
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <span className="w-3 h-3 rounded-sm bg-[#1B1B1B] border border-red-500" />
            <span className="text-red-400 font-semibold">No Travel (Hard Block)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
