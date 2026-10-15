"""Detect locally running model servers (Ollama, LM Studio)."""

from __future__ import annotations

import httpx

from .base import ConnectionKind
from .litellm_provider import LiteLLMProvider

OLLAMA_URL = "http://127.0.0.1:11434"
LMSTUDIO_URL = "http://127.0.0.1:1234/v1"


async def discover_local(timeout: float = 0.5) -> list[LiteLLMProvider]:
    found: list[LiteLLMProvider] = []
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            for m in r.json().get("models", []):
                found.append(
                    LiteLLMProvider(
                        f"ollama_chat/{m['name']}",
                        api_base=OLLAMA_URL,
                        label=f"Ollama · {m['name']}",
                        kind=ConnectionKind.LOCAL,
                    )
                )
        except (httpx.HTTPError, ValueError):
            pass
        try:
            r = await client.get(f"{LMSTUDIO_URL}/models")
            for m in r.json().get("data", []):
                found.append(
                    LiteLLMProvider(
                        f"openai/{m['id']}",
                        api_base=LMSTUDIO_URL,
                        api_key="lm-studio",
                        label=f"LM Studio · {m['id']}",
                        kind=ConnectionKind.LOCAL,
                    )
                )
        except (httpx.HTTPError, ValueError):
            pass
    return found
