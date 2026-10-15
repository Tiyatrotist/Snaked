"""Instant handling of common commands without calling a model.

A model round trip is the slowest part of every step (often 1-3 s). Commands that
match a known pattern here are turned into actions directly, so Snaked reacts in
milliseconds. Anything that does not match goes to the model as usual.
"""

from __future__ import annotations

import platform
import re
import urllib.parse
from dataclasses import dataclass, field


@dataclass
class FastPlan:
    actions: list[tuple[str, dict]] = field(default_factory=list)
    summary: str = ""


def _open_url(url: str) -> tuple[str, dict]:
    system = platform.system()
    if system == "Darwin":
        cmd = f'open "{url}"'
    elif system == "Windows":
        cmd = f'Start-Process "{url}"'
    else:
        cmd = f'xdg-open "{url}"'
    return ("shell", {"command": cmd})


def _volume(direction: str) -> tuple[str, dict]:
    key = {"up": "volumeup", "down": "volumedown", "mute": "volumemute"}[direction]
    return ("key", {"combo": key})


_APP = r"(?P<app>[\w .\-]+?)"
_SEARCH = r"(?P<q>.+?)"

# (pattern, builder). Patterns are matched against the lowercased, trimmed command.
_RULES: list[tuple[re.Pattern[str], callable]] = [
    (re.compile(rf"^(?:google'?da |internette |web'?de )?{_SEARCH} (?:ara|arat)$"),
     lambda m: FastPlan([_open_url("https://www.google.com/search?q=" + urllib.parse.quote(m["q"]))],
                        f"\"{m['q']}\" için arama açtım.")),
    (re.compile(rf"^(?:search(?: for)?|google) {_SEARCH}$"),
     lambda m: FastPlan([_open_url("https://www.google.com/search?q=" + urllib.parse.quote(m["q"]))],
                        f"Searched for \"{m['q']}\".")),
    (re.compile(r"^(?:sesi |volume )(?:kıs|azalt|down)$"), lambda m: FastPlan([_volume("down")], "Sesi kıstım.")),
    (re.compile(r"^(?:sesi |volume )(?:aç|artır|yükselt|up)$"), lambda m: FastPlan([_volume("up")], "Sesi açtım.")),
    (re.compile(r"^(?:sesi kapat|sessize al|mute)$"), lambda m: FastPlan([_volume("mute")], "Sesi kapattım.")),
    (re.compile(r"^(?P<url>(?:https?://)?[\w\-]+(?:\.[\w\-]+)+(?:/\S*)?)(?:'?[yı]? ?aç| open)?$"),
     lambda m: FastPlan([_open_url(m["url"] if m["url"].startswith("http") else "https://" + m["url"])],
                        f"{m['url']} adresini açtım.")),
    (re.compile(rf"^{_APP}(?:'?[ıiuü]?[yn]?[ıiuü]? aç|'?[ıiuü] başlat)$"),
     lambda m: FastPlan([("open_app", {"name": m["app"].strip().title()})], f"{m['app'].strip().title()} açıldı.")),
    (re.compile(rf"^(?:open|launch|start) {_APP}$"),
     lambda m: FastPlan([("open_app", {"name": m["app"].strip().title()})], f"Opened {m['app'].strip().title()}.")),
]


def route(command: str) -> FastPlan | None:
    text = " ".join(command.strip().lower().split()).rstrip(".!")
    for pattern, build in _RULES:
        if m := pattern.match(text):
            return build(m)
    return None
