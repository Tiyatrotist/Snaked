"""Use the user's own ChatGPT or Claude subscription through the official CLI they installed.

Snaked never sees the subscription credentials: the vendor's CLI (Codex CLI for ChatGPT,
Claude Code for Claude) is logged in by the user and Snaked only runs it as a subprocess.
Check each vendor's current terms before shipping; they change often.
"""

from __future__ import annotations

import asyncio
import json
import shutil

from .base import (
    Completion,
    ConnectionKind,
    Message,
    Provider,
    parse_text_tool_calls,
    tools_as_text,
)


def _flatten(messages: list[Message], tools: list[dict] | None) -> str:
    parts = []
    if tools:
        parts.append(tools_as_text(tools))
    for m in messages:
        content = m.get("content")
        if isinstance(content, list):  # multimodal: keep the text parts only
            content = " ".join(p.get("text", "") for p in content if p.get("type") == "text")
        parts.append(f"[{m['role']}]\n{content}")
    return "\n\n".join(parts)


class CLIProvider(Provider):
    kind = ConnectionKind.SUBSCRIPTION
    supports_images = False
    supports_native_tools = False
    binary: str

    @classmethod
    def available(cls) -> bool:
        return shutil.which(cls.binary) is not None

    def command(self, prompt: str) -> list[str]:
        raise NotImplementedError

    def parse_output(self, stdout: str) -> str:
        return stdout

    async def complete(self, messages: list[Message], tools: list[dict] | None = None) -> Completion:
        proc = await asyncio.create_subprocess_exec(
            *self.command(_flatten(messages, tools)),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"{self.binary} failed: {err.decode(errors='replace').strip()}")
        return parse_text_tool_calls(self.parse_output(out.decode(errors="replace")))


class ClaudeCodeProvider(CLIProvider):
    id = "subscription/claude"
    label = "Claude (abonelik, Claude Code)"
    binary = "claude"

    def command(self, prompt: str) -> list[str]:
        return [self.binary, "-p", prompt, "--output-format", "json"]

    def parse_output(self, stdout: str) -> str:
        try:
            return json.loads(stdout).get("result", "")
        except json.JSONDecodeError:
            return stdout


class CodexProvider(CLIProvider):
    id = "subscription/chatgpt"
    label = "ChatGPT (abonelik, Codex CLI)"
    binary = "codex"

    def command(self, prompt: str) -> list[str]:
        return [self.binary, "exec", prompt]
