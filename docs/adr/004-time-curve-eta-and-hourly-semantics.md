# ADR 004: Cumulative Time Curve T(d) and Preceding-Hour Temporal Semantics

## Context
Assuming constant average speed places trucks in incorrect forecast hours on 1,000+ mile routes where terrain, mountain passes, and urban congestion alter driving pace. Additionally, Open-Meteo wind is an instantaneous point value at the hour mark, whereas rain and snowfall are cumulative sums over the preceding 60 minutes.

## Decision
1. Construct a monotone cumulative driving time curve $T(d)$ from step durations.
2. For wind: apply linear interpolation between hour marks:
   $$W(t) = (1 - f) \cdot W_{\text{floor}} + f \cdot W_{\text{ceil}}$$
3. For rain and snow: select the preceding-hour interval bucket:
   $$\text{Label}(t) = \text{floor}(t) + 3600$$

## Consequences
- Prevents 1-hour time shifts that corrupt risk scoring.
- Accurately aligns truck arrival with localized moving weather fronts.
