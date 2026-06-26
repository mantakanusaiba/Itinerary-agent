"""
Filter / critic node — the core differentiator of this whole project.

For each research angle, batches that angle's sources into one Groq call
(see prompts.py for why batching, not one-call-per-source) and asks the
model to classify each as "genuine local recommendation" or "generic SEO/
listicle content," with a mandatory one-line reason either way.

We deliberately do NOT silently accept a critic that approves everything.
`reject_rate` is logged on every run specifically so this is visible during
manual testing — if you run this against real search results and see 0%
rejections, that's a signal the prompt needs another pass, not a sign the
node is "working great." (Tune CRITIC_SYSTEM_PROMPT in prompts.py if so.)
"""

import logging
from collections import defaultdict
from typing import Callable

from groq import Groq

from app.agent.llm_client import LLMCallError, LLMRateLimitError, call_and_validate
from app.agent.prompts import (
    CRITIC_SOURCE_BLOCK_TEMPLATE,
    CRITIC_SYSTEM_PROMPT,
    CRITIC_USER_TEMPLATE,
)
from app.agent.state import AgentState, CriticBatchResult, FilteredSource, RejectedSource

logger = logging.getLogger(__name__)

# Mirrors search_client.MAX_CONTENT_CHARS but applied again here in case a
# snippet (not full_content) is what we're working with — snippets are
# already short, but this keeps the prompt size bounded either way.
MAX_CONTENT_CHARS_IN_PROMPT = 2000


def _best_content(result: dict) -> str:
    """Prefer the full extracted content; fall back to the search snippet."""
    content = result.get("full_content") or result.get("snippet") or ""
    return content[:MAX_CONTENT_CHARS_IN_PROMPT]


def _group_by_angle(results: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        grouped[r["angle"]].append(r)
    return grouped


def make_critic_node(client: Groq, model: str) -> Callable[[AgentState], dict]:
    def critic_node(state: AgentState) -> dict:
        raw_results = state.get("raw_search_results", [])
        errors: list[str] = list(state.get("errors", []))

        filtered: list[dict] = []
        rejected: list[dict] = []

        for angle, sources in _group_by_angle(raw_results).items():
            # De-duplicate by URL within an angle (Tavily can occasionally
            # return overlapping results for closely related queries).
            seen_urls: set[str] = set()
            unique_sources = []
            for s in sources:
                if s["url"] not in seen_urls:
                    seen_urls.add(s["url"])
                    unique_sources.append(s)

            sources_block = "\n".join(
                CRITIC_SOURCE_BLOCK_TEMPLATE.format(
                    url=s["url"], title=s["title"], content=_best_content(s)
                )
                for s in unique_sources
            )
            user_prompt = CRITIC_USER_TEMPLATE.format(angle=angle, sources_block=sources_block)

            try:
                result = call_and_validate(
                    client=client,
                    model=model,
                    system_prompt=CRITIC_SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                    schema=CriticBatchResult,
                )
            except (LLMRateLimitError, LLMCallError) as e:
                # A failed critic call for one angle is non-fatal: we drop
                # that angle's sources rather than crashing the whole graph
                # (they simply won't make it into filtered_sources).
                msg = f"Critic call failed for angle '{angle}': {e}"
                logger.warning(msg)
                errors.append(msg)
                continue

            by_url = {s["url"]: s for s in unique_sources}
            for judgment in result.judgments:
                source = by_url.get(judgment.url)
                if source is None:
                    # Model returned a URL we didn't give it — skip rather
                    # than guess which source it meant.
                    logger.warning(
                        "Critic returned unknown URL %r for angle %r", judgment.url, angle
                    )
                    continue

                if judgment.decision == "keep":
                    filtered.append(
                        FilteredSource(
                            url=source["url"],
                            title=source["title"],
                            angle=angle,
                            content=_best_content(source),
                            reason_kept=judgment.reason,
                        ).model_dump()
                    )
                else:
                    rejected.append(
                        RejectedSource(
                            url=source["url"],
                            title=source["title"],
                            angle=angle,
                            reason_rejected=judgment.reason,
                        ).model_dump()
                    )

        total = len(filtered) + len(rejected)
        reject_rate = (len(rejected) / total * 100) if total else 0.0
        logger.info(
            "Critic node: %d kept, %d rejected (%.0f%% reject rate)",
            len(filtered),
            len(rejected),
            reject_rate,
        )
        if total > 0 and len(rejected) == 0:
            logger.warning(
                "Critic rejected 0 of %d sources — if this happens "
                "consistently on real search results, the prompt likely "
                "needs iteration (see CRITIC_SYSTEM_PROMPT in prompts.py).",
                total,
            )

        return {
            "filtered_sources": filtered,
            "rejected_sources": rejected,
            "current_step": "filtering_complete",
            "errors": errors,
        }

    return critic_node
