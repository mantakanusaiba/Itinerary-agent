"""
LangGraph definition: Planner -> Search -> Critic -> Itinerary Builder -> Geocoder -> Image Fetcher -> END

FIX: image_fetcher node added at the end of the pipeline so every stop gets
an image_url after coordinates are resolved.
"""

from groq import Groq
from langgraph.graph import END, START, StateGraph
from tavily import TavilyClient

from app.agent.geocode_client import NominatimGeocoder
from app.agent.nodes.critic import make_critic_node
from app.agent.nodes.geocoder import make_geocoder_node
from app.agent.nodes.image_fetcher import make_image_fetcher_node
from app.agent.nodes.itinerary_builder import make_itinerary_builder_node
from app.agent.nodes.planner import make_planner_node
from app.agent.nodes.search import make_search_node
from app.agent.state import AgentState
from app.config import Settings


def build_graph(settings: Settings):
    """
    Constructs clients from settings, wires the nodes into the graph,
    and returns a compiled LangGraph app (.invoke() / .stream()).
    """
    groq_client = Groq(api_key=settings.groq_api_key)
    tavily_client = TavilyClient(api_key=settings.tavily_api_key)
    geocoder_client = NominatimGeocoder()

    planner_node = make_planner_node(groq_client, settings.groq_model)
    search_node = make_search_node(tavily_client, search_depth="basic")
    critic_node = make_critic_node(groq_client, settings.groq_model)
    itinerary_builder_node = make_itinerary_builder_node(groq_client, settings.groq_model)
    geocoder_node = make_geocoder_node(geocoder_client)
    # FIX: image_fetcher_node added — was missing from the graph entirely.
    image_fetcher_node = make_image_fetcher_node()

    graph = StateGraph(AgentState)

    graph.add_node("planner", planner_node)
    graph.add_node("search", search_node)
    graph.add_node("critic", critic_node)
    graph.add_node("itinerary_builder", itinerary_builder_node)
    graph.add_node("geocoder", geocoder_node)
    graph.add_node("image_fetcher", image_fetcher_node)

    graph.add_edge(START, "planner")
    graph.add_edge("planner", "search")
    graph.add_edge("search", "critic")
    graph.add_edge("critic", "itinerary_builder")
    graph.add_edge("itinerary_builder", "geocoder")
    # FIX: was geocoder -> END; now geocoder -> image_fetcher -> END
    graph.add_edge("geocoder", "image_fetcher")
    graph.add_edge("image_fetcher", END)

    return graph.compile()
