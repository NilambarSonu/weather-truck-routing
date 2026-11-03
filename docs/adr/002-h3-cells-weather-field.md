# ADR 002: H3 Hexagonal Grid as Unified Weather Field

## Context
A long-haul truck route can have 3 routes x 60 checkpoints = 180 points. Requesting weather per checkpoint across 48 hours exceeds free provider rate limits. Furthermore, checkpoints and the corridor heatmap could drift or show conflicting weather if evaluated independently.

## Decision
Treat weather as a spatial-temporal field indexed by Uber H3 hexagonal cells (`res=5` for trips <= 700 mi, `res=4` for > 700 mi). Checkpoints snap to their containing H3 cell, and the corridor heatmap spans the cell union.

## Consequences
- Total distinct API locations drop by 65-75%, preserving free quotas.
- Checkpoints and the heatmap always read identical, consistent forecast data.
- Cell forecasts are cached deterministically with coverage intervals.
