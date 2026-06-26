"""
Thin wrapper around the Groq SDK, shared by every node that needs structured
JSON output from the LLM.

Kept deliberately small and dependency-light (raw Groq SDK, no LangChain) —
see the README "tech stack" section for why. The one piece of real logic
here is `call_and_validate`, which implements the "retry once with an
error-correction prompt" behavior the spec calls for, generically, so each
node doesn't reimplement it.
"""

import json
import re
from typing import TypeVar

from groq import Groq
from groq import APIStatusError
from pydantic import BaseModel, ValidationError

from app.agent.prompts import JSON_CORRECTION_TEMPLATE

ModelT = TypeVar("ModelT", bound=BaseModel)


class LLMRateLimitError(RuntimeError):
    """Raised when Groq returns 429. Caught by nodes to fail gracefully."""


class LLMCallError(RuntimeError):
    """Raised for any other non-recoverable Groq API failure."""


def _strip_code_fences(text: str) -> str:
    """
    Models sometimes wrap JSON in ```json ... ``` despite instructions not
    to. We ask for response_format=json_object (which should prevent this),
    but this is a cheap, defensive second line of protection rather than
    trusting the API contract blindly.
    """
    text = text.strip()
    fence_match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    return fence_match.group(1) if fence_match else text


def complete_json(
    client: Groq,
    model: str,
    system_prompt: str,
    user_prompt: str,
) -> str:
    """
    Single Groq chat completion call, forcing JSON-object output mode.
    Returns the raw text content (not yet parsed/validated).
    """
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
    except APIStatusError as e:
        if e.status_code == 429:
            raise LLMRateLimitError(
                "Groq free-tier rate limit hit (429). Wait a moment and "
                "retry, or reduce request volume (e.g. fewer research "
                "angles)."
            ) from e
        raise LLMCallError(f"Groq API error ({e.status_code}): {e.message}") from e

    return response.choices[0].message.content or ""


def call_and_validate(
    client: Groq,
    model: str,
    system_prompt: str,
    user_prompt: str,
    schema: type[ModelT],
    max_retries: int = 1,
) -> ModelT:
    """
    Calls Groq for JSON, validates against `schema`. On validation failure,
    retries up to `max_retries` times with an error-correction prompt that
    shows the model its own bad output plus the validation error.

    Raises pydantic.ValidationError if all attempts are exhausted.
    """
    current_user_prompt = user_prompt
    last_error: ValidationError | None = None

    for attempt in range(max_retries + 1):
        raw = complete_json(client, model, system_prompt, current_user_prompt)
        cleaned = _strip_code_fences(raw)
        try:
            return schema.model_validate_json(cleaned)
        except (ValidationError, json.JSONDecodeError) as e:
            last_error = e
            if attempt < max_retries:
                current_user_prompt = (
                    user_prompt
                    + "\n\n"
                    + JSON_CORRECTION_TEMPLATE.format(error=str(e), raw_response=raw)
                )
            continue

    assert last_error is not None
    raise last_error
