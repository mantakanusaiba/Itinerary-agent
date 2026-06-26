"""
Thin wrapper around the Tavily SDK.

Two operations, kept separate deliberately:
  - search(): cheap (1 credit on "basic" depth), returns title/url/snippet
    for many results.
  - extract_full_content(): a separate, additional Tavily call that pulls
    full page text for a *specific* list of URLs. We only call this for the
    top 2-3 results per research angle (see search.py node) so the critic
    node has enough text to make a real judgment on the sources most likely
    to matter, without burning extract credits on every single result.
"""

import logging

from tavily import TavilyClient

logger = logging.getLogger(__name__)

# Cap on how much extracted text we keep per source. Full page extracts can
# be very long; the critic and itinerary-builder prompts only need enough
# text to judge voice/specificity, not the entire page.
MAX_CONTENT_CHARS = 3000


def run_search(
    client: TavilyClient,
    query: str,
    search_depth: str = "basic",
    max_results: int = 5,
) -> list[dict]:
    """
    Runs a single Tavily search. Returns [] on failure rather than raising —
    callers (search.py node) are expected to treat one failed angle as a
    non-fatal warning, not a reason to crash the whole graph.
    """
    try:
        response = client.search(
            query=query,
            search_depth=search_depth,
            max_results=max_results,
        )
    except Exception:
        logger.warning("Tavily search failed for query=%r", query, exc_info=True)
        return []

    return response.get("results", [])


def extract_full_content(client: TavilyClient, urls: list[str]) -> dict[str, str]:
    """
    Pulls full page text for the given URLs via Tavily's extract endpoint.
    Returns {url: full_text}. URLs that fail to extract are simply omitted
    from the result (caller falls back to the search snippet for those).
    """
    if not urls:
        return {}

    try:
        response = client.extract(urls=urls)
    except Exception:
        logger.warning("Tavily extract failed for urls=%r", urls, exc_info=True)
        return {}

    extracted: dict[str, str] = {}
    for result in response.get("results", []):
        url = result.get("url")
        raw_content = result.get("raw_content")
        if url and raw_content:
            extracted[url] = raw_content[:MAX_CONTENT_CHARS]

    return extracted
