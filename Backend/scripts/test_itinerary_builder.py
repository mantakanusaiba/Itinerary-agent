"""
Throwaway test script: itinerary builder node in isolation.

Run from backend/: python scripts/test_itinerary_builder.py

Confirms valid structured JSON output (validated against the Itinerary
Pydantic schema by the node itself — this script just prints the result).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from groq import Groq

from app.agent.nodes.itinerary_builder import make_itinerary_builder_node
from app.config import load_settings

if __name__ == "__main__":
    settings = load_settings()
    client = Groq(api_key=settings.groq_api_key)
    itinerary_node = make_itinerary_builder_node(client, settings.groq_model)

    # Hand-built fake critic output, so this test doesn't depend on the
    # planner/search/critic nodes just to test the builder.
    test_state = {
        "city": "Sylhet",
        "days": 2,
        "vibe": "nature lover, budget",
        "filtered_sources": [
            {
                "url": "https://example-blog.com/sylhet-lalakhal-hike",
                "title": "We got lost finding the Lalakhal trailhead",
                "angle": "tea garden hikes",
                "content": (
                    "The actual trailhead is about 200 meters past a blue tea "
                    "stall where Google Maps drops you at a locked gate. Bring "
                    "water — nowhere to buy any after the stall. Best in early "
                    "morning before it gets hot."
                ),
                "reason_kept": "First-person account with specific, checkable navigation detail.",
            },
            {
                "url": "https://forum-example.com/thread/sylhet-food-locals",
                "title": "Sylhet food thread - locals only please",
                "angle": "local-favorite cheap eats",
                "content": (
                    "Panshi restaurant near Zindabazar, get the shutki bhorta, "
                    "about 80 taka, tiny easy-to-miss place, goes fast before 1pm."
                ),
                "reason_kept": "Specific price, dish, and timing detail from a real visit.",
            },
        ],
    }

    result = itinerary_node(test_state)
    print(json.dumps(result, indent=2))
    print(f"\n--> {len(result['itinerary']['days'])} day(s) produced (expected 2).")
