"""Known API providers and discovery of everything the user can connect."""

from __future__ import annotations

import os

from .base import Provider
from .litellm_provider import LiteLLMProvider
from .ollama import discover_local
from .subscription import ClaudeCodeProvider, CodexProvider

# provider name -> (env var for the key, default model in LiteLLM naming)
API_PROVIDERS: dict[str, tuple[str, str]] = {
    "openai": ("OPENAI_API_KEY", "openai/gpt-5"),
    "anthropic": ("ANTHROPIC_API_KEY", "anthropic/claude-sonnet-5-5"),
    "gemini": ("GEMINI_API_KEY", "gemini/gemini-2.5-pro"),
    "mistral": ("MISTRAL_API_KEY", "mistral/mistral-large-latest"),
    "groq": ("GROQ_API_KEY", "groq/llama-3.3-70b-versatile"),
    "deepseek": ("DEEPSEEK_API_KEY", "deepseek/deepseek-chat"),
    "xai": ("XAI_API_KEY", "xai/grok-4"),
    "openrouter": ("OPENROUTER_API_KEY", "openrouter/auto"),
}


def from_api_key(provider: str, api_key: str, model: str | None = None) -> LiteLLMProvider:
    _, default_model = API_PROVIDERS[provider]
    return LiteLLMProvider(model or default_model, api_key=api_key, label=f"{provider} · API")


async def discover() -> list[Provider]:
    """Everything usable right now without asking the user for anything new."""
    found: list[Provider] = []
    for name, (env, _) in API_PROVIDERS.items():
        if key := os.environ.get(env):
            found.append(from_api_key(name, key))
    for cls in (CodexProvider, ClaudeCodeProvider):
        if cls.available():
            found.append(cls())
    found.extend(await discover_local())
    return found
