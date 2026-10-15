"""Driver for the user's real desktop, built on pyautogui + mss (`desktop` extra)."""

from __future__ import annotations

import io
import platform
import subprocess

from .base import Computer, Screenshot


class LocalComputer(Computer):
    def __init__(self) -> None:
        import mss  # imported lazily so headless installs still work
        import pyautogui

        pyautogui.FAILSAFE = True  # moving the mouse to a corner aborts
        self._pg = pyautogui
        self._mss = mss

    def screenshot(self) -> Screenshot:
        from PIL import Image

        with self._mss.mss() as sct:
            shot = sct.grab(sct.monitors[1])
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Screenshot(buf.getvalue(), img.width, img.height)

    def mouse_move(self, x: int, y: int) -> None:
        self._pg.moveTo(x, y, duration=0.2)

    def click(self, x: int, y: int, button: str = "left", clicks: int = 1) -> None:
        self._pg.click(x, y, clicks=clicks, button=button)

    def scroll(self, amount: int) -> None:
        self._pg.scroll(amount)

    def type_text(self, text: str) -> None:
        self._pg.write(text, interval=0.01)

    def key(self, combo: str) -> None:
        self._pg.hotkey(*combo.lower().split("+"))

    def open_app(self, name: str) -> None:
        system = platform.system()
        if system == "Darwin":
            subprocess.Popen(["open", "-a", name])
        elif system == "Windows":
            subprocess.Popen(["cmd", "/c", "start", "", name])
        else:
            subprocess.Popen([name])
