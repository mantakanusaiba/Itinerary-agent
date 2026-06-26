"""
Planner node.

Takes the raw trip input (city/days/vibe) and produces 3-5 specific research
angles, each paired with an actual search query. See prompts.py for why the
prompt is shaped the way it is (vibe-specificity is the whole point — a
planner that just says "things to do" has failed).
"""

import logging
from typing import Callable

from groq import Groq

from app.agent.llm_client import LLMCallError, LLMRateLimitError, call_and_validate
from app.agent.prompts import PLANNER_SYSTEM_PROMPT, PLANNER_USER_TEMPLATE
from app.agent.state import AgentState, ResearchAngles

logger = logging.getLogger(__name__)


def make_planner_node(client: Groq, model: str) -> Callable[[AgentState], dict]:
    """
    Factory, not a bare function, so the Groq client/model are injected
    rather than constructed inside the node. This is what lets us test this
    node in isolation with a throwaway script (real client) or, later, a
    mock client — without touching graph wiring.
    """

    def planner_node(state: AgentState) -> dict:
        user_prompt = PLANNER_USER_TEMPLATE.format(
            city=state["city"], days=state["days"], vibe=state["vibe"]
        )

        try:
            result = call_and_validate(
                client=client,
                model=model,
                system_prompt=PLANNER_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                schema=ResearchAngles,
            )
        except (LLMRateLimitError, LLMCallError) as e:
            # Planner failing is fatal — nothing downstream can proceed
            # without research angles. Let it propagate; FastAPI layer turns
            # this into a clear error response rather than a silent crash.
            logger.error("Planner node failed: %s", e)
            raise

        angles = [a.model_dump() for a in result.angles]
        logger.info("Planner produced %d research angles", len(angles))

        return {
            "research_angles": angles,
            "current_step": "planning_complete",
        }

    return planner_node
