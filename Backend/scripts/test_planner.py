"""
Throwaway test script: planner node in isolation.

Run from backend/: python scripts/test_planner.py

Confirms the planner returns sensible, vibe-specific research angles (not
generic "things to do" angles) for a test input.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from groq import Groq

from app.agent.nodes.planner import make_planner_node
from app.config import load_settings

if __name__ == "__main__":
    settings = load_settings()
    client = Groq(api_key=settings.groq_api_key)
    planner_node = make_planner_node(client, settings.groq_model)

    test_state = {
        "city": "Sylhet",
        "days": 3,
        "vibe": "nature lover, budget",
    }

    result = planner_node(test_state)
    print(json.dumps(result, indent=2))

    print(f"\n--> {len(result['research_angles'])} angles produced.")
    print("--> Eyeball check: are these specific to 'nature lover, budget',")
    print("    or do they look like generic 'things to do' angles?")
