"""Leveled logger. Levels: debug < info < warn < error. Env: LUMINA_LOG_LEVEL."""
from __future__ import annotations

import os
import sys
import threading
from datetime import datetime

_LEVELS: dict[str, int] = {"debug": 10, "info": 20, "warn": 30, "error": 40}
_current = _LEVELS.get(os.environ.get("LUMINA_LOG_LEVEL", "info").lower(), 20)
_lock = threading.Lock()
_is_subprocess = not sys.stdout.isatty()

# Enable ANSI colors on Windows 10+.
if sys.platform == "win32":
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        pass

_COLORS: dict[str, str] = {
    "debug": "\x1b[90m",   # gray
    "info": "",              # normal white
    "warn": "\x1b[33m",     # yellow
    "error": "\x1b[31m",    # red
}
_RESET = "\x1b[0m"


def set_level(name: str) -> None:
    """Set the minimum level at runtime (e.g. "debug")."""
    global _current
    _current = _LEVELS.get(name.lower(), 20)


def _emit(level: str, level_no: int, msg: str) -> None:
    if level_no < _current:
        return
    with _lock:
        if _is_subprocess:
            # Raw — main process handles formatting.
            print(msg, flush=True)
        else:
            ts = datetime.now().strftime("%H:%M:%S")
            color = _COLORS.get(level, "")
            level_str = level.upper().ljust(5)
            print(f"{color}[{ts}] [{level_str}] [py] {msg}{_RESET}", flush=True)


class _Log:
    @staticmethod
    def debug(msg: str) -> None:
        _emit("debug", 10, msg)

    @staticmethod
    def info(msg: str) -> None:
        _emit("info", 20, msg)

    @staticmethod
    def warn(msg: str) -> None:
        _emit("warn", 30, msg)

    @staticmethod
    def error(msg: str) -> None:
        _emit("error", 40, msg)


log = _Log()
