import { Place, TripPlanRequest, TripPlan, HeatmapPayload } from './types';

const API_BASE = '/api/v1';

export async function geocodePlaces(query: string): Promise<Place[]> {
  if (!query || query.trim().length === 0) return [];
  const res = await fetch(`${API_BASE}/geocode?q=${encodeURIComponent(query)}&limit=5`);
  if (!res.ok) throw new Error('Failed to fetch place suggestions');
  return res.json();
}

export async function createTripPlan(request: TripPlanRequest): Promise<TripPlan> {
  const res = await fetch(`${API_BASE}/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => null);
    const detail = errorJson?.detail || errorJson?.errors ? JSON.stringify(errorJson.errors) : `HTTP ${res.status}`;
    throw new Error(detail);
  }

  return res.json();
}

export async function getTripPlan(planId: string): Promise<TripPlan> {
  const res = await fetch(`${API_BASE}/plans/${encodeURIComponent(planId)}`);
  if (!res.ok) throw new Error(`Trip plan ${planId} not found`);
  return res.json();
}

export async function getHeatmap(planId: string): Promise<HeatmapPayload> {
  const res = await fetch(`${API_BASE}/plans/${encodeURIComponent(planId)}/heatmap`);
  if (!res.ok) throw new Error('Failed to load corridor heatmap');
  return res.json();
}

export async function getHealth(): Promise<any> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}
