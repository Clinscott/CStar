import asyncio
import contextlib
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# [Ω] PERMANENT UTF-8 ENFORCEMENT (Windows Console Mode)
if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"
    for stream in [sys.stdout, sys.stderr]:
        if stream and hasattr(stream, "reconfigure"):
            with contextlib.suppress(OSError, AttributeError):
                stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except (AttributeError, OSError):
        pass


class SovereignHUD:
    """
    Hyper-Refined User Interface (SovereignHUD) Class.
    Standard: Linscott Protocol ([L] > 4.0 Compliance).
    """

    _COLORS_DISABLED: bool = os.environ.get("NO_COLOR") == "true" or not sys.stdout.isatty()

    CYAN: str = "\033[36m" if not _COLORS_DISABLED else ""
    CYAN_DIM: str = "\033[2;36m" if not _COLORS_DISABLED else ""
    GREEN: str = "\033[32m" if not _COLORS_DISABLED else ""
    GREEN_DIM: str = "\033[2;32m" if not _COLORS_DISABLED else ""
    YELLOW: str = "\033[33m" if not _COLORS_DISABLED else ""
    MAGENTA: str = "\033[35m" if not _COLORS_DISABLED else ""
    RED: str = "\033[31m" if not _COLORS_DISABLED else ""
    RESET: str = "\033[0m" if not _COLORS_DISABLED else ""
    BOLD: str = "\033[1m" if not _COLORS_DISABLED else ""
    DIM: str = "\033[2m" if not _COLORS_DISABLED else ""

    PERSONA: str = "ALFRED"
    _INITIALIZED: bool = False
    _last_width: int = 64

    @staticmethod
    def _ensure_persona() -> None:
        if SovereignHUD._INITIALIZED:
            return
        try:
            import json
            root = Path.cwd()
            config_path = root / ".agent" / "config.json"
            if not config_path.exists():
                root = Path(__file__).parent.parent.parent.resolve()
                config_path = root / ".agent" / "config.json"
            if config_path.exists():
                with config_path.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                    legacy_persona = data.get("persona") or data.get("Persona") or "ALFRED"
                    persona = data.get("system", {}).get("persona", legacy_persona)
                    SovereignHUD.PERSONA = str(persona).upper()
        except Exception:
            pass
        finally:
            SovereignHUD._INITIALIZED = True

    _THEME_REGISTRY: dict[str, dict[str, str]] = {
        "ODIN": {
            "main": "\033[31m",   # RED
            "dim": "\033[35m",    # MAGENTA
            "accent": "\033[33m", # YELLOW
            "title": "Ω O.D.I.N. GUNGNIR CONTROL Ω",
            "prefix": "[O.D.I.N.]",
            "greeting": "Speak, wanderer. The Hooded One listens.",
        },
        "ALFRED": {
            "main": "\033[36m",   # CYAN
            "dim": "\033[2;36m",  # CYAN_DIM
            "accent": "\033[32m", # GREEN
            "title": "C* A.L.F.R.E.D. DASHBOARD",
            "prefix": "[A.L.F.R.E.D.]",
            "greeting": "Good day, sir. How may I be of service?",
        },
    }

    @staticmethod
    def get_theme() -> dict[str, str]:
        SovereignHUD._ensure_persona()
        p = SovereignHUD.PERSONA.upper()
        if p in ("GOD", "O.D.I.N."): p = "ODIN"
        return SovereignHUD._THEME_REGISTRY.get(p, SovereignHUD._THEME_REGISTRY["ALFRED"])

    @staticmethod
    def _get_width() -> int:
        try:
            width = os.get_terminal_size().columns - 4
            return max(40, min(100, width))
        except (OSError, AttributeError):
            return 64

    @staticmethod
    def box_top(title: str = "") -> None:
        width = SovereignHUD._get_width()
        SovereignHUD._last_width = width
        theme = SovereignHUD.get_theme()
        display_title = title if title else theme["title"]
        main_color = theme['main']
        
        t_len = len(display_title)
        pad = max(0, (width - t_len - 4) // 2)
        r_pad = width - t_len - 4 - pad
        
        print(f"{main_color}+{'='*pad} {SovereignHUD.BOLD}{display_title}{SovereignHUD.RESET}{main_color} {'='*r_pad}+{SovereignHUD.RESET}")

    @staticmethod
    def box_row(label: str, value: Any, color: str | None = None, dim_label: bool = True) -> None:
        width = SovereignHUD._last_width
        theme = SovereignHUD.get_theme()
        main_color = theme['main']
        val_color = color if color else theme['main']
        lbl_color = theme['dim'] if dim_label else theme['main']

        str_val = str(value).replace("\n", " ")
        str_lbl = str(label).ljust(20)
        
        # Calculate padding based on raw length
        raw_len = 2 + 20 + 2 + len(str_val)
        padding = max(0, width - raw_len - 2)
        
        print(f"{main_color}|{SovereignHUD.RESET}  {lbl_color}{str_lbl}{SovereignHUD.RESET}  {val_color}{str_val}{SovereignHUD.RESET}{' '*padding} {main_color}|{SovereignHUD.RESET}")

    @staticmethod
    def box_separator() -> None:
        width = SovereignHUD._last_width
        main_color = SovereignHUD.get_theme()['main']
        print(f"{main_color}+{'='*(width-2)}+{SovereignHUD.RESET}")

    @staticmethod
    def box_bottom() -> None:
        width = SovereignHUD._last_width
        main_color = SovereignHUD.get_theme()['main']
        print(f"{main_color}+{'='*(width-2)}+{SovereignHUD.RESET}")

    @staticmethod
    def persona_log(persona: str, msg: str, detail: str = "") -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        theme = SovereignHUD._THEME_REGISTRY.get(persona.upper(), SovereignHUD._THEME_REGISTRY["ALFRED"])
        color = theme["main"] if not SovereignHUD._COLORS_DISABLED else ""
        reset = SovereignHUD.RESET if not SovereignHUD._COLORS_DISABLED else ""
        dim = SovereignHUD.DIM if not SovereignHUD._COLORS_DISABLED else ""
        prefix = theme["prefix"]
        print(f"{dim}[{ts}]{reset} {color}{prefix}{reset} {msg} {dim}{detail}{reset}")

    @staticmethod
    def log(level: str, msg: str, detail: str = "") -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        theme = SovereignHUD.get_theme()
        color = theme["main"]
        if level == "WARN": color = SovereignHUD.YELLOW
        if level == "FAIL": color = SovereignHUD.RED
        print(f"{SovereignHUD.DIM}[{ts}]{SovereignHUD.RESET} {color}[{level}]{SovereignHUD.RESET} {msg} {SovereignHUD.DIM}{detail}{SovereignHUD.RESET}")

    @classmethod
    async def stream_text(cls, text: str, delay: float = 0.015) -> None:
        for char in text:
            sys.stdout.write(char)
            sys.stdout.flush()
            await asyncio.sleep(delay)
        sys.stdout.write("\n")
