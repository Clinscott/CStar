from datetime import datetime
from typing import Any


class SovereignHUD:
    """
    Hyper-Refined User Interface (SovereignHUD) Class.
    
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
    DIALOGUE: Any | None = None # Instance of DialogueRetriever

    @staticmethod
    def _speak(intent: str, fallback: str) -> str:
        """Retrieves dialogue from the vector DB or returns fallback."""
        if SovereignHUD.DIALOGUE:
            return SovereignHUD.DIALOGUE.get(intent) or fallback
        return fallback

    @staticmethod
    def _get_theme() -> dict[str, str]:
        """Returns the color palette for the active Persona."""
        p = SovereignHUD.PERSONA.upper()
        if p in ["GOD", "ODIN"]:
            return {
                "main": SovereignHUD.RED,
                "dim": SovereignHUD.MAGENTA,
                "accent": SovereignHUD.YELLOW,
                "title": "Ω ODIN ENGINE Ω",
                "war_title": "THE WAR ROOM (CONFLICT RADAR)",
                "trace_label": "TRACE (LIES)",
                "truth_label": "TRUTH (LAW)"
            }
        # Default / Alfred
        return {
            "main": SovereignHUD.CYAN,
            "dim": SovereignHUD.CYAN_DIM,
            "accent": SovereignHUD.GREEN,
            "title": "C* NEURAL TRACE",
            "war_title": "THE BATCAVE (ANOMALY DETECTOR)",
            "trace_label": "EVENT LOG",
            "truth_label": "KNOWN TRUTH"
        }

    @staticmethod
    def box_top(title: str = "", color: str | None = None, width: int = 60) -> None:
        """
        Renders the top implementation of a box with a title.
        
        Args:
            title: The text to display in the center header.
            color: Optional override for the main color.
            width: Total character width of the box (min 10).
        """
        assert isinstance(width, int) and width >= 10, "Width must be integer >= 10"

        theme = SovereignHUD._get_theme()
        display_title = title if title else theme["title"]
        main_color = color if color else theme['main']
        dim_color = color if color else theme['dim']

        # Calculate padding
        t_len = len(display_title)
        total_padding = max(0, width - t_len - 4) # -4 for corners and spaces
        pad_l = total_padding // 2
        pad_r = total_padding - pad_l

        # Glow effect
        print(f"{dim_color}┌{'─'*pad_l} {main_color}{SovereignHUD.BOLD}{display_title}{SovereignHUD.RESET}{dim_color} {'─'*pad_r}┐{SovereignHUD.RESET}")

    @staticmethod
    def box_row(label: str, value: Any, color: str | None = None, dim_label: bool = False, width: int = 60) -> None:
        """
        Renders a row within a box.
        
        Args:
            label: The key string (left side).
            value: The value string (right side).
            color: Optional color for the value.
            dim_label: Whether to dim the label color.
            width: Total width of the box.
        """
        theme = SovereignHUD._get_theme()
        val_color = color if color else theme['main']
        lbl_color = theme['dim'] if dim_label else theme['main']

        # Calculate spacing
        # Structure: "│ Label      Value │"
        # Border(1) + Label(20) + Space(1) + Value(N) + Border(1)
        # For now, we keep the fixed label width of 20 for alignment,
        # but ensure the box closes at 'width'

        # Safe string conversion
        str_val = str(value)
        str_lbl = str(label)

        # Truncate if too long (Defensive)
        max_val_len = width - 24 # 1(L) + 20(Lbl) + 1(Space) + 1(Space) + 1(R)
        if len(str_val) > max_val_len:
            str_val = str_val[:max_val_len-3] + "..."

        padding = width - 1 - 20 - 1 - len(str_val) - 1
        if padding < 0: padding = 0

        print(f"{theme['dim']}│{SovereignHUD.RESET} {lbl_color}{str_lbl:<20}{SovereignHUD.RESET} {val_color}{str_val}{' '*padding}{theme['dim']}│{SovereignHUD.RESET}")

    @staticmethod
    def box_separator(color: str | None = None, width: int = 60) -> None:
        """Renders a middle separator line."""
        theme = SovereignHUD._get_theme()
        dim_color = color if color else theme['dim']
        inner_width = width - 2
        print(f"{dim_color}├{'─'*inner_width}┤{SovereignHUD.RESET}")

    @staticmethod
    def box_bottom(color: str | None = None, width: int = 60) -> None:
        """Renders the bottom closure of a box."""
        theme = SovereignHUD._get_theme()
        dim_color = color if color else theme['dim']
        inner_width = width - 2
        print(f"{dim_color}└{'─'*inner_width}┘{SovereignHUD.RESET}")

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
        bar = f"{SovereignHUD.GREEN}" + "█" * blocks + f"{SovereignHUD.GREEN_DIM}" + "░" * (width - blocks) + f"{SovereignHUD.RESET}"
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

        # Slice to max points
        visible = data[-max_points:]
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

    @staticmethod
    def log(level: str, msg: str, detail: str = "") -> None:
        """
        Standardized Logging to Terminal.
        
        Args:
            level: 'INFO', 'WARN', 'FAIL', 'PASS', 'CRITICAL'.
            msg: Main message.
            detail: Secondary detail string.
        """
        ts = datetime.now().strftime("%H:%M:%S")
        color = SovereignHUD.CYAN
        if level == "WARN": color = SovereignHUD.YELLOW
        if level == "FAIL": color = SovereignHUD.RED
        if level == "PASS": color = SovereignHUD.GREEN
        if level == "CRITICAL": color = SovereignHUD.MAGENTA

        print(f"{SovereignHUD.DIM}[{ts}]{SovereignHUD.RESET} {color}[{level}]{SovereignHUD.RESET} {msg} {SovereignHUD.DIM}{detail}{SovereignHUD.RESET}")
