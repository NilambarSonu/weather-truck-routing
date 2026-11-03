import logging
from typing import List, Dict, Any, Optional
import httpx
from .base import GeocodeProvider

logger = logging.getLogger(__name__)

# Pre-indexed major US freight hubs for instant response
POPULAR_HUBS = [
    {"label": "Chicago, IL, USA", "lat": 41.8781, "lon": -87.6298},
    {"label": "Denver, CO, USA", "lat": 39.7392, "lon": -104.9903},
    {"label": "Dallas, TX, USA", "lat": 32.7767, "lon": -96.7970},
    {"label": "Los Angeles, CA, USA", "lat": 34.0522, "lon": -118.2437},
    {"label": "Atlanta, GA, USA", "lat": 33.7490, "lon": -84.3880},
    {"label": "New York, NY, USA", "lat": 40.7128, "lon": -74.0060},
    {"label": "Seattle, WA, USA", "lat": 47.6062, "lon": -122.3321},
    {"label": "Miami, FL, USA", "lat": 25.7617, "lon": -80.1918},
    {"label": "Kansas City, MO, USA", "lat": 39.0997, "lon": -94.5786},
    {"label": "Indianapolis, IN, USA", "lat": 39.7684, "lon": -86.1581},
    {"label": "Memphis, TN, USA", "lat": 35.1495, "lon": -90.0490},
    {"label": "Columbus, OH, USA", "lat": 39.9612, "lon": -82.9988},
    {"label": "Phoenix, AZ, USA", "lat": 33.4484, "lon": -112.0740},
    {"label": "Houston, TX, USA", "lat": 29.7604, "lon": -95.3698},
    {"label": "Salt Lake City, UT, USA", "lat": 40.7608, "lon": -111.8910},
    {"label": "Nashville, TN, USA", "lat": 36.1627, "lon": -86.7816},
    {"label": "St. Louis, MO, USA", "lat": 38.6270, "lon": -90.1994},
    {"label": "Minneapolis, MN, USA", "lat": 44.9778, "lon": -93.2650},
    {"label": "Philadelphia, PA, USA", "lat": 39.9526, "lon": -75.1652},
    {"label": "Charlotte, NC, USA", "lat": 35.2271, "lon": -80.8431},
]


class PhotonGeocodeProvider(GeocodeProvider):
    """
    Keyless geocoding provider using Photon / OSM with local fast-path hub caching.
    """

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is not None and not self._client.is_closed:
            return self._client
        return httpx.AsyncClient(timeout=5.0)

    async def suggest(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        q = (query or "").strip().lower()
        if not q:
            return POPULAR_HUBS[:limit]

        # Check local instant hub match
        local_matches = [
            hub for hub in POPULAR_HUBS
            if q in hub["label"].lower()
        ]
        if len(local_matches) >= limit:
            return local_matches[:limit]

        # Query Photon keyless API
        try:
            client = await self._get_client()
            resp = await client.get(
                "https://photon.komoot.io/api/",
                params={"q": query, "limit": limit, "lang": "en"},
            )
            if resp.status_code == 200:
                data = resp.json()
                features = data.get("features", [])
                results = []
                for f in features:
                    props = f.get("properties", {})
                    geom = f.get("geometry", {})
                    coords = geom.get("coordinates", [])
                    if len(coords) >= 2:
                        name = props.get("name", "")
                        city = props.get("city", "")
                        state = props.get("state", "")
                        country = props.get("country", "")

                        parts = [p for p in [name, city, state, country] if p]
                        label = ", ".join(dict.fromkeys(parts))
                        results.append({
                            "label": label or props.get("name", query),
                            "lat": round(coords[1], 4),
                            "lon": round(coords[0], 4),
                        })

                if results:
                    return results[:limit]
        except Exception as e:
            logger.warning(f"Photon geocoding error: {e}")

        # Return local matches or fallback hubs
        return local_matches[:limit] if local_matches else POPULAR_HUBS[:limit]


class TomTomGeocodeProvider(GeocodeProvider):
    """TomTom Geocoding adapter with fallback to Photon when API key is missing."""

    def __init__(self, api_key: Optional[str] = None, client: Optional[httpx.AsyncClient] = None):
        self.api_key = api_key
        self._fallback = PhotonGeocodeProvider(client=client)
        self._client = client

    async def suggest(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        if not self.api_key:
            return await self._fallback.suggest(query, limit)

        try:
            client = self._client or httpx.AsyncClient(timeout=5.0)
            url = f"https://api.tomtom.com/search/2/search/{query}.json"
            resp = await client.get(
                url,
                params={
                    "key": self.api_key,
                    "limit": limit,
                    "countrySet": "US",
                    "typeahead": "true",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for item in data.get("results", []):
                    pos = item.get("position", {})
                    address = item.get("address", {})
                    freeform = address.get("freeformAddress", "")
                    country = address.get("countryCodeISO3", "USA")
                    results.append({
                        "label": f"{freeform}, {country}",
                        "lat": round(pos.get("lat", 0.0), 4),
                        "lon": round(pos.get("lon", 0.0), 4),
                    })
                if results:
                    return results
        except Exception as e:
            logger.warning(f"TomTom geocoding failed: {e}")

        return await self._fallback.suggest(query, limit)
