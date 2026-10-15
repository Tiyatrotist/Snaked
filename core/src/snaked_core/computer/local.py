"""Driver for the user's real desktop, built on pynput + mss (`desktop` extra).

pynput is used instead of pyautogui because pyautogui exits the process on Linux
when tkinter is missing.
"""

from __future__ import annotations

import io
import platform
import subprocess
import time

from .base import Computer, Screenshot

_KEY_ALIASES = {
    "ctrl": "ctrl", "control": "ctrl", "cmd": "cmd", "command": "cmd", "win": "cmd", "super": "cmd",
    "alt": "alt", "option": "alt", "shift": "shift", "enter": "enter", "return": "enter",
    "esc": "esc", "escape": "esc", "tab": "tab", "space": "space", "backspace": "backspace",
    "delete": "delete", "up": "up", "down": "down", "left": "left", "right": "right",
    "home": "home", "end": "end", "pageup": "page_up", "pagedown": "page_down",
    "volumeup": "media_volume_up", "volumedown": "media_volume_down", "volumemute": "media_volume_mute",
}


class LocalComputer(Computer):
    def __init__(self) -> None:
        import mss  # imported lazily so headless installs still work
        from pynput import keyboard, mouse

        self._mss = mss
        self._mouse = mouse.Controller()
        self._kb = keyboard.Controller()
        self._Key = keyboard.Key
        self._Button = mouse.Button
        with mss.mss() as sct:
            self._screen = sct.monitors[1]

    def screenshot(self, max_width: int = 1280) -> Screenshot:
        # Small JPEGs upload and run through vision models much faster than full-size PNGs.
        from PIL import Image

        with self._mss.mss() as sct:
            shot = sct.grab(self._screen)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        if img.width > max_width:
            img = img.resize((max_width, round(img.height * max_width / img.width)), Image.BILINEAR)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return Screenshot(buf.getvalue(), img.width, img.height, self._screen["width"])

    def mouse_move(self, x: int, y: int) -> None:
        self._mouse.position = (x, y)

    def click(self, x: int, y: int, button: str = "left", clicks: int = 1) -> None:
        self._mouse.position = (x, y)
        time.sleep(0.02)  # let the target see the hover before the press
        self._mouse.click(getattr(self._Button, button), clicks)

    def scroll(self, amount: int) -> None:
        self._mouse.scroll(0, amount)

    def type_text(self, text: str) -> None:
        self._kb.type(text)

    def _key(self, name: str):
        name = _KEY_ALIASES.get(name.lower(), name.lower())
        if len(name) == 1:
            return name
        if name.startswith("f") and name[1:].isdigit():
            return getattr(self._Key, name)
        return getattr(self._Key, name)

    def key(self, combo: str) -> None:
        keys = [self._key(k) for k in combo.split("+")]
        for k in keys:
            self._kb.press(k)
        for k in reversed(keys):
            self._kb.release(k)

    def open_app(self, name: str) -> None:
        system = platform.system()
        if system == "Darwin":
            subprocess.Popen(["open", "-a", name])
        elif system == "Windows":
            subprocess.Popen(["cmd", "/c", "start", "", name])
        else:
            subprocess.Popen([name.lower()])
