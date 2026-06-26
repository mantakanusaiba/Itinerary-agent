"""
Nearby-stops handler.

Backs the "What else is nearby?" feature on each stop card. Like stop_swap,
this is deliberately NOT a LangGraph node — it's a user-triggered action
on an already-built itinerary.

Given a stop, city, vibe, and the full list of itinerary stops (to avoid
repeats), it asks the LLM to suggest 2-3 walkable alternatives grounded in
the original filtered_sources.

Returns a list of plain dicts (not Pydantic objects) — the endpoint
serialises them directly into JSON for the frontend.
"""

import json
import logging
from typing import Callable

from groq import Groq

from app.agent.llm_client import LLMCallError
from app.agent.prompts import (
    ITINERARY_SOURCE_BLOCK_TEMPLATE,
    JSON_CORRECTION_TEMPLATE,
    NEARBY_STOPS_SYSTEM_PROMPT,
    NEARBY_STOPS_USER_TEMPLATE,
)
from app.agent.state import FilteredSource, ItineraryStop

logger = logging.getLogger(__name__)

# Maximum suggestions the LLM should return
MAX_SUGGESTIONS = 3


def _get(obj, key: str):
    """Unified field accessor — handles both Pydantic models and plain dicts."""
    if isinstance(obj, dict):
        return obj[key]
    return getattr(obj, key)


def _parse_suggestions(raw: str) -> list[dict]:
    """
    Parse the LLM's JSON response into a list of suggestion dicts.
    Strips markdown fences if present, validates the required keys.
    """
    clean = raw.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:] if lines[0].startswith("```") else lines)
        clean = clean.rstrip("`").strip()

    parsed = json.loads(clean)
    suggestions = parsed.get("suggestions", [])

    result = []
    for s in suggestions[:MAX_SUGGESTIONS]:
        if not isinstance(s, dict):
            continue
        # Require the four fields; skip malformed entries rather than crashing
        if all(k in s for k in ("name", "category", "why_nearby", "walking_minutes")):
            result.append({
                "name": str(s["name"]),
                "category": str(s["category"]),
                "why_nearby": str(s["why_nearby"]),
                "walking_minutes": int(s["walking_minutes"]),
            })

    return result


def make_nearby_stops_handler(
    client: Groq, model: str
) -> Callable[..., list[dict]]:
    def nearby_stops_handler(
        city: str,
        vibe: str,
        stop: ItineraryStop,
        all_itinerary_stops: list[ItineraryStop],
        filtered_sources: list[FilteredSource],
    ) -> list[dict]:
        stop_name = _get(stop, "name")

        # Build the "already in itinerary" exclusion list
        existing = "\n".join(
            f"- {_get(s, 'name')}" for s in all_itinerary_stops
        ) or "(none)"

        # Use up to 5 sources — more context than swap-stop since we're
        # generating multiple suggestions at once
        sources_block = "\n".join(
            ITINERARY_SOURCE_BLOCK_TEMPLATE.format(
                url=_get(s, "url"),
                title=_get(s, "title"),
                reason_kept=_get(s, "reason_kept"),
                content=(_get(s, "content") or "")[:400],
            )
            for s in filtered_sources[:5]
        ) or "(no sources available)"

        user_prompt = NEARBY_STOPS_USER_TEMPLATE.format(
            stop_name=stop_name,
            city=city,
            vibe=vibe,
            existing_stops=existing,
            sources_block=sources_block,
        )

        messages = [
            {"role": "system", "content": NEARBY_STOPS_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.4,
            max_tokens=600,
        )
        raw = response.choices[0].message.content or ""

        # First parse attempt
        try:
            return _parse_suggestions(raw)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as first_err:
            logger.warning("nearby_stops first parse failed: %s", first_err)

        # Retry with JSON-correction prompt (same pattern as llm_client)
        correction_prompt = JSON_CORRECTION_TEMPLATE.format(
            error=str(first_err),
            raw_response=raw,
        )
        retry_messages = messages + [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": correction_prompt},
        ]
        retry_response = client.chat.completions.create(
            model=model,
            messages=retry_messages,
            temperature=0.0,
            max_tokens=600,
        )
        retry_raw = retry_response.choices[0].message.content or ""

        try:
            return _parse_suggestions(retry_raw)
        except Exception as second_err:
            raise LLMCallError(
                f"nearby_stops: could not parse LLM response after retry: {second_err}"
            ) from second_err

    return nearby_stops_handler