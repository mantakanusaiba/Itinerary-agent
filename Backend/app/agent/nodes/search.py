"""
Search node.

For each research angle from the planner, runs a Tavily search, then pulls
full page content for the top few results so the critic node has enough
text to actually judge voice/specificity (a two-sentence snippet isn't
enough to tell "genuine local post" from "SEO listicle").

Failure handling: a single angle's search failing (network blip, rate
limit, bad query) is logged as a warning and skipped — it does NOT crash
the whole graph. If every single angle fails, raw_search_results ends up
empty and the critic/itinerary nodes will simply have nothing to work with;
that's surfaced to the user as an error response rather than a silent
empty itinerary (see main.py).
"""

import logging
from typing import Callable

from tavily import TavilyClient

from app.agent.search_client import extract_full_content, run_search
from app.agent.state import AgentState, SearchResult

logger = logging.getLogger(__name__)

# How many of each angle's search results get the full-content extract
# treatment. Kept small deliberately to conserve Tavily's free-tier credits
# (extract is a separate billable call) — see search_client.py docstring.
TOP_RESULTS_TO_EXTRACT = 3
RESULTS_PER_ANGLE = 5


def make_search_node(client: TavilyClient, search_depth: str = "basic") -> Callable[[AgentState], dict]:
    def search_node(state: AgentState) -> dict:
        angles = state.get("research_angles", [])
        all_results: list[dict] = []
        errors: list[str] = list(state.get("errors", []))

        for angle_obj in angles:
            angle = angle_obj["angle"]
            query = angle_obj["search_query"]

            raw_results = run_search(
                client, query=query, search_depth=search_depth, max_results=RESULTS_PER_ANGLE
            )
            if not raw_results:
                msg = f"Search returned no results for angle '{angle}' (query: {query!r})"
                logger.warning(msg)
                errors.append(msg)
                continue

            # Extract full content only for the top N results of this angle.
            top_urls = [r["url"] for r in raw_results[:TOP_RESULTS_TO_EXTRACT] if r.get("url")]
            full_content_by_url = extract_full_content(client, top_urls)

            for r in raw_results:
                url = r.get("url", "")
                result = SearchResult(
                    angle=angle,
                    query=query,
                    url=url,
                    title=r.get("title", ""),
                    snippet=r.get("content", ""),
                    full_content=full_content_by_url.get(url),
                )
                all_results.append(result.model_dump())

        logger.info(
            "Search node collected %d raw results across %d angles (%d angle failures)",
            len(all_results),
            len(angles),
            len(errors) - len(state.get("errors", [])),
        )

        return {
            "raw_search_results": all_results,
            "current_step": "search_complete",
            "errors": errors,
        }

    return search_node
