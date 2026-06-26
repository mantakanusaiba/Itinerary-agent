"""
Itinerary builder node.

Takes ONLY filtered_sources (rejected sources never reach this prompt — the
critic's filtering has to actually matter) plus the original city/days/vibe,
and asks Groq to build the final structured itinerary. Validated against the
Itinerary Pydantic schema, with the standard retry-once-on-malformed-JSON
behavior from llm_client.call_and_validate.
"""

import logging
from typing import Callable

from groq import Groq

from app.agent.llm_client import LLMCallError, LLMRateLimitError, call_and_validate
from app.agent.prompts import (
    ITINERARY_SOURCE_BLOCK_TEMPLATE,
    ITINERARY_SYSTEM_PROMPT,
    ITINERARY_USER_TEMPLATE,
)
from app.agent.state import AgentState, Itinerary

logger = logging.getLogger(__name__)


def make_itinerary_builder_node(client: Groq, model: str) -> Callable[[AgentState], dict]:
    def itinerary_builder_node(state: AgentState) -> dict:
        filtered_sources = state.get("filtered_sources", [])

        if not filtered_sources:
            # Nothing survived the critic — we can't honestly build an
            # itinerary grounded in real sources. Surface this clearly
            # rather than letting the LLM hallucinate one from nothing.
            raise ValueError(
                "No sources survived the critic filter — cannot build a "
                "grounded itinerary. This usually means either the search "
                "queries returned nothing useful, or the critic prompt is "
                "being too aggressive. Check the rejected_sources list."
            )

        sources_block = "\n".join(
            ITINERARY_SOURCE_BLOCK_TEMPLATE.format(
                url=s["url"],
                title=s["title"],
                reason_kept=s["reason_kept"],
                content=s["content"],
            )
            for s in filtered_sources
        )

        user_prompt = ITINERARY_USER_TEMPLATE.format(
            city=state["city"], days=state["days"], vibe=state["vibe"], sources_block=sources_block
        )
        system_prompt = ITINERARY_SYSTEM_PROMPT.format(days=state["days"])

        try:
            result = call_and_validate(
                client=client,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                schema=Itinerary,
            )
        except (LLMRateLimitError, LLMCallError) as e:
            logger.error("Itinerary builder node failed: %s", e)
            raise

        logger.info("Itinerary built with %d day(s)", len(result.days))

        return {
            "itinerary": result.model_dump(),
            "current_step": "itinerary_complete",
        }

    return itinerary_builder_node
