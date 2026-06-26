"""
Geocoder node — v3.

Extended query strategy per stop:
  1. Structured search: amenity="{name}" city="{city}"  ← NEW, most precise
  2. Free text: "{name}, {city}"
  3. Free text: "{name}" alone
  4. Free text: "{stripped name}, {city}"   (drops trailing generic words)
  5. Free text: "{stripped name}"
  6. Structured search with first word(s) only — catches transliteration mismatches
  7. City-centre fallback (coords_approximate=True, excluded from map routing)

All results are proximity-checked to within 50 km of the city centre,
so a wrong global match is rejected and the next query is tried.
"""

import logging
import re
from typing import Callable

from app.agent.geocode_client import NominatimGeocoder
from app.agent.state import AgentState

logger = logging.getLogger(__name__)

# Words stripped from the END of a place name to get a shorter search term.
# Keeping this conservative — only strip if it leaves at least 1 word.
_GENERIC_SUFFIXES = {
    "restaurant", "cafe", "café", "hotel", "market",
    "shop", "store", "eatery", "kitchen",
}

# Words stripped from ANYWHERE in the name that add noise for geocoding.
# We keep culturally meaningful words like "bazar", "ghat", "masjid", "bhobon"
# because Nominatim often knows them.
_NOISE_TOKENS = {"and", "the", "a", "&"}


def _stripped(name: str) -> str:
    """Drop trailing generic words: 'Durbin Bangla Restaurant' → 'Durbin Bangla'"""
    words = name.split()
    if len(words) <= 1:
        return name
    while len(words) > 1 and words[-1].lower().rstrip(".,") in _GENERIC_SUFFIXES:
        words.pop()
    return " ".join(words)


def _first_words(name: str, n: int = 2) -> str:
    """'Chhayanaut Shongshkriti-Bhobon' → 'Chhayanaut Shongshkriti'"""
    words = name.split()[:n]
    return " ".join(words)


def _dedupe(seq: list) -> list:
    seen, out = set(), []
    for x in seq:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def make_geocoder_node(geocoder: NominatimGeocoder) -> Callable[[AgentState], dict]:
    def geocoder_node(state: AgentState) -> dict:
        itinerary = state.get("itinerary")
        if not itinerary:
            return {"current_step": "geocoding_complete"}

        city  = state["city"]
        exact = approx = total = 0

        # Step 0 — resolve city centre; caches it for proximity filtering
        city_coords = geocoder.geocode_city(city)

        for day in itinerary.get("days", []):
            for stop in day.get("stops", []):
                total += 1
                name  = stop["name"]
                short = _stripped(name)
                first = _first_words(name, 2)

                coords = None

                # ── Strategy A: Nominatim structured search ───────────────
                # Splits name/city into separate fields — much more reliable
                # than free text for named amenities.
                for n in _dedupe([name, short, first]):
                    coords = geocoder.geocode_structured(n, city)
                    if coords:
                        logger.info("Geocoded '%s' via structured(%r, %r)", name, n, city)
                        break

                # ── Strategy B: free-text queries ─────────────────────────
                if not coords:
                    free_queries = _dedupe([
                        f"{name}, {city}",
                        name,
                        f"{short}, {city}" if short != name else None,
                        short              if short != name else None,
                        f"{first}, {city}" if first not in (name, short) else None,
                        first              if first not in (name, short) else None,
                    ])
                    for q in free_queries:
                        coords = geocoder.geocode(q)
                        if coords:
                            logger.info("Geocoded '%s' via free-text(%r)", name, q)
                            break

                if coords:
                    stop["latitude"], stop["longitude"] = coords
                    stop["coords_approximate"] = False
                    exact += 1
                else:
                    # City-centre fallback — shown as dashed pin, not routed
                    if city_coords:
                        stop["latitude"], stop["longitude"] = city_coords
                        stop["coords_approximate"] = True
                        approx += 1
                        logger.warning("Fell back to city centre for '%s'", name)
                    else:
                        stop["latitude"] = stop["longitude"] = None
                        stop["coords_approximate"] = False
                        logger.warning("No coords for '%s' or city '%s'", name, city)

        logger.info("Geocoder: %d exact + %d approx / %d total", exact, approx, total)

        # Remove stops that have no confirmed location — either approximate
        # (city-centre fallback) or completely missing coords.  Showing these
        # would place generic pins on the map and list places the user can't
        # actually find, which is worse than omitting them.
        removed = 0
        for day in itinerary.get("days", []):
            before = len(day["stops"])
            day["stops"] = [
                s for s in day["stops"]
                if s.get("latitude") is not None
                and s.get("longitude") is not None
                and not s.get("coords_approximate", False)
            ]
            removed += before - len(day["stops"])

        if removed:
            logger.warning(
                "Removed %d stop(s) with approximate or missing coordinates", removed
            )

        return {"itinerary": itinerary, "current_step": "geocoding_complete"}

    return geocoder_node
