"""
Stop-swap handler.

Deliberately NOT a LangGraph node — this backs a single user-triggered
action ("swap this stop") on an itinerary that's already been built, so it
doesn't belong in the linear planner->search->critic->itinerary_builder
pipeline. It reuses the same llm_client.call_and_validate machinery as the
graph nodes for consistency (forced JSON, validated against ItineraryStop,
retry once on malformed output).
"""

from typing import Callable

from groq import Groq

from app.agent.llm_client import call_and_validate
from app.agent.prompts import (
    ITINERARY_SOURCE_BLOCK_TEMPLATE,
    NEARBY_STOPS_SYSTEM_PROMPT,
    NEARBY_STOPS_USER_TEMPLATE,
    SWAP_STOP_SYSTEM_PROMPT,
    SWAP_STOP_USER_TEMPLATE,
)
from app.agent.state import FilteredSource, ItineraryStop


def _format_stop(stop: ItineraryStop) -> str:
    return (
        f"- {stop.name} ({stop.time}, {stop.duration_minutes} min): "
        f"{stop.description}"
    )


def make_swap_handler(
    client: Groq, model: str
) -> Callable[[str, str, str, list[ItineraryStop], ItineraryStop, list[FilteredSource]], ItineraryStop]:
    def swap_handler(
        city: str,
        vibe: str,
        day_theme: str,
        other_stops: list[ItineraryStop],
        stop_to_replace: ItineraryStop,
        filtered_sources: list[FilteredSource],
    ) -> ItineraryStop:
        other_stops_block = (
            "\n".join(_format_stop(s) for s in other_stops) if other_stops else "(none)"
        )

        sources_block = "\n".join(
            ITINERARY_SOURCE_BLOCK_TEMPLATE.format(
                url=s.url, title=s.title, reason_kept=s.reason_kept, content=s.content
            )
            for s in filtered_sources
        )

        user_prompt = SWAP_STOP_USER_TEMPLATE.format(
            city=city,
            vibe=vibe,
            day_theme=day_theme,
            stop_to_replace=_format_stop(stop_to_replace),
            other_stops_block=other_stops_block,
            sources_block=sources_block,
        )

        return call_and_validate(
            client=client,
            model=model,
            system_prompt=SWAP_STOP_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            schema=ItineraryStop,
        )

    return swap_handler