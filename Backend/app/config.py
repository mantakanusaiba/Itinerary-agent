"""
Centralized environment/config loading.

Why this exists as its own module: every node in the agent needs the API keys,
and we want exactly one place that decides "is the environment configured
correctly," with a fail-loud message, instead of scattered os.getenv() calls
that fail mysteriously deep inside a LangGraph node.
"""

import os
import sys
from dataclasses import dataclass

from dotenv import load_dotenv

# Load variables from a local .env file (if present) into the process
# environment. This is a no-op in production-style setups where the env vars
# are already set by the shell/host, so it's safe to always call.
load_dotenv()


@dataclass(frozen=True)
class Settings:
    groq_api_key: str
    tavily_api_key: str
    groq_model: str = "llama-3.3-70b-versatile"


def _require_env(var_name: str, signup_hint: str) -> str:
    """
    Read a required env var or exit with a clear, actionable error.

    We deliberately exit (rather than raising deep in a node, mid-graph,
    after a user has waited several seconds) so the failure is immediate and
    obvious the moment the server starts.
    """
    value = os.getenv(var_name)
    if not value:
        print(
            f"\n[CONFIG ERROR] Missing required environment variable: {var_name}\n"
            f"  -> {signup_hint}\n"
            f"  -> Add it to backend/.env (see backend/.env.example)\n",
            file=sys.stderr,
        )
        sys.exit(1)
    return value


def load_settings() -> Settings:
    groq_key = _require_env(
        "GROQ_API_KEY",
        "Get a free key at https://console.groq.com/keys",
    )
    tavily_key = _require_env(
        "TAVILY_API_KEY",
        "Get a free key at https://app.tavily.com",
    )
    return Settings(groq_api_key=groq_key, tavily_api_key=tavily_key)
