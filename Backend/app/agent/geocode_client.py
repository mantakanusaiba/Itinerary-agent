"""
Thin wrapper around OpenStreetMap's Nominatim geocoding API.

Nominatim is free and requires no API key, which is why it's used here
instead of Google/Mapbox geocoding (both need a credit card on file even on
their free tiers).

Docs / usage policy: https://operations.osmfoundation.org/policies/nominatim/

ACCURACY:
  Every result is checked to be within MAX_KM_FROM_CITY km of the city
  centre before being accepted. This prevents Nominatim from returning a
  match in Morocco for "Cafe Jannat" when the city is Dhaka.

  We also use Nominatim's structured `city=` parameter as a secondary
  strategy so that ambiguous names are scoped to the right city even
  when a free-text query returns nothing nearby.
"""

import logging
import math
import time

import requests

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT    = "local-guide-agent-portfolio-project/1.0"

MIN_SECONDS_BETWEEN_REQUESTS = 1.1   # Nominatim policy: ~1 req/s
MAX_KM_FROM_CITY             = 50.0  # reject results further than this


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class NominatimGeocoder:
    def __init__(self) -> None:
        self._last_request_time: float = 0.0
        self.city_coords: tuple[float, float] | None = None

    def _respect_rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < MIN_SECONDS_BETWEEN_REQUESTS:
            time.sleep(MIN_SECONDS_BETWEEN_REQUESTS - elapsed)

    def _fetch(self, params: dict) -> list:
        """Raw Nominatim fetch — returns [] on any failure."""
        self._respect_rate_limit()
        try:
            r = requests.get(
                NOMINATIM_URL,
                params={**params, "format": "json"},
                headers={"User-Agent": USER_AGENT},
                timeout=10,
            )
            self._last_request_time = time.monotonic()
            r.raise_for_status()
            return r.json() or []
        except Exception:
            logger.warning("Nominatim request failed params=%r", params, exc_info=True)
            return []

    def _best_nearby(self, results: list) -> tuple[float, float] | None:
        """
        Return the first result that is within MAX_KM_FROM_CITY of the
        known city centre, or the first result if city_coords is not set.
        """
        for r in results:
            try:
                lat, lon = float(r["lat"]), float(r["lon"])
            except (KeyError, ValueError, TypeError):
                continue

            if self.city_coords is not None:
                d = _haversine_km(lat, lon, self.city_coords[0], self.city_coords[1])
                if d > MAX_KM_FROM_CITY:
                    logger.debug("Rejected result %.1f km away: %s", d, r.get("display_name", "?")[:60])
                    continue

            return lat, lon
        return None

    def geocode(self, query: str) -> tuple[float, float] | None:
        """
        Free-text query. Fetches up to 5 candidates and returns the nearest
        one within the city radius.
        """
        results = self._fetch({"q": query, "limit": 5})
        return self._best_nearby(results)

    def geocode_structured(self, name: str, city: str, country: str = "") -> tuple[float, float] | None:
        """
        Nominatim structured search: splits the query into amenity/city/country
        fields which gives much better results for named places that get lost
        in a free-text search.
        """
        params: dict = {"amenity": name, "city": city, "limit": 5}
        if country:
            params["country"] = country
        results = self._fetch(params)
        coords = self._best_nearby(results)
        if coords:
            return coords

        # Also try with just street= instead of amenity= — some places are
        # stored as streets/areas, not amenities
        params2: dict = {"street": name, "city": city, "limit": 5}
        if country:
            params2["country"] = country
        results2 = self._fetch(params2)
        return self._best_nearby(results2)

    def geocode_city(self, city: str) -> tuple[float, float] | None:
        """
        Resolve the city itself (no proximity filter) and cache city_coords.
        """
        results = self._fetch({"q": city, "limit": 3})
        for r in results:
            try:
                lat, lon = float(r["lat"]), float(r["lon"])
                self.city_coords = (lat, lon)
                logger.info("City centre: %s → (%.4f, %.4f)", city, lat, lon)
                return lat, lon
            except (KeyError, ValueError, TypeError):
                continue
        logger.warning("Could not resolve city centre for: %s", city)
        return None
