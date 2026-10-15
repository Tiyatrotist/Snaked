"""Local WebSocket server the desktop app talks to (JSON messages on 127.0.0.1).

Client -> server: {"type": "hello", "token"}, {"type": "run", "task", "provider"},
                  {"type": "approve", "id", "ok"}, {"type": "stop"},
                  {"type": "providers"}, {"type": "connect_api", "provider", "api_key", "model"?},
                  {"type": "set_mode", "mode"}
Server -> client: agent events (see agent.py), {"type": "providers", "items"},
                  {"type": "approval", "id", "action"}.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import uuid

from websockets.asyncio.server import ServerConnection, serve

from .agent import Agent
from .providers import Provider, discover, from_api_key
from .safety import Action, Mode, Policy
from .tools import ToolRunner


def _make_runner() -> ToolRunner:
    try:
        from .computer.local import LocalComputer

        return ToolRunner(LocalComputer())
    except Exception:  # no display or the desktop extra is missing
        return ToolRunner(None)


class Session:
    def __init__(self, ws: ServerConnection, providers: dict[str, Provider], runner: ToolRunner):
        self.ws = ws
        self.providers = providers
        self.runner = runner
        self.policy = Policy()
        self.agent: Agent | None = None
        self.pending: dict[str, asyncio.Future[bool]] = {}
        self.task: asyncio.Task | None = None

    async def send(self, msg: dict) -> None:
        await self.ws.send(json.dumps(msg))

    async def approve(self, action: Action) -> bool:
        req_id = uuid.uuid4().hex
        fut: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
        self.pending[req_id] = fut
        await self.send({"type": "approval", "id": req_id,
                         "action": {"name": action.name, "args": action.args}})
        try:
            return await fut
        finally:
            self.pending.pop(req_id, None)

    async def handle(self, msg: dict) -> None:
        kind = msg.get("type")
        if kind == "providers":
            for p in await discover():
                self.providers.setdefault(p.id, p)
            await self.send({"type": "providers", "items": [p.describe() for p in self.providers.values()]})
        elif kind == "connect_api":
            p = from_api_key(msg["provider"], msg["api_key"], msg.get("model"))
            self.providers[p.id] = p
            await self.send({"type": "providers", "items": [p.describe() for p in self.providers.values()]})
        elif kind == "set_mode":
            self.policy.mode = Mode(msg["mode"])
        elif kind == "run":
            if self.task and not self.task.done():
                await self.send({"type": "error", "text": "A task is already running"})
                return
            provider = self.providers.get(msg.get("provider", ""))
            if provider is None:
                await self.send({"type": "error", "text": "Choose a connected model first"})
                return
            self.agent = Agent(provider, self.policy, self.runner)
            self.task = asyncio.create_task(self._run(msg["task"]))
        elif kind == "approve":
            if fut := self.pending.get(msg.get("id", "")):
                fut.set_result(bool(msg.get("ok")))
        elif kind == "stop":
            if self.agent:
                self.agent.stop()
            for fut in self.pending.values():
                fut.set_result(False)
            if self.task:
                self.task.cancel()

    async def _run(self, task: str) -> None:
        assert self.agent
        try:
            await self.agent.run(task, self.send, self.approve)
        except asyncio.CancelledError:
            await self.send({"type": "stopped"})
        except Exception as exc:
            await self.send({"type": "error", "text": str(exc)})


async def serve_forever(host: str = "127.0.0.1", port: int = 8765, token: str | None = None) -> None:
    token = token or secrets.token_urlsafe(16)
    providers: dict[str, Provider] = {}
    runner = _make_runner()

    async def handler(ws: ServerConnection) -> None:
        hello = json.loads(await ws.recv())
        if hello.get("type") != "hello" or not secrets.compare_digest(str(hello.get("token", "")), token):
            await ws.close(code=4401, reason="bad token")
            return
        session = Session(ws, providers, runner)
        await session.send({"type": "ready", "screen_control": runner.computer is not None})
        async for raw in ws:
            await session.handle(json.loads(raw))

    async with serve(handler, host, port, max_size=2**24):
        print(json.dumps({"event": "listening", "port": port, "token": token}), flush=True)
        await asyncio.Future()
