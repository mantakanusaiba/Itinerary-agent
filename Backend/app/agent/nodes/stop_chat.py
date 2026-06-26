"""
Stop-chat handler.

Backs the "Ask About a Stop" feature — lets the user have a multi-turn
conversation about any single stop in their itinerary. Like stop_swap,
this is deliberately NOT a LangGraph node: it's a user-triggered,
real-time action on an already-built itinerary, not part of the pipeline.

The endpoint streams back the LLM's reply token-by-token via SSE so the
chat feels responsive rather than hanging for 2-3 seconds.

Context injected into every request:
  - The stop's full data (name, description, why_not_touristy, coords)
  - The city and trip vibe (so the model knows the traveler's mindset)
  - The filtered sources from the original run (same grounding as the
    itinerary builder — the model can reference real URLs)
  - The full conversation history so far (so follow-ups work correctly)
"""

from typing import Callable, Generator

from groq import Groq

from app.agent.state import FilteredSource, ItineraryStop
from app.agent.prompts import STOP_CHAT_SYSTEM_PROMPT, ITINERARY_SOURCE_BLOCK_TEMPLATE


def _get(obj, key: str):
    """
    FIX: unified field accessor.

    filtered_sources and stop arrive as Pydantic objects when coming from
    FastAPI deserialization (the normal endpoint path), but could also be
    plain dicts when called from tests or scripts that pass AgentState dicts
    directly. Attribute access on a dict raises AttributeError; key access on
    a Pydantic model works but is non-idiomatic. This helper handles both.
    """
    if isinstance(obj, dict):
        return obj[key]
    return getattr(obj, key)


def _rank_sources_for_stop(
    stop_name: str,
    filtered_sources: list,
) -> list:
    """
    Re-rank filtered_sources so that sources mentioning the stop name by
    exact (case-insensitive) match appear first. This gives the LLM the
    most relevant sources at the top of its context window, improving
    answer quality significantly on long source lists.
    """
    name_lower = stop_name.lower()
    direct, other = [], []
    for s in filtered_sources:
        content = (_get(s, "content") or "").lower()
        title   = (_get(s, "title")   or "").lower()
        if name_lower in content or name_lower in title:
            direct.append(s)
        else:
            other.append(s)
    # Return direct matches first, then the rest.
    # Cap at 3 sources — each source can be 300+ tokens; 3 is enough to
    # ground a factual answer without burning daily token quota on chat.
    return (direct + other)[:3]


def _build_system_prompt(
    stop: ItineraryStop,
    city: str,
    vibe: str,
    filtered_sources: list[FilteredSource],
) -> str:
    relevant = _rank_sources_for_stop(_get(stop, "name"), filtered_sources)

    sources_block = "\n".join(
        ITINERARY_SOURCE_BLOCK_TEMPLATE.format(
            url=_get(s, "url"),
            title=_get(s, "title"),
            reason_kept=_get(s, "reason_kept"),
            # Truncate content to 300 chars — enough context for factual
            # answers without burning token quota on lengthy source dumps.
            content=(_get(s, "content") or "")[:300],
        )
        for s in relevant
    ) or "(no sources available for this stop)"

    stop_block = (
        f"Name: {_get(stop, 'name')}\n"
        f"Scheduled: {_get(stop, 'time')} ({_get(stop, 'duration_minutes')} min)\n"
        f"Description: {_get(stop, 'description')}\n"
        f"Why locals love it: {_get(stop, 'why_not_touristy')}\n"
        f"Source URL: {_get(stop, 'source_reference') or 'n/a'}"
    )

    return STOP_CHAT_SYSTEM_PROMPT.format(
        city=city,
        vibe=vibe,
        stop_block=stop_block,
        sources_block=sources_block,
    )


def make_stop_chat_handler(
    client: Groq, model: str
) -> Callable[..., Generator[str, None, None]]:
    def stop_chat_handler(
        stop: ItineraryStop,
        city: str,
        vibe: str,
        filtered_sources: list[FilteredSource],
        history: list[dict],  # [{"role": "user"|"assistant", "content": str}]
        user_message: str,
    ) -> Generator[str, None, None]:
        system_prompt = _build_system_prompt(stop, city, vibe, filtered_sources)

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": user_message})

        stream = client.chat.completions.create(
            model=model,
            messages=messages,
            # Lower temperature = more confident, factual answers rather
            # than hedgy "I'm not sure" hedging. The system prompt already
            # tells the model to flag uncertainty honestly when needed.
            temperature=0.3,
            # 400 tokens covers 2–4 sentence answers comfortably.
            # Keeps per-call token cost low on the free Groq tier.
            max_tokens=400,
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    return stop_chat_handler
