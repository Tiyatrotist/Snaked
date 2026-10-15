"""Cross-platform computer control interface.

Each OS gets a driver implementing `Computer`. v0.1 ships one driver built on
pyautogui + mss; native drivers (ScreenCaptureKit/CGEvent, SendInput/UIA,
PipeWire/libei/AT-SPI) replace it piece by piece.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Screenshot:
    png: bytes
    width: int
    height: int


class Computer(ABC):
    @abstractmethod
    def screenshot(self) -> Screenshot: ...

    @abstractmethod
    def mouse_move(self, x: int, y: int) -> None: ...

    @abstractmethod
    def click(self, x: int, y: int, button: str = "left", clicks: int = 1) -> None: ...

    @abstractmethod
    def scroll(self, amount: int) -> None: ...

    @abstractmethod
    def type_text(self, text: str) -> None: ...

    @abstractmethod
    def key(self, combo: str) -> None:
        """Press a key or combination such as 'enter' or 'ctrl+s'."""

    @abstractmethod
    def open_app(self, name: str) -> None: ...
