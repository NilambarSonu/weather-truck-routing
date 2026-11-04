# Spotter Weather-Aware Truck Routing Platform

[![CI Pipeline](https://github.com/NilambarSonu/weather-truck-routing/actions/workflows/ci.yml/badge.svg)](https://github.com/NilambarSonu/weather-truck-routing/actions)
[![Live Production](https://img.shields.io/badge/Vercel-spotter.nilambarsonu.me-000000.svg?logo=vercel&logoColor=white)](https://spotter.nilambarsonu.me)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)
[![Django 5](https://img.shields.io/badge/django-5.1-green.svg)](https://www.djangoproject.com/)
[![React 18](https://img.shields.io/badge/react-18.3-cyan.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](https://www.typescriptlang.org/)
[![MapLibre GL](https://img.shields.io/badge/maplibre--gl-4.7-orange.svg)](https://maplibre.org/)
[![deck.gl](https://img.shields.io/badge/deck.gl-H3Hexagon-purple.svg)](https://deck.gl/)

> A production-grade web application that recommends the safest truck route among three genuinely distinct options by evaluating ETA-aligned multi-hazard weather forecasts, cargo weight escalation rules, mile-weighted hazard attribution, and a 60 FPS interactive corridor forecast slider.

---

## Live Product & Assessment Deliverables

- **Live Production Platform:** [https://spotter.nilambarsonu.me](https://spotter.nilambarsonu.me) *(Primary Custom Domain)*
- **Vercel Production Mirror:** [https://incomplete-six.vercel.app](https://incomplete-six.vercel.app)
- **Interactive OpenAPI 3 / Swagger Documentation:** [https://spotter.nilambarsonu.me/api/docs/](https://spotter.nilambarsonu.me/api/docs/)
- **Loom Video Walkthrough Script:** [docs/LOOM_SCRIPT.md](docs/LOOM_SCRIPT.md) *(Structured 8-minute presentation)*
- **GitHub Repository:** [https://github.com/NilambarSonu/weather-truck-routing](https://github.com/NilambarSonu/weather-truck-routing)
- **Architecture Decision Records:** [docs/adr/](docs/adr/)

---

## 1. High-Level Architecture & The 8 Crucial Decisions

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REACT 18 + TYPESCRIPT SPA                       │
│  TripForm (Autocomplete)  │  Route Cards (Deltas)  │  Hero Banner      │
│  MapLibre GL (Gradients)  │  deck.gl H3HexagonLayer │  0-48h Slider    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP (REST + Precomputed Matrices)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       DJANGO 5 REST FRAMEWORK (ASGI)                   │
│                                                                        │
│   ┌───────────────────────────────┐   ┌─────────────────────────────┐  │
│   │     PlanOrchestrator          │   │      HeatmapService         │  │
│   │  (Stages 1-10 Pipeline)       │   │   (Stage 11 Precomputation) │  │
│   └───────────────┬───────────────┘   └──────────────┬──────────────┘  │
│                   │                                  │                 │
│   ┌───────────────▼──────────────────────────────────▼──────────────┐  │
│   │                   PURE DOMAIN CORE (Zero I/O)                   │  │
│   │  • Geometry & Polyline6      • Cumulative Time Curve T(d)       │  │
│   │  • Checkpoints Placement     • Decimal Round-Half-Up Risk       │  │
│   │  • Half-Interval Attribution • Tolerant Lexicographic Ranking   │  │
│   └───────────────┬──────────────────────────────────┬──────────────┘  │
│                   │                                  │                 │
│   ┌───────────────▼───────────────┐   ┌──────────────▼──────────────┐  │
│   │       Provider Ports          │   │      Persistence Cache      │  │
│   │  • TomTom Routing (Truck)     │   │  • Immutable TripPlan Model │  │
│   │  • Open-Meteo Weather (Free)  │   │  • Coverage-aware Cell Cache│  │
│   │  • Keyless Demo Fallbacks     │   │  • Server-Timing Headers    │  │
│   └───────────────────────────────┘   └─────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### The 8 Architectural Decisions That Make the Difference

| # | Architectural Decision | Rationale & Practical Impact |
|---|---|---|
| **1** | **Weather as a Spatial Field** | Rather than querying weather at 180 individual checkpoints across 3 routes, every point snaps to an **Uber H3 hexagon** (`res=5` for trips &le;700 mi, `res=4` for longer trips). Unique cell count drops by 70%, preserving free quotas while guaranteeing checkpoints and heatmap never disagree. |
| **2** | **Cumulative Time Curve $T(d)$** | Instead of a naive $D / \text{speed}$ average, ETAs are derived from step-level duration curves. On a 1,000-mile trip, mountain passes and urban slowdowns alter the arrival hour, preventing severe misclassification. |
| **3** | **Exact Temporal Semantics** | Open-Meteo wind speed is an instantaneous point value at the hour mark (interpolated linearly), while rain and snow are cumulative sums over the preceding 60 minutes (assigned to the interval bucket $\lfloor t \rfloor + 3600$). |
| **4** | **Mile-Weighted Attribution** | Each checkpoint owns half the distance to its preceding neighbor and half to its succeeding neighbor. Severe and High metrics are computed in **physical miles**, holding the invariant: $\sum \text{miles}_i = \text{Route Length}$. |
| **5** | **Total Risk Function & Round-Half-Up** | Threshold comparisons use standard Decimal `ROUND_HALF_UP`. Prevents floating-point boundary anomalies (e.g. 34.96 mph rounds to 35.0 mph $\rightarrow$ High). |
| **6** | **Tolerance-Banded Lexicographic Ranking** | Follows the official 4-tier preference order (Severe mi $\rightarrow$ High mi $\rightarrow$ Avg Risk $\rightarrow$ Travel Time) but applies an epsilon tolerance relative to the tier best, preventing a 0.2-mile difference from rejecting a route saving 3 hours. |
| **7** | **Guaranteed 3 Distinct Routes** | Uses provider alternatives filtered by overlap ($\le 85\%$) and detour ($\le 1.6\times$), backed by lateral perpendicular via-point diversification and deterministic freight corridors. |
| **8** | **Precomputed Byte Matrix Heatmap** | 49 hourly corridor frames are precomputed server-side into a single `uint8` matrix transmitted as base64 under 30 KB. Scrubbing the slider triggers **zero network requests** and maintains a steady **60 FPS**. |

---

## 2. Ambiguity Register: Deliberate Engineering Decisions

| # | Spec Ambiguity | Implementation Decision | Engineering Rationale |
|---|---|---|---|
| **1** | *"Sample every 10 / 25 / 50 miles"* | Added **Auto** mode as default: 10 mi for trips $\le 250$ mi, 25 mi for $\le 800$ mi, 50 mi for $> 800$ mi. User can select fixed 10, 25, or 50 mi. | Keeps checkpoint count between 25 and 65 per route, balancing spatial resolution with network efficiency. |
| **2** | *Which wind value to classify* | Sustained 10-meter wind speed is classified against thresholds; gusts are recorded and shown in popups. | Standard meteorological practice: sustained wind dictates commercial truck stability. |
| **3** | *Precipitation units* | Liquid rain + showers in inches over the hour; snowfall depth in inches over the hour. | Direct match to official assessment table; avoids water-equivalent conversion drift. |
| **4** | *Boundary values (0.25, 1.0, 35 mph)* | Lower bound inclusive. On shared edges, more severe class wins (e.g. 0.25 in/hr rain = High). | Safety-first, unambiguous, and reproducible. |
| **5** | *Combining multi-hazards* | Overall checkpoint risk = $\max(\text{wind}, \text{rain}, \text{snow})$ after load rules. | Trucks are exposed to hazards simultaneously; the governing condition dictates safety. |
| **6** | *Departure time zone* | Input is interpreted in the origin local timezone and converted to UTC for weather lookup. | Long-haul trips cross 3+ time zones; displaying ETAs in local time ensures driver clarity. |
| **7** | *No Travel meaning* | Hard disqualification. Any route with No Travel miles cannot be recommended while an unblocked route exists. | Prevents unsafe dispatching. If all routes are blocked, recommends delaying departure. |

---

## 3. Official Assessment Risk Thresholds & Load Rules

### Hazard Threshold Table

| Risk Condition | Low (Safe) | Moderate (Caution) | High (Elevated) | Severe (Dangerous) | No Travel (Hard Block) |
|---|---|---|---|---|---|
| **Wind Speed** | $< 25.0\text{ mph}$ | $25.0 \le x < 35.0$ | $35.0 \le x < 45.0$ | $45.0 \le x < 55.0$ | $\ge 55.0\text{ mph}$ |
| **Rain (Precip)** | $< 0.10\text{ in/hr}$ | $0.10 \le x < 0.25$ | $0.25 \le x < 0.50$ | $0.50 \le x \le 1.00$ | $> 1.00\text{ in/hr}$ |
| **Snowfall** | $< 0.50\text{ in/hr}$ | $0.50 \le x < 1.00$ | $1.00 \le x < 2.00$ | $2.00 \le x \le 3.00$ | $> 3.00\text{ in/hr}$ |

### Cargo Load Escalation Rules

- **Wind $\ge 55\text{ mph}$:** $\rightarrow$ **No Travel** for every load weight.
- **Wind $45\text{–}54\text{ mph}$ with load $> 30,000\text{ lb}$:** $\rightarrow$ Escalates to **No Travel**.
- **Wind $35\text{–}44\text{ mph}$ with load $> 40,000\text{ lb}$:** $\rightarrow$ Escalates to **Severe**.

---

## 4. REST API Contract

| Method & Route | Purpose | Key Details |
|---|---|---|
| `GET /api/v1/geocode?q=...&limit=5` | Place autocomplete suggestions | Keyless Photon / OSM with local fast-path hub caching. |
| `POST /api/v1/plans` | Create weather-evaluated routing plan | Evaluates 3 routes, checkpoints, risk, metrics, and recommendation. Emits `Server-Timing`. |
| `GET /api/v1/plans/{id}` | Retrieve immutable snapshot | Powers shareable URLs and plan replays. |
| `GET /api/v1/plans/{id}/heatmap` | 49-hour corridor forecast frames | Precomputed base64 uint8 matrices for 60 FPS slider. |
| `GET /api/v1/health` | Service health & active provider status | Liveness check used by container orchestrators. |
| `GET /api/schema/` | OpenAPI 3.0 schema | Formal API specification. |

---

## 5. Automated Test Suite & Invariants

Testing is comprehensive and verified across unit, property, and integration layers:

```bash
# Run backend test suite (25 tests)
cd backend
.venv/bin/pytest -v
```

### Verified Test Vectors & Invariants
1. **Golden Table (18 Vectors):** Tests every boundary edge, decimal round-half-up transition, and wind/load escalation rule.
2. **Checkpoint Metric Invariant:** Asserts $\sum \text{owned\_mi}_i == \text{Total Route Miles}$.
3. **Risk Tier Sum Invariant:** Asserts $\text{severe\_mi} + \text{high\_mi} + \text{moderate\_mi} + \text{low\_mi} + \text{no\_travel\_mi} == \text{Total Miles}$.
4. **ETA Monotonicity:** Asserts that checkpoint arrival times are strictly non-decreasing along the route.
5. **No Travel Hard Block:** Asserts that a route with No Travel miles is never recommended over an unblocked option.

```bash
# Run frontend unit tests (6 tests)
cd frontend
npm test
```

---

## 6. Quick Start & Local Execution

### Prerequisites
- Node.js $\ge 20$
- Python $\ge 3.12$ (or Docker)

### Option A: Local Development

```bash
# 1. Clone repository
git clone https://github.com/NilambarSonu/weather-truck-routing.git
cd weather-truck-routing

# 2. Setup backend virtualenv
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate

# 3. Setup frontend
cd ../frontend
npm install
npm run build

# 4. Run full-stack service (serves both API and compiled SPA)
cd ../backend
python manage.py runserver 127.0.0.1:8000
```
Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

### Option B: Docker Compose

```bash
docker compose up --build
```
Open [http://localhost:8000](http://localhost:8000).

---

## 7. Keyless Demo vs Live Provider Architecture

The application is engineered to be **100% functional out of the box without requiring paid or restricted API credentials**, while seamlessly integrating enterprise providers in production:

- **Weather:** Connected to **Open-Meteo**, providing live multi-hazard hourly forecasts across the Continental United States.
- **Geocoding:** Powered by **Photon / OpenStreetMap**, providing instant place autocomplete without API rate limits or keys.
- **Commercial Truck Routing:** Configured with **TomTom Truck Routing API** (`TOMTOM_API_KEY`) for true commercial truck geometries, speed curves, and bridge/weight restrictions. Active and verified on the live deployment.
- **Keyless Demo Fallback:** If API credentials are not present in a local environment, the system automatically activates high-fidelity synthetic corridor generators with step-level time curves, ensuring zero setup friction.

---

## 8. License & Attribution

- Weather data powered by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
- Map tiles by Carto / OpenStreetMap contributors.
- Geocoding powered by Photon / OpenStreetMap.
