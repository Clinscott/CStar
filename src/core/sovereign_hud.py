import asyncio
import contextlib
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# [Ω] PERMANENT UTF-8 ENFORCEMENT
if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"
    for stream in [sys.stdout, sys.stderr]:
        if stream and hasattr(stream, "reconfigure"):
            with contextlib.suppress(OSError, AttributeError):
                stream.reconfigure(encoding="utf-8", errors="replace")

class SovereignHUD:
    """
    Hyper-Refined User Interface (SovereignHUD) Class.
    Optimized for structural integrity and layout performance.
    """
    _COLORS_DISABLED: bool = os.environ.get("NO_COLOR") == "true" or not sys.stdout.isatty()
    CYAN: str = "\033[36m" if not _COLORS_DISABLED else ""
    CYAN_DIM: str = "\033[2;36m" if not _COLORS_DISABLED else ""
    GREEN: str = "\033[32m" if not _COLORS_DISABLED else ""
    YELLOW: str = "\033[33m" if not _COLORS_DISABLED else ""
    MAGENTA: str = "\033[35m" if not _COLORS_DISABLED else ""
    RED: str = "\033[31m" if not _COLORS_DISABLED else ""
    RESET: str = "\033[0m" if not _COLORS_DISABLED else ""
    BOLD: str = "\033[1m" if not _COLORS_DISABLED else ""
    DIM: str = "\033[2m" if not _COLORS_DISABLED else ""

    PERSONA: str = "ALFRED"
    _INITIALIZED: bool = False
    _CACHED_THEME: dict = None
    _CACHED_WIDTH: int = 64

    @classmethod
    def _initialize(cls) -> None:
        if cls._INITIALIZED: return
        try:
            import json
            config_path = Path.cwd() / ".agents" / "config.json"
            if config_path.exists():
                data = json.loads(config_path.read_text(encoding="utf-8"))
                cls.PERSONA = data.get("system", {}).get("persona", data.get("persona", "ALFRED")).upper()
            
            try:
                width = os.get_terminal_size().columns - 4
                cls._CACHED_WIDTH = max(40, min(100, width))
            except Exception: cls._CACHED_WIDTH = 64
            
            themes = {
                "ODIN": {"main": "\033[31m", "dim": "\033[35m", "prefix": "[O.D.I.N.]", "title": "Ω O.D.I.N. GUNGNIR CONTROL Ω"},
                "ALFRED": {"main": "\033[36m", "dim": "\033[2;36m", "prefix": "[A.L.F.R.E.D.]", "title": "C* A.L.F.R.E.D. DASHBOARD"}
            }
            cls._CACHED_THEME = themes.get(cls.PERSONA, themes["ALFRED"])
        except Exception: pass
        finally: cls._INITIALIZED = True

    @classmethod
    def box_top(cls, title: str = "") -> None:
        cls._initialize()
        theme = cls._CACHED_THEME
        display_title = title or theme["title"]
        pad = max(0, (cls._CACHED_WIDTH - len(display_title) - 4) // 2)
        r_pad = cls._CACHED_WIDTH - len(display_title) - 4 - pad
        print(f"{theme['main']}+{'='*pad} {cls.BOLD}{display_title}{cls.RESET}{theme['main']} {'='*r_pad}+{cls.RESET}", file=sys.stderr)

    @classmethod
    def box_row(cls, label: str, value: Any, color: str | None = None) -> None:
        cls._initialize()
        theme = cls._CACHED_THEME
        str_val = str(value).replace("\n", " ")
        str_lbl = str(label).ljust(20)
        padding = max(0, cls._CACHED_WIDTH - (2 + 20 + 2 + len(str_val)) - 2)
        print(f"{theme['main']}|{cls.RESET}  {theme['dim']}{str_lbl}{cls.RESET}  {color or theme['main']}{str_val}{cls.RESET}{' '*padding} {theme['main']}|{cls.RESET}", file=sys.stderr)

    @classmethod
    def box_bottom(cls) -> None:
        cls._initialize()
        print(f"{cls._CACHED_THEME['main']}+{'='*(cls._CACHED_WIDTH-2)}+{cls.RESET}", file=sys.stderr)

    @classmethod
    def box_separator(cls) -> None:
        cls._initialize()
        print(f"{cls._CACHED_THEME['main']}+{'='*(cls._CACHED_WIDTH-2)}+{cls.RESET}", file=sys.stderr)

    @classmethod
    def log(cls, level: str, msg: str, detail: str = "") -> None:
        cls._initialize()
        ts = datetime.now().strftime("%H:%M:%S")
        color = cls.CYAN
        if level == "FAIL": color = cls.RED
        elif level == "WARN": color = cls.YELLOW
        print(f"{cls.DIM}[{ts}]{cls.RESET} {color}[{level}]{cls.RESET} {msg} {cls.DIM}{detail}{cls.RESET}", file=sys.stderr)

    @classmethod
    def persona_log(cls, persona: str, msg: str, detail: str = "") -> None:
        cls._initialize()
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"{cls.DIM}[{ts}]{cls.RESET} {cls.CYAN}{persona.upper()}{cls.RESET} {msg} {cls.DIM}{detail}{cls.RESET}", file=sys.stderr)

    @classmethod
    async def stream_text(cls, text: str, delay: float = 0.015) -> None:
        for char in text:
            sys.stderr.write(char)
            sys.stderr.flush()
            await asyncio.sleep(delay)
        sys.stderr.write("\n")