"""
FastAPI application entrypoint.

Settings (and therefore the GROQ_API_KEY / TAVILY_API_KEY check) are loaded
once at module import time — i.e. the server fails to start at all, with a
clear message, if the keys are missing.
"""

import json
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from groq import Groq
from tavily import TavilyClient
from pydantic import BaseModel, Field

from app.agent.geocode_client import NominatimGeocoder
from app.agent.graph import build_graph
from app.agent.llm_client import LLMCallError, LLMRateLimitError
from app.agent.nodes.stop_chat import make_stop_chat_handler
from app.agent.state import AgentState, FilteredSource, ItineraryStop
from app.agent.stop_swap import make_swap_handler
from app.agent.nearby_stops import make_nearby_stops_handler
from app.config import load_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Local Guide Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

settings = load_settings()
compiled_graph = build_graph(settings)

swap_handler = make_swap_handler(Groq(api_key=settings.groq_api_key), settings.groq_model)
swap_geocoder = NominatimGeocoder()
tavily_client = TavilyClient(api_key=settings.tavily_api_key)

# FIX 1: stop_chat_handler was never constructed — added here.
stop_chat_handler = make_stop_chat_handler(
    Groq(api_key=settings.groq_api_key), settings.groq_model
)
nearby_stops_handler = make_nearby_stops_handler(
    Groq(api_key=settings.groq_api_key), settings.groq_model
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────
# GET /api/image-search  — fetch real web images for a place via Tavily
# ─────────────────────────────────────────────────────────────────────────

BAD_IMAGE_PATTERNS = [
    "logo", "icon", "flag", "coat_of_arms", "locator", "map_of",
    "emblem", "placeholder", "avatar", "spinner", "loading", ".svg",
    "data:image", "1x1", "pixel", "transparent",
]

def _is_bad_image_url(url: str) -> bool:
    u = url.lower()
    return any(p in u for p in BAD_IMAGE_PATTERNS)


@app.get("/api/image-search")
def image_search(place: str, city: str = "") -> dict:
    """
    Returns up to 5 real web image URLs for a place using Tavily image search.
    Tries progressively broader queries if the first one yields too few results.
    """
    queries = [
        f"{place} {city}".strip(),
        f"{place} restaurant {city}".strip() if city else place,
        city or place,
    ]
    seen: set[str] = set()
    images: list[str] = []

    for query in queries:
        if len(images) >= 5:
            break
        try:
            result = tavily_client.search(
                query=query,
                include_images=True,
                max_results=5,
            )
            for url in result.get("images", []):
                if isinstance(url, dict):
                    url = url.get("url", "")
                if url and url not in seen and not _is_bad_image_url(url):
                    seen.add(url)
                    images.append(url)
                if len(images) >= 5:
                    break
        except Exception as e:
            logger.warning("Tavily image search failed for %r: %s", query, e)

    return {"images": images[:5]}


# ─────────────────────────────────────────────────────────────────────────
# POST /api/itinerary  — full pipeline, SSE-streamed
# ─────────────────────────────────────────────────────────────────────────

class TripRequest(BaseModel):
    city: str = Field(..., min_length=1)
    days: int = Field(..., ge=1, le=7)
    vibe: str = Field(..., min_length=1)


@app.post("/api/itinerary")
def create_itinerary(req: TripRequest) -> StreamingResponse:
    """
    Runs the full agent graph and streams progress as Server-Sent Events.

    Event shapes:
      {"type": "progress", "current_step": "<step name>"}
      {"type": "result",   "itinerary": {...}, "filtered_sources": [...],
                           "rejected_sources": [...], "errors": [...]}
      {"type": "error",    "message": "<human-readable error>"}
    """
    initial_state: AgentState = {
        "city": req.city,
        "days": req.days,
        "vibe": req.vibe,
        "errors": [],
    }

    def event_stream():
        final_state: dict = {}
        try:
            for state_update in compiled_graph.stream(initial_state, stream_mode="values"):
                final_state = state_update
                step = state_update.get("current_step", "")
                if step:
                    yield f"data: {json.dumps({'type': 'progress', 'current_step': step})}\n\n"
        except LLMRateLimitError as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return
        except (LLMCallError, ValueError) as e:
            logger.error("Agent graph failed: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        yield (
            "data: "
            + json.dumps(
                {
                    "type": "result",
                    "itinerary": final_state.get("itinerary"),
                    "filtered_sources": final_state.get("filtered_sources", []),
                    "rejected_sources": final_state.get("rejected_sources", []),
                    "research_angles": final_state.get("research_angles", []),
                    "errors": final_state.get("errors", []),
                }
            )
            + "\n\n"
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─────────────────────────────────────────────────────────────────────────
# POST /api/itinerary/swap-stop  — replace one stop, non-streamed
# ─────────────────────────────────────────────────────────────────────────

class SwapStopRequest(BaseModel):
    city: str = Field(..., min_length=1)
    vibe: str = Field(..., min_length=1)
    day_theme: str
    stop_to_replace: ItineraryStop
    other_stops: list[ItineraryStop] = Field(default_factory=list)
    filtered_sources: list[FilteredSource] = Field(default_factory=list)


@app.post("/api/itinerary/swap-stop")
def swap_stop(req: SwapStopRequest) -> dict:
    if not req.filtered_sources:
        raise HTTPException(
            status_code=400,
            detail="No sources available to ground a replacement stop in.",
        )

    try:
        new_stop = swap_handler(
            city=req.city,
            vibe=req.vibe,
            day_theme=req.day_theme,
            other_stops=req.other_stops,
            stop_to_replace=req.stop_to_replace,
            filtered_sources=req.filtered_sources,
        )
    except LLMRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e)) from e
    except LLMCallError as e:
        logger.error("Swap-stop failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e)) from e

    # FIX 2: swap-stop was falling back to city centre on geocode miss — now
    # correctly leaves coords as None so the map skips the marker instead of
    # placing a false pin at the city centre.
    coords = swap_geocoder.geocode(f"{new_stop.name}, {req.city}")
    if coords is not None:
        new_stop.latitude, new_stop.longitude = coords
    # If geocoding fails, latitude/longitude stay None — that is correct.

    # Fetch a real image for the swapped stop via Wikimedia (same source
    # as image_fetcher.py node — keeps swapped cards visually consistent).
    from app.agent.nodes.image_fetcher import _fetch_wikimedia_image
    new_stop.image_url = _fetch_wikimedia_image(new_stop.name, req.city)

    return new_stop.model_dump()


# ─────────────────────────────────────────────────────────────────────────
# POST /api/itinerary/nearby-stops  — suggest walkable alternatives
# ─────────────────────────────────────────────────────────────────────────

class NearbyStopsRequest(BaseModel):
    city: str = Field(..., min_length=1)
    vibe: str = Field(..., min_length=1)
    stop: ItineraryStop
    all_itinerary_stops: list[ItineraryStop] = Field(default_factory=list)
    filtered_sources: list[FilteredSource] = Field(default_factory=list)


@app.post("/api/itinerary/nearby-stops")
def nearby_stops(req: NearbyStopsRequest) -> dict:
    """
    Returns 2-3 walkable nearby alternatives to a given stop,
    grounded in the original filtered sources.
    """
    try:
        suggestions = nearby_stops_handler(
            city=req.city,
            vibe=req.vibe,
            stop=req.stop,
            all_itinerary_stops=req.all_itinerary_stops,
            filtered_sources=req.filtered_sources,
        )
    except LLMRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e)) from e
    except LLMCallError as e:
        logger.error("Nearby-stops failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e)) from e

    return {"suggestions": suggestions}


# ─────────────────────────────────────────────────────────────────────────
# POST /api/itinerary/stop-chat  — streamed chat about one stop
# ─────────────────────────────────────────────────────────────────────────

class StopChatRequest(BaseModel):
    city: str = Field(..., min_length=1)
    vibe: str = Field(..., min_length=1)
    stop: ItineraryStop
    filtered_sources: list[FilteredSource] = Field(default_factory=list)
    # Full conversation history so far — [{role, content}, ...]
    # Backend is stateless; frontend sends the whole thread on every call.
    history: list[dict] = Field(default_factory=list)
    user_message: str = Field(..., min_length=1)


@app.post("/api/itinerary/stop-chat")
def stop_chat(req: StopChatRequest) -> StreamingResponse:
    """
    Streams the assistant's reply token-by-token via SSE.

    Event shapes:
      {"type": "token",  "content": "<text chunk>"}
      {"type": "done"}
      {"type": "error",  "message": "<reason>"}

    The frontend must append each token to its local buffer and treat "done"
    as the signal to commit the full message to the history array it keeps
    in state — then send that updated history in the next call.
    """

    def event_stream():
        try:
            for token in stop_chat_handler(
                stop=req.stop,
                city=req.city,
                vibe=req.vibe,
                filtered_sources=req.filtered_sources,
                history=req.history,
                user_message=req.user_message,
            ):
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        except Exception as e:
            logger.error("stop-chat stream failed: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")