"""Cross-platform computer control interface.

Each OS gets a driver implementing `Computer`. v0.1 ships one driver built on
pynput + mss; native drivers (ScreenCaptureKit/CGEvent, SendInput/UIA,
PipeWire/libei/AT-SPI) replace it piece by piece.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Screenshot:
    """An image sent to the model. It is downscaled for speed, so `screen_width`
    (in the units mouse coordinates use) tells how to map image pixels back."""

    data: bytes
    width: int
    height: int
    screen_width: int
    mime: str = "image/jpeg"


class Computer(ABC):
    @abstractmethod
    def screenshot(self, max_width: int = 1280) -> Screenshot: ...

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
