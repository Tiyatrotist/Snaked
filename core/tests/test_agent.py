from snaked_core.agent import Agent
from snaked_core.providers.base import (
    Completion,
    ConnectionKind,
    Provider,
    ToolCall,
    parse_text_tool_calls,
)
from snaked_core.safety import Mode, Policy
from snaked_core.tools import ToolRunner


class ScriptedProvider(Provider):
    id = "fake"
    label = "fake"
    kind = ConnectionKind.LOCAL

    def __init__(self, replies):
        self.replies = list(replies)
        self.seen = []

    async def complete(self, messages, tools=None):
        self.seen.append(list(messages))
        return self.replies.pop(0)


async def collect(agent, task, approve_all=True):
    events = []

    async def emit(e):
        events.append(e)

    async def approve(_action):
        return approve_all

    result = await agent.run(task, emit, approve)
    return result, events


async def test_runs_tool_then_finishes(tmp_path):
    (tmp_path / "a.txt").write_text("x")
    provider = ScriptedProvider([
        Completion(tool_calls=[ToolCall("1", "list_dir", {"path": str(tmp_path)})]),
        Completion(tool_calls=[ToolCall("2", "done", {"summary": "1 dosya var"})]),
    ])
    agent = Agent(provider, Policy(Mode.AUTO_SAFE), ToolRunner(None))
    result, events = await collect(agent, "klasörde ne var?")
    assert result == "1 dosya var"
    assert any(e.get("status") == "ok" and e["name"] == "list_dir" for e in events)
    tool_msg = provider.seen[1][-1]
    assert tool_msg["role"] == "tool" and "a.txt" in tool_msg["content"]


async def test_rejected_action_is_not_run(tmp_path):
    target = tmp_path / "keep.txt"
    target.write_text("keep")
    provider = ScriptedProvider([
        Completion(tool_calls=[ToolCall("1", "shell", {"command": f"rm -f {target}"})]),
        Completion(text="Tamam, silmedim."),
    ])
    agent = Agent(provider, Policy(Mode.FULL_AUTO), ToolRunner(None))
    result, events = await collect(agent, "sil", approve_all=False)
    assert target.exists()
    assert result == "Tamam, silmedim."
    assert any(e.get("status") == "rejected" for e in events)


def test_text_tool_calls_parse():
    c = parse_text_tool_calls('Bakıyorum.\n```tool\n{"name": "screenshot", "args": {}}\n```')
    assert c.text == "Bakıyorum."
    assert c.tool_calls[0].name == "screenshot"
