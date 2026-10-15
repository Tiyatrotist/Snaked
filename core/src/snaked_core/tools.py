"""Tools the agent can call, in OpenAI function-calling format, and their executor."""

from __future__ import annotations

import asyncio
import base64
import platform
from pathlib import Path
from typing import Any

from .computer import Computer


def _fn(name: str, description: str, props: dict, required: list[str] | None = None) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": props, "required": required or []},
        },
    }


_INT = {"type": "integer"}
_STR = {"type": "string"}

TOOLS: list[dict] = [
    _fn("screenshot", "Take a screenshot of the main display.", {}),
    _fn("click", "Click at screen coordinates.", {"x": _INT, "y": _INT, "target": _STR}, ["x", "y"]),
    _fn("double_click", "Double click at screen coordinates.",
        {"x": _INT, "y": _INT, "target": _STR}, ["x", "y"]),
    _fn("scroll", "Scroll; positive is up.", {"amount": _INT}, ["amount"]),
    _fn("type", "Type text with the keyboard.", {"text": _STR}, ["text"]),
    _fn("key", "Press a key or combo like 'enter' or 'ctrl+s'.", {"combo": _STR}, ["combo"]),
    _fn("open_app", "Open an application by name.", {"name": _STR}, ["name"]),
    _fn("shell", "Run a shell command and return its output. Prefer this over clicking when possible.",
        {"command": _STR}, ["command"]),
    _fn("read_file", "Read a text file.", {"path": _STR}, ["path"]),
    _fn("write_file", "Write a text file.", {"path": _STR, "content": _STR}, ["path", "content"]),
    _fn("list_dir", "List a directory.", {"path": _STR}, ["path"]),
    _fn("done", "Finish the task with a short summary for the user.", {"summary": _STR}, ["summary"]),
]


class ToolRunner:
    def __init__(self, computer: Computer | None):
        self.computer = computer
        self._scale = 1.0  # screenshot pixels -> screen coordinates

    def screen_point(self, args: dict[str, Any]) -> tuple[int, int]:
        return round(args["x"] * self._scale), round(args["y"] * self._scale)

    def _need_computer(self) -> Computer:
        if self.computer is None:
            raise RuntimeError("Screen control is not available (install the 'desktop' extra).")
        return self.computer

    async def run(self, name: str, args: dict[str, Any]) -> dict:
        """Returns a result dict; `image` holds a base64 PNG for screenshots."""
        if name == "screenshot":
            shot = self._need_computer().screenshot()
            self._scale = shot.screen_width / shot.width
            return {
                "text": f"{shot.width}x{shot.height}; give click coordinates in this image's pixels",
                "image": base64.b64encode(shot.data).decode(),
                "mime": shot.mime,
            }
        if name in {"click", "double_click"}:
            self._need_computer().click(*self.screen_point(args), clicks=2 if name == "double_click" else 1)
            return {"text": "ok"}
        if name == "scroll":
            self._need_computer().scroll(args["amount"])
            return {"text": "ok"}
        if name == "type":
            self._need_computer().type_text(args["text"])
            return {"text": "ok"}
        if name == "key":
            self._need_computer().key(args["combo"])
            return {"text": "ok"}
        if name == "open_app":
            self._need_computer().open_app(args["name"])
            return {"text": "ok"}
        if name == "shell":
            return {"text": await _shell(args["command"])}
        if name == "read_file":
            return {"text": Path(args["path"]).expanduser().read_text(errors="replace")[:20000]}
        if name == "write_file":
            Path(args["path"]).expanduser().write_text(args["content"])
            return {"text": "ok"}
        if name == "list_dir":
            folder = Path(args["path"]).expanduser()
            entries = sorted(p.name + ("/" if p.is_dir() else "") for p in folder.iterdir())
            return {"text": "\n".join(entries)}
        raise ValueError(f"Unknown tool: {name}")


async def _shell(command: str, timeout: float = 120) -> str:
    if platform.system() == "Windows":
        argv = ["powershell", "-NoProfile", "-Command", command]
    else:
        argv = ["/bin/sh", "-c", command]
    proc = await asyncio.create_subprocess_exec(
        *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout)
    except TimeoutError:
        proc.kill()
        return f"(timed out after {timeout}s)"
    return f"exit {proc.returncode}\n{out.decode(errors='replace')[-20000:]}"
