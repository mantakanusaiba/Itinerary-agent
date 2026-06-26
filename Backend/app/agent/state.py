"""
State schema for the itinerary agent.

Two layers, deliberately kept separate:

1. Pydantic models — used at the *boundary* with the LLM. Every time we ask
   Groq for structured output, we validate the raw JSON against one of these
   models before trusting it. This is where malformed-LLM-output gets caught.

2. AgentState (TypedDict) — the actual LangGraph state. LangGraph's default
   state update mechanism merges plain dicts returned by each node into a
   single state object; TypedDict is the natural fit for that (Pydantic
   models would need a custom reducer to get the same merge-by-key behavior).
   So: Pydantic models are built, validated, then immediately serialized
   to dicts (.model_dump()) before being written into AgentState.
"""

from typing import Literal, Optional, TypedDict

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────
# Planner node output
# ─────────────────────────────────────────────────────────────────────────

class ResearchAngle(BaseModel):
    angle: str = Field(..., description="Short label, e.g. 'street food areas'")
    search_query: str = Field(..., description="The actual web search query for this angle")


class ResearchAngles(BaseModel):
    angles: list[ResearchAngle] = Field(..., min_length=3, max_length=5)


# ─────────────────────────────────────────────────────────────────────────
# Search node output
# ─────────────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    """One raw search result, tagged with the angle/query that produced it."""
    angle: str
    query: str
    url: str
    title: str
    snippet: str
    full_content: Optional[str] = None  # filled in for top results via Tavily extract


# ─────────────────────────────────────────────────────────────────────────
# Critic node output
# ─────────────────────────────────────────────────────────────────────────

class SourceJudgment(BaseModel):
    url: str
    decision: Literal["keep", "reject"]
    reason: str = Field(..., description="One-line justification, required either way")


class CriticBatchResult(BaseModel):
    judgments: list[SourceJudgment]


class FilteredSource(BaseModel):
    url: str
    title: str
    angle: str
    content: str
    reason_kept: str


class RejectedSource(BaseModel):
    url: str
    title: str
    angle: str
    reason_rejected: str


# ─────────────────────────────────────────────────────────────────────────
# Itinerary builder node output
# ─────────────────────────────────────────────────────────────────────────

class ItineraryStop(BaseModel):
    name: str
    time: str
    duration_minutes: int
    description: str
    why_not_touristy: str
    source_reference: str
    # Populated by geocoder node AFTER the LLM call — coordinates come from
    # Nominatim, not from the model. Optional because geocoding a specific
    # stop can fail without that being fatal to the itinerary.
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # FIX: added image_url — populated by image_fetcher node (not the LLM).
    # Optional so stops that existed before the image_fetcher was added
    # (e.g. from swap-stop prior to the fix) still deserialize correctly.
    image_url: Optional[str] = None


class ItineraryDay(BaseModel):
    day_number: int
    theme: str
    stops: list[ItineraryStop]


class Itinerary(BaseModel):
    days: list[ItineraryDay]


# ─────────────────────────────────────────────────────────────────────────
# Graph state
# ─────────────────────────────────────────────────────────────────────────

class AgentState(TypedDict, total=False):
    # initial input
    city: str
    days: int
    vibe: str

    # populated by planner
    research_angles: list[dict]

    # populated by search
    raw_search_results: list[dict]

    # populated by critic
    filtered_sources: list[dict]
    rejected_sources: list[dict]

    # populated by itinerary builder
    itinerary: dict

    # progress / observability, threaded through every node
    current_step: str
    errors: list[str]  # non-fatal warnings collected along the way
