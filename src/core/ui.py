import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# [Ω] PERMANENT UTF-8 ENFORCEMENT (Windows Console Mode)
# This ensures box-drawing characters (│, ─, ┌, └) render correctly on Windows.
if sys.platform == "win32":
    # Set environment variable for any child processes
    os.environ["PYTHONIOENCODING"] = "utf-8"
    
    # Reconfigure stdout/stderr for UTF-8
    for stream in [sys.stdout, sys.stderr]:
        if stream and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (OSError, AttributeError):
                pass
    
    # Enable Windows Console Virtual Terminal Processing (ANSI support)
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        # Enable ANSI escape sequences on Windows 10+
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)  # STD_OUTPUT_HANDLE, ENABLE_VT
    except (AttributeError, OSError):
        pass


class HUD:
    """
    Hyper-Refined User Interface (HUD) Class.
    
    Provides ANSI-colored terminal output primitives for the Corvus Star framework.
    Strictly follows the Linscott Standard for "Iron Clad" reliability.
    """

    # "Glow" Palette - Standard ANSI
    CYAN: str = "\033[36m"
    CYAN_DIM: str = "\033[2;36m"
    GREEN: str = "\033[32m"
    GREEN_DIM: str = "\033[2;32m"
    YELLOW: str = "\033[33m"
    MAGENTA: str = "\033[35m"
    RED: str = "\033[31m"
    RESET: str = "\033[0m"
    BOLD: str = "\033[1m"
    DIM: str = "\033[2m"

    # State
    PERSONA: str = "ALFRED" # Default
    _INITIALIZED: bool = False
    DIALOGUE: Any | None = None # Instance of DialogueRetriever

    @staticmethod
    def _ensure_persona() -> None:
        """[ALFRED] Lazy-load the persona from config if not already set."""
        if HUD._INITIALIZED:
            return
            
        # If PERSONA was set manually before initialization, respect it.
        # But how do we know if it was "manual"? 
        # Default is "ALFRED". If it's something else, maybe it was manual.
        # For simplicity, if we are initializing, we load if config exists.
            
        try:
            from pathlib import Path
            import json
            
            # Resolve root relative to this file: src/core/ui.py -> project_root
            root = Path(__file__).parent.parent.parent.resolve()
            config_path = root / ".agent" / "config.json"
            
            if config_path.exists():
                with config_path.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                    legacy_persona = data.get("persona") or data.get("Persona") or "ALFRED"
                    persona = data.get("system", {}).get("persona", legacy_persona)
                    HUD.PERSONA = str(persona).upper()
        except Exception:
            pass # Stay as ALFRED
        finally:
            HUD._INITIALIZED = True

    @staticmethod
    def _speak(intent: str, fallback: str) -> str:
        """
        Retrieves dialogue from the vector DB or returns fallback.
        
        Args:
            intent: The semantic intent key to look up.
            fallback: The string to return if the intent is not found.
        """
        if HUD.DIALOGUE:
            return HUD.DIALOGUE.get(HUD.PERSONA, intent) or fallback
        return fallback

    # [ALFRED] Theme Registry: Add new persona themes by adding an entry here.
    _THEME_REGISTRY: dict[str, dict[str, str]] = {
        "ODIN": {
            "main": "\033[31m",   # RED
            "dim": "\033[35m",    # MAGENTA
            "accent": "\033[33m", # YELLOW
            "success": "\033[32m",
            "warning": "\033[33m",
            "error": "\033[31m",
            "title": "Ω ODIN ENGINE Ω",
            "prefix": "[ODIN]",
            "war_title": "THE WAR ROOM (CONFLICT RADAR)",
            "trace_label": "TRACE (LIES)",
            "truth_label": "TRUTH (LAW)",
            "greeting": "Speak, wanderer. The Hooded One listens.",
            "success_msg": "It is done. The rune is carved in stone.",
            "error_msg": "The thread snaps. Fate denies this path.",
            "warning_msg": "Gjallarhorn sounds low. Heed this omen."
        },
        "ALFRED": {
            "main": "\033[36m",   # CYAN
            "dim": "\033[2;36m",  # CYAN_DIM
            "accent": "\033[32m", # GREEN
            "success": "\033[32m",
            "warning": "\033[33m",
            "error": "\033[31m",
            "title": "C* BUTLER INTERFACE",
            "prefix": "[ALFRED]",
            "war_title": "THE BATCAVE (ANOMALY DETECTOR)",
            "trace_label": "EVENT LOG",
            "truth_label": "KNOWN TRUTH",
            "greeting": "Good day, sir. How may I be of service?",
            "success_msg": "The task is complete, sir. Everything is in order.",
            "error_msg": "I'm afraid we've encountered a difficulty, sir.",
            "warning_msg": "A word of caution, sir, if I may."
        },
    }

    @staticmethod
    def get_theme() -> dict[str, str]:
        """Returns the comprehensive color palette for the active Persona."""
        HUD._ensure_persona()
        p = HUD.PERSONA.upper()
        # GOD is an alias for ODIN
        if p == "GOD":
            p = "ODIN"
        return HUD._THEME_REGISTRY.get(p, HUD._THEME_REGISTRY["ALFRED"])

    @classmethod
    def transition_ceremony(cls, old_persona: str, new_persona: str) -> None:
        """[ALFRED] Render a dramatic visual ceremony on persona switch."""
        theme = cls._THEME_REGISTRY.get(new_persona.upper(), cls._THEME_REGISTRY["ALFRED"])
        main = theme["main"]
        dim = theme["dim"]
        accent = theme["accent"]
        rst = cls.RESET
        bold = cls.BOLD

        width = 60
        bar = "─" * width

        # Phase 1: Fade-out old persona
        print(f"\n{cls.DIM}{bar}{rst}")
        print(f"{cls.DIM}  ◈  {old_persona.upper()} releasing control...{rst}")
        sys.stdout.flush()
        time.sleep(0.3)

        # Phase 2: Transition flash
        for char in "⟡ ⟡ ⟡ ⟡ ⟡":
            print(f"\r  {accent}{char}{rst}", end="", flush=True)
            time.sleep(0.08)
        print()

        # Phase 3: New persona entrance
        title = theme.get("title", new_persona.upper())
        greeting = theme.get("greeting", "")
        t_len = len(title)
        pad = max(0, (width - t_len - 4) // 2)

        print(f"{main}┌{'─'*pad} {bold}{title}{rst}{main} {'─'*pad}┐{rst}")
        print(f"{main}│{' '*(width-2)}│{rst}")
        if greeting:
            g_pad = max(0, width - 4 - len(greeting))
            print(f"{main}│{rst}  {dim}{greeting}{' '*g_pad}{main}│{rst}")
        print(f"{main}│{' '*(width-2)}│{rst}")
        print(f"{main}└{'─'*(width-2)}┘{rst}")
        print(f"{cls.DIM}{bar}{rst}\n")
        sys.stdout.flush()

    @staticmethod
    def persona_log(level: str, msg: str) -> None:
        """
        Log with persona prefix for major announcements.
        
        Args:
            level: The severity level (INFO, SUCCESS, WARN, ERROR).
            msg: The message to log.
        """
        theme = HUD.get_theme()
        prefix = theme["prefix"]

        color = {
            "INFO": theme["main"],
            "SUCCESS": theme["success"],
            "WARN": theme["warning"],
            "ERROR": theme["error"]
        }.get(level.upper(), theme["main"])

        print(f"{color}{prefix}{HUD.RESET} {msg}")

    @staticmethod
    def _get_width() -> int:
        """Dynamically calculates the optimal HUD width (40-120 range)."""
        try:
            # [ALFRED] Attempt to get terminal size, fallback to 60
            width = os.get_terminal_size().columns - 2
            return max(40, min(120, width))
        except (OSError, AttributeError):
            # [ALFRED] Robust environment parsing
            val = os.environ.get("HUD_WIDTH", "60")
            try:
                return max(10, int(val))
            except (ValueError, TypeError):
                return 60

    @staticmethod
    def box_top(title: str = "", color: str | None = None, width: int | None = None) -> None:
        """
        Renders the top implementation of a box with a title.
        
        Args:
            title: The text to display in the center header.
            color: Optional override for the main color.
            width: Override width. Defaults to auto-calculated width.
        """
        if width is None:
            width = HUD._get_width()
        if not isinstance(width, int):
            width = 60
        HUD._last_width = width

        theme = HUD.get_theme()
        display_title = title if title else theme["title"]
        main_color = color if color else theme['main']
        dim_color = color if color else theme['dim']

        # Calculate padding
        t_len = len(display_title)
        total_padding = max(0, width - t_len - 4) # -4 for corners and spaces
        pad_l = total_padding // 2
        pad_r = total_padding - pad_l

        # Glow effect
        print(f"{dim_color}┌{'─'*pad_l} {main_color}{HUD.BOLD}{display_title}{HUD.RESET}{dim_color} {'─'*pad_r}┐{HUD.RESET}")

    @staticmethod
    def box_row(label: str, value: Any, color: str | None = None, dim_label: bool = False, width: int | None = None) -> None:
        """
        Renders a row within a box.
        
        Args:
            label: The key string (left side).
            value: The value string (right side).
            color: Optional color for the value.
            dim_label: Whether to dim the label color.
            width: Override width.
        """
        if width is None:
            width = getattr(HUD, "_last_width", 60)
        if not isinstance(width, int):
            width = 60
        theme = HUD.get_theme()
        val_color = color if color else theme['main']
        lbl_color = theme['dim'] if dim_label else theme['main']

        # Calculate spacing
        # Structure: "│ Label      Value │"
        # Border(1) + Label(20) + Space(1) + Value(N) + Border(1)
        # For now, we keep the fixed label width of 20 for alignment,
        # but ensure the box closes at 'width'

        # Safe string conversion and multi-line handling
        try:
            str_val = str(value).replace("\n", " ")
            str_lbl = str(label)
        except Exception:
            str_val = "[TYPE ERROR]"
            str_lbl = "[TYPE ERROR]"

        # Truncate if too long (Defensive)
        max_val_len = width - 24 # 1(L) + 20(Lbl) + 1(Space) + 1(Space) + 1(R)
        if len(str_val) > max_val_len:
            str_val = str_val[:max_val_len-3] + "..."
        inner_content = f"{lbl_color}{str_lbl:<20}{HUD.RESET} {val_color}{str_val}{HUD.RESET}"
        # We need to calculate spaces based on RAW text length to avoid ANSI code interference
        raw_len = 1 + 20 + 1 + len(str_val)
        padding = max(0, width - 2 - raw_len)

        print(f"{theme['dim']}│{HUD.RESET} {inner_content}{' '*padding} {theme['dim']}│{HUD.RESET}")

    @staticmethod
    def box_separator(color: str | None = None, width: int | None = None) -> None:
        """Renders a middle separator line."""
        if width is None:
            width = getattr(HUD, "_last_width", 60)
        if not isinstance(width, int):
            width = 60
        theme = HUD.get_theme()
        dim_color = color if color else theme['dim']
        inner_width = width - 2
        print(f"{dim_color}├{'─'*inner_width}┤{HUD.RESET}")

    @staticmethod
    def box_bottom(color: str | None = None, width: int | None = None) -> None:
        """Renders the bottom closure of a box."""
        if width is None:
            width = getattr(HUD, "_last_width", 60)
        if not isinstance(width, int):
            width = 60
        theme = HUD.get_theme()
        dim_color = color if color else theme['dim']
        inner_width = width - 2
        print(f"{dim_color}└{'─'*inner_width}┘{HUD.RESET}")

    @staticmethod
    def progress_bar(val: float, width: int = 10) -> str:
        """
        Generates a progress bar string.
        
        Args:
            val: Float between 0.0 and 1.0.
            width: Number of characters for the bar.
        """
        # [||||||....] with subtle coloring
        safe_val = max(0.0, min(1.0, val))
        blocks = int(safe_val * width)
        bar = f"{HUD.GREEN}" + "█" * blocks + f"{HUD.GREEN_DIM}" + "░" * (width - blocks) + f"{HUD.RESET}"
        return bar

    @staticmethod
    def render_sparkline(data: list[float], max_points: int = 20) -> str:
        """
        Generates an ASCII Sparkline.
        
        Args:
            data: List of float values.
            max_points: Maximum characters to render.
        """
        BARS = " ▂▃▄▅▆▇█"
        if not data: return ""

        try:
            # [ALFRED] Filter non-numeric to prevent crashes
            visible = [float(x) for x in data[-max_points:] if isinstance(x, (int, float, str))]
            if not visible: return ""

            min_val = min(visible)
            max_val = max(visible)
            range_val = max_val - min_val

            if range_val == 0:
                return BARS[0] * len(visible)

            line = ""
            for x in visible:
                normalized = (x - min_val) / range_val
                index = int(normalized * (len(BARS) - 1))
                line += BARS[index]
            return line
        except (ValueError, TypeError, ZeroDivisionError):
            return "ERR"

    @staticmethod
    def log(level: str, msg: str, detail: str = "") -> None:
        """Standardized Logging to Terminal (Persona-Aware)."""
        ts = datetime.now().strftime("%H:%M:%S")
        theme = HUD.get_theme()
        
        color = theme["main"]
        if level == "WARN": color = theme["warning"]
        if level == "FAIL": color = theme["error"]
        if level == "PASS": color = theme["success"]
        if level == "CRITICAL": color = theme["error"] # Default to error for critical

        print(f"{HUD.DIM}[{ts}]{HUD.RESET} {color}[{level}]{HUD.RESET} {msg} {HUD.DIM}{detail}{HUD.RESET}")

    @staticmethod
    def warning(msg: str) -> None:
        """
        Shorthand for a yellow warning log.
        
        Args:
            msg: The warning message as a string.
        """
        HUD.log("WARN", msg)

    @staticmethod
    def divider(label: str = "") -> None:
        """Prints a visual divider line."""
        theme = HUD.get_theme()
        width = 60
        if label:
            print(f"{theme['dim']}── {theme['accent']}{label}{theme['dim']} {'─'*(width-len(label)-4)}{HUD.RESET}")
        else:
            print(f"{theme['dim']}{'─'*width}{HUD.RESET}")

    @staticmethod
    def log_rejection(persona: str, reason: str, details: str) -> None:
        """Logs a rejected attempt to the rejection ledger using Pathlib."""
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"| {ts} | {persona} | {reason} | {details} |\n"
        # We target a specific ledger path: .agent/traces/quarantine/REJECTIONS.qmd
        ledger_path = Path.cwd() / ".agent" / "traces" / "quarantine" / "REJECTIONS.qmd"
        try:
            ledger_path.parent.mkdir(parents=True, exist_ok=True)
            if not ledger_path.exists():
                ledger_path.write_text("# 🧪 The Crucible: Rejection Ledger\n\n| Timestamp | Persona | Reason | Details |\n| :--- | :--- | :--- | :--- |\n", encoding='utf-8')
            with ledger_path.open("a", encoding="utf-8") as f:
                f.write(entry)
        except (OSError, PermissionError):
            pass
