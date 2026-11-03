# ADR 005: Precomputed Byte Matrices for 60 FPS Heatmap Scrubbing

## Context
Dragging a 0-48h forecast slider must never trigger network requests or lag the UI. Sending uncompressed JSON for 400 cells x 49 hours x 4 variables causes payload bloat (> 5 MB) and full React re-render jank.

## Decision
Compute all 49 hourly forecast frames server-side in a dedicated endpoint (`GET /api/v1/plans/{id}/heatmap`). Quantize intensities to a `uint8` matrix `[cells x 49]` (0-240 mapped continuous intensity) and transmit as base64 strings. The client decodes once and blends adjacent hourly frames directly inside deck.gl accessors using a precomputed 256-entry RGBA lookup table.

## Consequences
- Network payload is under 30 KB gzipped.
- Time scrubbing operates at a sustained 60 FPS without network calls.
- Heatmap loading is non-blocking (plan loads first, heatmap loads lazily).
