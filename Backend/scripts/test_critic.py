"""
Throwaway test script: critic node in isolation.

Run from backend/: python scripts/test_critic.py

This is the most important node to verify carefully. The test input below
is hand-built with an OBVIOUS mix: two sources that read like genuine
first-person local write-ups, and two that are deliberately generic
SEO-listicle bait. If the critic doesn't reject at least the listicle ones,
that's a real signal to iterate on CRITIC_SYSTEM_PROMPT in prompts.py —
don't treat "approved everything" as a passing result.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from groq import Groq

from app.agent.nodes.critic import make_critic_node
from app.config import load_settings

if __name__ == "__main__":
    settings = load_settings()
    client = Groq(api_key=settings.groq_api_key)
    critic_node = make_critic_node(client, settings.groq_model)

    test_state = {
        "raw_search_results": [
            # --- Should plausibly be KEPT: specific, first-person ---
            {
                "angle": "tea garden hikes",
                "query": "Sylhet tea garden hiking trails blog",
                "url": "https://example-blog.com/sylhet-lalakhal-hike",
                "title": "We got lost finding the Lalakhal trailhead (here's the actual turn)",
                "snippet": (
                    "Google Maps drops you at a closed gate. The real path starts "
                    "about 200m further down, past the blue tea stall — ask for "
                    "'Lalakhal hilly road' if you get confused like we did."
                ),
                "full_content": (
                    "We got to Sylhet around 7am and headed straight for Lalakhal. "
                    "Google Maps drops you at a gate that's usually locked. The "
                    "actual trailhead is about 200 meters further down the main "
                    "road, just past a blue tea stall run by an older guy who'll "
                    "point you the right way if you ask for 'Lalakhal hilly road.' "
                    "Took us about 40 minutes longer than expected because of this. "
                    "Bring water — there's nowhere to buy any after the stall."
                ),
            },
            {
                "angle": "local-favorite cheap eats",
                "query": "Sylhet local food reddit recommendations",
                "url": "https://forum-example.com/thread/sylhet-food-locals",
                "title": "Sylhet food thread - locals only please",
                "snippet": (
                    "Panshi restaurant near Zindabazar, get the shutki bhorta, "
                    "costs like 80 taka, tiny place easy to miss"
                ),
                "full_content": (
                    "OP asked for non-touristy food. Panshi near Zindabazar — "
                    "tiny place, easy to walk past. Get the shutki bhorta, was "
                    "about 80 taka last time I went (a few months ago). Goes "
                    "fast around lunch so go before 1pm or you'll wait."
                ),
            },
            # --- Should plausibly be REJECTED: generic listicle bait ---
            {
                "angle": "tea garden hikes",
                "query": "Sylhet tea garden hiking trails blog",
                "url": "https://travel-listicle-example.com/top-10-sylhet",
                "title": "Top 10 Must-Visit Hidden Gems in Sylhet You Cannot Miss",
                "snippet": (
                    "Sylhet is a beautiful destination with many hidden gems and "
                    "must-visit attractions for every traveler."
                ),
                "full_content": (
                    "Sylhet is a beautiful destination with many hidden gems and "
                    "must-visit attractions for every traveler. From breathtaking "
                    "tea gardens to stunning natural beauty, Sylhet has something "
                    "for everyone. Here are the top 10 places you absolutely "
                    "cannot miss on your trip to this amazing city. Number 1: Tea "
                    "Gardens - a must-visit hidden gem offering breathtaking views."
                ),
            },
            {
                "angle": "local-favorite cheap eats",
                "query": "Sylhet local food reddit recommendations",
                "url": "https://generic-travel-site.com/best-food-sylhet",
                "title": "Best Restaurants in Sylhet: Ultimate Foodie Guide",
                "snippet": (
                    "Discover the best restaurants in Sylhet with our ultimate "
                    "foodie guide featuring top-rated dining experiences."
                ),
                "full_content": (
                    "Discover the best restaurants in Sylhet with our ultimate "
                    "foodie guide. Sylhet offers a diverse culinary scene with "
                    "something for every palate. Whether you're looking for fine "
                    "dining or casual eats, this guide has you covered with the "
                    "top-rated dining experiences the city has to offer."
                ),
            },
        ],
        "errors": [],
    }

    result = critic_node(test_state)

    print("=== KEPT ===")
    print(json.dumps(result["filtered_sources"], indent=2))
    print("\n=== REJECTED ===")
    print(json.dumps(result["rejected_sources"], indent=2))

    kept_urls = {s["url"] for s in result["filtered_sources"]}
    rejected_urls = {s["url"] for s in result["rejected_sources"]}
    print(f"\n--> Kept: {len(kept_urls)}, Rejected: {len(rejected_urls)}")
    if "https://travel-listicle-example.com/top-10-sylhet" in rejected_urls:
        print("--> PASS: obvious listicle source was rejected.")
    else:
        print("--> WARNING: obvious listicle source was NOT rejected — iterate on the prompt.")
