import asyncio
import contextlib
import json
import os
import sys
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
    """Compatibility-focused terminal presentation layer."""

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
    CURSOR_HIDE: str = "\033[?25l"
    CURSOR_SHOW: str = "\033[?25h"

    PERSONA: str = "ALFRED"
    DIALOGUE: Any = None
    _INITIALIZED: bool = False
    _CACHED_THEME: dict[str, str] | None = None
    _CACHED_WIDTH: int = 64
    _last_width: int = 64
    _render_queue: asyncio.Queue[str | None] | None = None
    _render_lock: asyncio.Lock | None = None

    @classmethod
    def _initialize(cls) -> None:
        if cls._INITIALIZED:
            return
        cls._ensure_persona()

    @classmethod
    def _ensure_persona(cls) -> None:
        try:
            config_path = Path.cwd() / ".agents" / "config.json"
            if config_path.exists():
                try:
                    data = json.loads(config_path.read_text(encoding="utf-8"))
                except (OSError, TypeError, ValueError, json.JSONDecodeError):
                    data = {}

                if isinstance(data, dict):
                    system = data.get("system", {})
                    if not isinstance(system, dict):
                        system = {}
                    persona = system.get("persona", data.get("persona", "ALFRED"))
                    if isinstance(persona, str) and persona.strip():
                        cls.PERSONA = persona.upper()

            try:
                width = os.get_terminal_size().columns - 4
                cls._CACHED_WIDTH = max(40, min(100, width))
            except OSError:
                cls._CACHED_WIDTH = 64

            themes = {
                "ODIN": {
                    "main": cls.RED,
                    "dim": cls.MAGENTA,
                    "prefix": "[O.D.I.N.]",
                    "title": "OMEGA O.D.I.N. GUNGNIR CONTROL",
                    "war_title": "THE WAR ROOM",
                    "trace_label": "Target",
                },
                "ALFRED": {
                    "main": cls.CYAN,
                    "dim": cls.CYAN_DIM,
                    "prefix": "[A.L.F.R.E.D.]",
                    "title": "CSTAR A.L.F.R.E.D. DASHBOARD",
                    "war_title": "TRACE ANALYSIS",
                    "trace_label": "Trace",
                },
            }
            cls._CACHED_THEME = themes.get(cls.PERSONA, themes["ALFRED"])
        finally:
            cls._INITIALIZED = True

    @classmethod
    def get_theme(cls) -> dict[str, str]:
        cls._initialize()
        return dict(cls._CACHED_THEME or {})

    @classmethod
    def get_render_queue(cls) -> asyncio.Queue[str | None]:
        if cls._render_queue is None:
            cls._render_queue = asyncio.Queue()
        return cls._render_queue

    @classmethod
    def _get_render_lock(cls) -> asyncio.Lock:
        if cls._render_lock is None:
            cls._render_lock = asyncio.Lock()
        return cls._render_lock

    @classmethod
    def _write_line(cls, text: str, *, stream: Any = None) -> None:
        target = stream or sys.stdout
        target.write(text + "\n")
        target.flush()

    @classmethod
    def box_top(cls, title: str = "", width: int | None = None) -> None:
        cls._initialize()
        theme = cls.get_theme()
        active_width = max(20, width or cls._CACHED_WIDTH)
        cls._last_width = active_width
        display_title = title or theme["title"]
        border = "+" + "=" * max(2, active_width - 2) + "+"
        cls._write_line(f"{theme['main']}{border}{cls.RESET}")
        cls._write_line(f"{theme['main']}| {cls.BOLD}{display_title}{cls.RESET}{theme['main']}")

    @classmethod
    def box_row(cls, label: str, value: Any, color: str | None = None, dim_label: bool = False) -> None:
        cls._initialize()
        theme = cls.get_theme()
        label_color = cls.DIM if dim_label else theme["dim"]
        value_color = color or theme["main"]
        cls._write_line(f"{theme['main']}|{cls.RESET} {label_color}{label}{cls.RESET}: {value_color}{value}{cls.RESET}")

    @classmethod
    def box_separator(cls) -> None:
        cls._initialize()
        theme = cls.get_theme()
        border = "+" + "=" * max(2, cls._last_width - 2) + "+"
        cls._write_line(f"{theme['main']}{border}{cls.RESET}")

    @classmethod
    def box_bottom(cls) -> None:
        cls.box_separator()

    @classmethod
    def log(cls, level: str, msg: str, detail: str = "") -> None:
        cls._initialize()
        ts = datetime.now().strftime("%H:%M:%S")
        cls._write_line(f"[{ts}] [{level}] {cls.PERSONA} {msg} {detail}".rstrip())

    @classmethod
    def persona_log(cls, persona: str, msg: str, detail: str = "") -> None:
        cls._initialize()
        ts = datetime.now().strftime("%H:%M:%S")
        cls._write_line(f"[{ts}] {persona.upper()} {msg} {detail}".rstrip())

    @classmethod
    def warning(cls, msg: str, detail: str = "") -> None:
        cls.log("WARN", msg, detail)

    @classmethod
    def _speak(cls, prompt: str, detail: str = "") -> str:
        cls._initialize()
        return " ".join(part for part in [prompt, detail] if part).strip()

    @classmethod
    def progress_bar(cls, value: float, width: int = 20) -> str:
        clamped = max(0.0, min(1.0, value))
        filled = int(round(clamped * width))
        return "█" * filled + "░" * (width - filled)

    @classmethod
    def render_sparkline(cls, data: list[float]) -> str:
        if not data:
            return ""
        blocks = " ▁▂▃▄▅▆▇█"
        low = min(data)
        high = max(data)
        if high == low:
            return blocks[-1] * len(data)
        chars: list[str] = []
        for point in data:
            normalized = (point - low) / (high - low)
            index = int(round(normalized * (len(blocks) - 1)))
            chars.append(blocks[index])
        return "".join(chars)

    @classmethod
    async def broadcast(cls, source: str, message: str) -> None:
        await cls.get_render_queue().put(f"[{source}] {message}")

    @classmethod
    async def render_loop(cls, output_stream: Any = None) -> None:
        queue = cls.get_render_queue()
        lock = cls._get_render_lock()
        target = output_stream or sys.stdout
        while True:
            item = await queue.get()
            try:
                if item is None:
                    return
                async with lock:
                    target.write(item + "\n")
                    target.flush()
            finally:
                queue.task_done()

    @classmethod
    async def stream_text(cls, text: str, delay: float = 0.015, output_stream: Any = None) -> None:
        target = output_stream or sys.stdout
        target.write(cls.CURSOR_HIDE)
        target.flush()
        try:
            for char in text:
                target.write(char)
                target.flush()
                await asyncio.sleep(delay)
        finally:
            target.write("\n" + cls.CURSOR_SHOW)
            target.flush()

    @classmethod
    def log_rejection(cls, persona: str, reason: str, details: str) -> Path:
        ledger = Path.cwd() / ".agents" / "traces" / "quarantine" / "REJECTIONS.qmd"
        ledger.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().isoformat(timespec="seconds")
        with ledger.open("a", encoding="utf-8") as handle:
            handle.write(
                f"\n## {timestamp} [{persona}]\n"
                f"- Reason: {reason}\n"
                f"- Details: {details}\n"
            )
        return ledger
