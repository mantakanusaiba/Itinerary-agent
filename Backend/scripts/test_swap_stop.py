"""
Throwaway test script: stop-swap handler in isolation.

Run from backend/: python scripts/test_swap_stop.py

Confirms a replacement stop is grounded in one of the provided sources and
doesn't just repeat the stop being replaced.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from groq import Groq

from app.agent.state import FilteredSource, ItineraryStop
from app.agent.stop_swap import make_swap_handler
from app.config import load_settings

if __name__ == "__main__":
    settings = load_settings()
    client = Groq(api_key=settings.groq_api_key)
    swap_handler = make_swap_handler(client, settings.groq_model)

    stop_to_replace = ItineraryStop(
        name="Lalakhal Trailhead",
        time="7:00 AM",
        duration_minutes=240,
        description="Hike the Lalakhal trail",
        why_not_touristy="Requires specific navigation, off the beaten path",
        source_reference="https://example-blog.com/sylhet-lalakhal-hike",
    )

    filtered_sources = [
        FilteredSource(
            url="https://example-blog.com/sylhet-lalakhal-hike",
            title="We got lost finding the Lalakhal trailhead",
            angle="tea garden hikes",
            content="Details about Lalakhal hike, the same one being replaced.",
            reason_kept="First-person account.",
        ),
        FilteredSource(
            url="https://forum-example.com/thread/sylhet-food-locals",
            title="Sylhet food thread - locals only please",
            angle="local-favorite cheap eats",
            content=(
                "Panshi restaurant near Zindabazar, get the shutki bhorta, "
                "about 80 taka, tiny easy-to-miss place, goes fast before 1pm."
            ),
            reason_kept="Specific price, dish, and timing detail from a real visit.",
        ),
    ]

    new_stop = swap_handler(
        city="Sylhet",
        vibe="nature lover, budget",
        day_theme="Nature Exploration",
        other_stops=[],
        stop_to_replace=stop_to_replace,
        filtered_sources=filtered_sources,
    )

    print(json.dumps(new_stop.model_dump(), indent=2))

    if new_stop.name.strip().lower() == stop_to_replace.name.strip().lower():
        print("\n--> WARNING: swap returned the same stop it was meant to replace.")
    else:
        print(f"\n--> PASS: replaced '{stop_to_replace.name}' with '{new_stop.name}'.")
