"""Provider-agnostic model interface."""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class ConnectionKind(StrEnum):
    API_KEY = "api_key"
    LOCAL = "local"
    SUBSCRIPTION = "subscription"


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass
class Completion:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)


Message = dict[str, Any]  # OpenAI-style chat message


class Provider(ABC):
    """A connected model backend. One instance per configured connection."""

    id: str
    label: str
    kind: ConnectionKind
    supports_images: bool = True
    supports_native_tools: bool = True

    @abstractmethod
    async def complete(self, messages: list[Message], tools: list[dict] | None = None) -> Completion:
        ...

    def describe(self) -> dict:
        return {"id": self.id, "label": self.label, "kind": self.kind.value}


_TOOL_BLOCK = re.compile(r"```tool\s*(\{.*?\})\s*```", re.DOTALL)


def tools_as_text(tools: list[dict]) -> str:
    """Prompt fragment for backends without native tool calling (subscription CLIs)."""
    lines = [
        "You can use these tools. To call one, reply with exactly one block:",
        '```tool\n{"name": "<tool>", "args": {...}}\n```',
        "Tools:",
    ]
    for t in tools:
        fn = t["function"]
        lines.append(f"- {fn['name']}: {fn['description']} args={json.dumps(fn['parameters'])}")
    return "\n".join(lines)


def parse_text_tool_calls(text: str) -> Completion:
    calls = []
    for i, m in enumerate(_TOOL_BLOCK.finditer(text)):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        calls.append(ToolCall(id=f"text-{i}", name=data.get("name", ""), args=data.get("args", {})))
    return Completion(text=_TOOL_BLOCK.sub("", text).strip(), tool_calls=calls)
