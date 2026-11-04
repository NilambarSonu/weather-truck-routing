import React, { useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { useTripStore } from '../state/useTripStore';
import { Checkpoint } from '../api/types';
import { RISK_COLORS, COLOR_RAMP_RGBA, formatDateTime } from '../lib/colors';
import { decodePolyline } from '../lib/polyline';

// Carto Positron Light Minimal Vector Tiles (Keyless, free, ultra-clean SaaS aesthetic)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

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
      center: [-98.5795, 39.8283], // Center of Contiguous US
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
      opacity: 0.42,
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

        // Crisp white casing layer for visual separation
        map.addLayer({
          id: casingLayerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#FFFFFF',
            'line-width': isSelected ? 8 : 5,
            'line-opacity': 0.9,
          },
        });

        // Main colored route line layer
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': isSelected ? '#4778D5' : '#94A3B8',
            'line-width': isSelected ? 5 : 3.5,
            'line-opacity': isSelected ? 1.0 : 0.65,
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
        map.setPaintProperty(lineLayerId, 'line-width', isSelected ? 5 : 3.5);
        map.setPaintProperty(lineLayerId, 'line-opacity', isSelected ? 1.0 : 0.65);
        map.setPaintProperty(lineLayerId, 'line-color', isSelected ? '#4778D5' : '#94A3B8');
      }
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 70, maxZoom: 12, duration: 900 });
    }
  };

  // Open Popup when checkpoint is clicked
  const handleCheckpointClick = (cp: Checkpoint) => {
    if (!mapRef.current) return;

    if (popupRef.current) popupRef.current.remove();

    const popupHtml = `
      <div class="p-3.5 font-sans text-xs bg-white text-saas-text rounded-xl max-w-xs shadow-saas-lg border border-saas-border">
        <div class="flex items-center justify-between pb-2 mb-2 border-b border-saas-border">
          <span class="font-bold text-sm text-saas-text">Checkpoint ${cp.index}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm" style="background-color: ${RISK_COLORS[cp.risk.overall]};">
            ${cp.risk.overall}
          </span>
        </div>

        <div class="space-y-1.5 mb-2.5">
          <div class="flex justify-between">
            <span class="text-saas-secondary">Corridor Mileage:</span>
            <span class="font-mono font-medium text-saas-text">${cp.dist_mi.toFixed(1)} mi (${cp.owned_mi.toFixed(1)} mi segment)</span>
          </div>
          <div class="flex justify-between">
            <span class="text-saas-secondary">Truck ETA:</span>
            <span class="font-mono text-saas-primary font-bold">${formatDateTime(cp.eta_utc)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-saas-secondary">Forecast Hour:</span>
            <span class="font-mono text-saas-secondary font-medium">${formatDateTime(cp.weather.forecast_hour_used)}</span>
          </div>
        </div>

        <div class="p-2.5 bg-saas-subtle rounded-lg border border-saas-border space-y-1 text-[11px]">
          <div class="flex justify-between">
            <span class="text-saas-secondary">Sustained Wind:</span>
            <span class="font-mono font-bold text-saas-text">${cp.weather.wind_mph.toFixed(1)} mph</span>
          </div>
          <div class="flex justify-between">
            <span class="text-saas-secondary">Peak Wind Gusts:</span>
            <span class="font-mono font-medium text-saas-text">${cp.weather.gust_mph.toFixed(1)} mph</span>
          </div>
          <div class="flex justify-between">
            <span class="text-saas-secondary">Precipitation:</span>
            <span class="font-mono font-medium text-saas-text">${cp.weather.rain_in_hr.toFixed(2)} in/hr</span>
          </div>
          <div class="flex justify-between">
            <span class="text-saas-secondary">Snowfall:</span>
            <span class="font-mono font-medium text-saas-text">${cp.weather.snow_in_hr.toFixed(2)} in/hr</span>
          </div>
        </div>

        ${
          cp.risk.load_rule_applied
            ? `<div class="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 font-medium">
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

      {/* Floating Checkpoints List on selected route (Interactive Pins) */}
      {selectedRoute && (
        <div className="absolute top-4 right-14 z-20 flex flex-col gap-1 max-h-48 overflow-y-auto bg-white/95 backdrop-blur p-2.5 rounded-2xl border border-saas-border shadow-saas-md w-48 pointer-events-auto">
          <span className="text-[10px] uppercase font-bold text-saas-muted px-1">
            Checkpoints ({selectedRoute.checkpoints.length})
          </span>
          {selectedRoute.checkpoints.map((cp) => (
            <button
              key={cp.index}
              onClick={() => handleCheckpointClick(cp)}
              onMouseEnter={() => setHoveredCheckpoint(cp)}
              onMouseLeave={() => setHoveredCheckpoint(null)}
              className="flex items-center justify-between px-2 py-1 rounded-lg text-xs hover:bg-saas-subtle text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-2 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: RISK_COLORS[cp.risk.overall] }}
                />
                <span className="font-mono text-saas-text text-[11px] font-medium">
                  Mi {cp.dist_mi.toFixed(0)}
                </span>
              </div>
              <span className="text-[10px] font-mono text-saas-secondary">
                {cp.risk.overall}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Map Legend */}
      <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur border border-saas-border rounded-2xl p-3 shadow-saas-md max-w-xs space-y-1.5 pointer-events-auto">
        <span className="text-[10px] font-bold text-saas-muted uppercase tracking-wider block">
          Weather Risk Index
        </span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2E9E5B] shadow-sm" />
            <span className="text-saas-text text-[11px]">Low (Safe)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] shadow-sm" />
            <span className="text-saas-text text-[11px]">Moderate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] shadow-sm" />
            <span className="text-saas-text text-[11px]">High Risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] shadow-sm" />
            <span className="text-saas-text text-[11px]">Severe</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2 pt-0.5 border-t border-saas-border">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#991B1B] shadow-sm" />
            <span className="text-red-700 font-semibold text-[11px]">No Travel (Hard Disqualification)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
