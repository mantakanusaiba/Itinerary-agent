"""
Throwaway test script: geocoder node in isolation.

Run from backend/: python scripts/test_geocoder.py

No API keys needed — Nominatim doesn't require one. Confirms real lat/lng
get attached to stops, and that an unfindable stop degrades gracefully
(falls back to city-level coordinates) instead of crashing.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agent.geocode_client import NominatimGeocoder
from app.agent.nodes.geocoder import make_geocoder_node

if __name__ == "__main__":
    geocoder_node = make_geocoder_node(NominatimGeocoder())

    test_state = {
        "city": "Sylhet",
        "itinerary": {
            "days": [
                {
                    "day_number": 1,
                    "theme": "Nature",
                    "stops": [
                        {
                            "name": "Lalakhal",
                            "time": "7:00 AM",
                            "duration_minutes": 240,
                            "description": "Hike",
                            "why_not_touristy": "test",
                            "source_reference": "https://example.com",
                        },
                        {
                            "name": "Definitely Not A Real Place Asdkjhasd",
                            "time": "1:00 PM",
                            "duration_minutes": 60,
                            "description": "test fallback behavior",
                            "why_not_touristy": "test",
                            "source_reference": "https://example.com",
                        },
                    ],
                }
            ]
        },
    }

    result = geocoder_node(test_state)
    print(json.dumps(result, indent=2))
