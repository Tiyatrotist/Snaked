"""API-key and local providers through LiteLLM (OpenAI, Anthropic, Gemini, Ollama, ...)."""

from __future__ import annotations

import json

import litellm

from .base import Completion, ConnectionKind, Message, Provider, ToolCall


class LiteLLMProvider(Provider):
    def __init__(
        self,
        model: str,
        *,
        api_key: str | None = None,
        api_base: str | None = None,
        label: str | None = None,
        kind: ConnectionKind = ConnectionKind.API_KEY,
    ):
        self.id = model
        self.model = model
        self.label = label or model
        self.kind = kind
        self._api_key = api_key
        self._api_base = api_base

    async def complete(self, messages: list[Message], tools: list[dict] | None = None) -> Completion:
        resp = await litellm.acompletion(
            model=self.model,
            messages=messages,
            tools=tools or None,
            api_key=self._api_key,
            api_base=self._api_base,
        )
        msg = resp.choices[0].message
        calls = [
            ToolCall(id=c.id, name=c.function.name, args=json.loads(c.function.arguments or "{}"))
            for c in (msg.tool_calls or [])
        ]
        return Completion(text=msg.content or "", tool_calls=calls)
