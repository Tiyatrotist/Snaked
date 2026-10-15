import time

import pytest

from snaked_core.agent import Agent
from snaked_core.fastpath import route
from snaked_core.providers.base import Completion, ConnectionKind, Provider
from snaked_core.safety import Mode, Policy
from snaked_core.tools import ToolRunner


@pytest.mark.parametrize(
    "command, tool, key, value",
    [
        ("Spotify'ı aç", "open_app", "name", "Spotify"),
        ("chrome'u aç", "open_app", "name", "Chrome"),
        ("open visual studio code", "open_app", "name", "Visual Studio Code"),
        ("sesi kıs", "key", "combo", "volumedown"),
        ("hava durumu istanbul ara", "shell", "command", "hava%20durumu%20istanbul"),
        ("youtube.com aç", "shell", "command", "https://youtube.com"),
    ],
)
def test_routes_common_commands(command, tool, key, value):
    plan = route(command)
    assert plan is not None
    name, args = plan.actions[0]
    assert name == tool
    assert value in args[key]


def test_unknown_commands_go_to_the_model():
    assert route("İndirilenler klasörünü türlere göre düzenle") is None


class NeverCalled(Provider):
    id = label = "never"
    kind = ConnectionKind.LOCAL

    async def complete(self, messages, tools=None):
        raise AssertionError("fast path must not call the model")


class RecordingRunner(ToolRunner):
    def __init__(self):
        super().__init__(None)
        self.calls = []

    async def run(self, name, args):
        self.calls.append((name, args))
        return {"text": "ok"}


async def test_fast_path_acts_well_under_budget():
    runner = RecordingRunner()
    agent = Agent(NeverCalled(), Policy(Mode.FULL_AUTO), runner)
    events = []

    async def emit(e):
        events.append(e)

    async def approve(_):
        return True

    start = time.perf_counter()
    summary = await agent.run("Spotify'ı aç", emit, approve)
    elapsed_ms = (time.perf_counter() - start) * 1000
    assert runner.calls == [("open_app", {"name": "Spotify"})]
    assert summary == "Spotify açıldı."
    assert elapsed_ms < 100  # the 3 s budget is for the whole reaction; our own overhead is tiny
    assert events[-1]["type"] == "done" and "t_ms" in events[-1]


async def test_model_latency_is_reported():
    class Instant(Provider):
        id = label = "instant"
        kind = ConnectionKind.LOCAL

        async def complete(self, messages, tools=None):
            return Completion(text="Merhaba!")

    events = []

    async def emit(e):
        events.append(e)

    async def approve(_):
        return True

    await Agent(Instant(), Policy(), RecordingRunner()).run("selam", emit, approve)
    latency = next(e for e in events if e["type"] == "latency")
    assert latency["over_budget"] is False
