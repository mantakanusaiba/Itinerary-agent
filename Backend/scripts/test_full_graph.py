"""
End-to-end test script: full graph, real APIs.

Run from backend/: python scripts/test_full_graph.py

This is the "3 days in Sylhet, nature lover, budget" scenario from the
original spec. Prints the full itinerary plus the kept/rejected sources
with their justifications, so you can sanity-check the whole pipeline at
once.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agent.graph import build_graph
from app.agent.state import AgentState
from app.config import load_settings

if __name__ == "__main__":
    settings = load_settings()
    graph = build_graph(settings)

    initial_state: AgentState = {
        "city": "Sylhet",
        "days": 3,
        "vibe": "nature lover, budget",
        "errors": [],
    }

    print(f"Running full graph for: {initial_state['city']}, "
          f"{initial_state['days']} days, vibe='{initial_state['vibe']}'\n")

    final_state = None
    for state_update in graph.stream(initial_state, stream_mode="values"):
        step = state_update.get("current_step")
        if step:
            print(f"[step] {step}")
        final_state = state_update

    print("\n=== RESEARCH ANGLES ===")
    print(json.dumps(final_state.get("research_angles", []), indent=2))

    print("\n=== FILTERED (KEPT) SOURCES ===")
    print(json.dumps(final_state.get("filtered_sources", []), indent=2))

    print("\n=== REJECTED SOURCES ===")
    print(json.dumps(final_state.get("rejected_sources", []), indent=2))

    print("\n=== ITINERARY ===")
    print(json.dumps(final_state.get("itinerary", {}), indent=2))

    print("\n=== WARNINGS/ERRORS ENCOUNTERED ===")
    print(json.dumps(final_state.get("errors", []), indent=2))
