"""
Throwaway test script: search node in isolation.

Run from backend/: python scripts/test_search.py

Confirms Tavily returns real results, and that full-content extraction is
working for the top results of each angle.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tavily import TavilyClient

from app.agent.nodes.search import make_search_node
from app.config import load_settings

if __name__ == "__main__":
    settings = load_settings()
    client = TavilyClient(api_key=settings.tavily_api_key)
    search_node = make_search_node(client, search_depth="basic")

    # Hand-built fake planner output, so this test doesn't depend on the
    # planner node (and doesn't burn a Groq call) just to test search.
    test_state = {
        "research_angles": [
            {
                "angle": "tea garden hikes",
                "search_query": "Sylhet tea garden hiking trails blog",
            },
            {
                "angle": "local-favorite cheap eats",
                "search_query": "Sylhet local food reddit recommendations",
            },
        ],
        "errors": [],
    }

    result = search_node(test_state)

    # Print a trimmed summary rather than the full (potentially huge)
    # extracted content blobs.
    summary = [
        {
            "angle": r["angle"],
            "title": r["title"],
            "url": r["url"],
            "has_full_content": r["full_content"] is not None,
            "snippet_preview": r["snippet"][:120],
        }
        for r in result["raw_search_results"]
    ]
    print(json.dumps(summary, indent=2))
    print(f"\n--> {len(result['raw_search_results'])} total results.")
    print(f"--> Errors/warnings: {result['errors']}")
