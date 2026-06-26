"""
Image fetcher node.

source.unsplash.com was shut down in 2023 — all those URLs return 404.
This node now just sets image_url = None for every stop so the frontend
falls through to its own Wikipedia browser-fetch (in ItineraryView.jsx),
which is CORS-enabled and actually works.

Why not fetch from the backend?
  Nominatim and Wikimedia Commons both block server-side requests from
  many hosting environments. The browser fetch in ItineraryView.jsx uses
  origin=* CORS and works from any user's browser regardless of where
  the backend is hosted. Keeping the fetch client-side is more reliable.
"""

from typing import Callable
from app.agent.state import AgentState


def make_image_fetcher_node() -> Callable[[AgentState], dict]:
    def image_fetcher_node(state: AgentState) -> dict:
        itinerary = state.get("itinerary")
        if not itinerary:
            return {"current_step": "images_complete"}

        # Set image_url to None — frontend will fetch from Wikipedia in-browser
        for day in itinerary.get("days", []):
            for stop in day.get("stops", []):
                stop["image_url"] = None

        return {"itinerary": itinerary, "current_step": "images_complete"}

    return image_fetcher_node
