# ADR 003: Tolerance-Banded Lexicographic Route Ranking

## Context
Spotter's hierarchy prefers:
1. Fewest Severe miles
2. Fewest High miles
3. Lowest average risk
4. Shortest travel time

In pure lexicographic comparison, a trivial difference of 0.2 Severe miles can reject a route that saves 3 hours of driving and has 0 High miles. Pairwise epsilon equality is non-transitive with 3 routes and produces order-dependent evaluation anomalies.

## Decision
Implement a tolerance-banded filter relative to the best candidate in each tier:
- `eps_severe = max(2 mi, 0.015 * max_route_mi)`
- `eps_high = max(5 mi, 0.03 * max_route_mi)`
- `eps_avg = 0.05`
Routes with No Travel miles are hard-blocked unless all routes are blocked. A strict mode with `eps = 0` is preserved and selectable by the user.

## Consequences
- Evaluation is deterministic and invariant to input route order.
- Generates transparent, human-readable explanations of why the winning route was recommended.
