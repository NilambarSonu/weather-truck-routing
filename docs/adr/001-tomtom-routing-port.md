# ADR 001: TomTom as Primary Truck Routing Provider with Clean Port Abstraction

## Context
Spotter's assessment requires generating 3 genuine route options with commercial truck profiles. OpenRouteService public API enforces a strict 100 km alternative route limit, failing on long-haul truck corridors. Other providers like Google Maps lack heavy vehicle dimension and weight axle parameters.

## Decision
We select TomTom Routing API as the primary live truck routing provider with a strict port interface (`RoutingProvider`). When an API key is absent, the system seamlessly falls back to a deterministic, high-fidelity synthetic corridor routing provider (`demo_routes.py` / `FixtureRoutingProvider`).

## Consequences
- Guarantees 3 distinct routes across any distance without API keys.
- Isolates routing logic from vendor payload schema changes.
- Allows pluggable swapping to HERE, OSRM, or internal routing engines.
