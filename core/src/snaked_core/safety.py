"""Permission modes and risk classification for agent actions.

Every action the agent wants to take passes through `Policy.decide` before it runs.
The desktop app shows the user a confirmation whenever the decision is `ASK`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum


class Mode(StrEnum):
    SUGGEST = "suggest"  # never act, only describe what would be done
    ASK_EVERY = "ask_every"  # confirm every action (default)
    AUTO_SAFE = "auto_safe"  # run low-risk actions, confirm risky ones
    FULL_AUTO = "full_auto"  # run everything except always-confirm actions


class Risk(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"  # always confirmed, in every mode


class Decision(StrEnum):
    ALLOW = "allow"
    ASK = "ask"
    DENY = "deny"


# Shell patterns that delete data, change the system or move money/messages.
_HIGH_RISK_SHELL = [
    r"\brm\s+(-[a-zA-Z]*[rf]|.*\*)",
    r"\bdel\s+/[sq]",
    r"\bRemove-Item\b",
    r"\bformat\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
    r"\bsudo\b",
    r"\bshutdown\b|\breboot\b",
    r"\bchmod\s+-R\b|\bchown\s+-R\b",
    r"\bgit\s+push\b.*--force",
    r"curl[^|]*\|\s*(ba|z)?sh",
    r"\breg\s+(add|delete)\b",
]

# Words on screen or in a typed string that suggest payments, credentials or sending.
_HIGH_RISK_TEXT = [
    r"\b(pay|purchase|buy now|checkout|transfer|öde|satın al|gönder|send)\b",
    r"\b(password|şifre|parola|credit card|kredi kartı|cvv)\b",
]

_LOW_RISK_ACTIONS = {"screenshot", "read_file", "list_dir", "wait", "mouse_move"}
_MEDIUM_RISK_ACTIONS = {"click", "double_click", "scroll", "type", "key", "open_app", "write_file"}


@dataclass
class Action:
    """A single thing the agent wants to do."""

    name: str
    args: dict = field(default_factory=dict)
    # Free text describing what the target is (button label, window title...).
    target_hint: str = ""


def classify(action: Action) -> Risk:
    if action.name == "shell":
        cmd = str(action.args.get("command", ""))
        if any(re.search(p, cmd, re.IGNORECASE) for p in _HIGH_RISK_SHELL):
            return Risk.HIGH
        return Risk.MEDIUM
    if action.name in {"delete_file", "send_message", "payment"}:
        return Risk.HIGH
    text = " ".join([action.target_hint, str(action.args.get("text", ""))])
    if text and any(re.search(p, text, re.IGNORECASE) for p in _HIGH_RISK_TEXT):
        return Risk.HIGH
    if action.name in _LOW_RISK_ACTIONS:
        return Risk.LOW
    if action.name in _MEDIUM_RISK_ACTIONS:
        return Risk.MEDIUM
    return Risk.HIGH  # unknown actions are treated as risky


@dataclass
class Policy:
    mode: Mode = Mode.ASK_EVERY
    blocked_apps: set[str] = field(
        default_factory=lambda: {"1password", "bitwarden", "keepass", "keychain access"}
    )

    def decide(self, action: Action) -> Decision:
        hint = action.target_hint.lower()
        if any(app in hint for app in self.blocked_apps):
            return Decision.DENY
        if self.mode is Mode.SUGGEST:
            return Decision.DENY
        risk = classify(action)
        if risk is Risk.HIGH or self.mode is Mode.ASK_EVERY:
            return Decision.ASK
        if self.mode is Mode.AUTO_SAFE:
            return Decision.ALLOW if risk is Risk.LOW else Decision.ASK
        return Decision.ALLOW
