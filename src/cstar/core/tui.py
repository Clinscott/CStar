"""
Operation Ragnarök: The Sovereign HUD Rebirth.

A multi-screen, lore-drenched Textual TUI for the Corvus Star autonomous loop.
Two loadouts:
    - ODIN  "VIGRID"  : DOOM/Quake aesthetic  (ruby, gold, runes, heavy chrome)
    - ALFRED "BATCAVE" : C64/Spy Hunter aesthetic (green phosphor, thin borders)

Linscott Standard Compliance:
    - Strict Type Hints
    - Docstrings for all classes/methods
    - Error Resiliency (Graceful Degradation)

# TODO: [Alfred's Whisper] Sir, might we add a status-bar tooltip for new users
#       who are unfamiliar with the keybindings?
"""

import asyncio
import contextlib
import json
import os
import random
from pathlib import Path
from typing import Any, ClassVar

try:
    import yaml
except ModuleNotFoundError:  # PyYAML not installed — greetings will use fallbacks
    yaml = None  # type: ignore[assignment]

from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen, Screen
from textual.suggester import SuggestFromList
from textual.widgets import Footer, Input, Label, Log, Static

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent.parent
HOST: str = "localhost"
PORT: int = int(os.getenv("CSTAR_DAEMON_PORT", "50051"))

# ---------------------------------------------------------------------------
# Lore Dictionary  —  Deep Norse (ODIN) / Batman Universe (ALFRED)
# ---------------------------------------------------------------------------
LORE: dict[str, dict[str, str]] = {
    "ODIN": {
        # Identity
        "app_title":       "ᚠ HLIDSKJALF ᚠ  —  THE HIGH SEAT",
        "theme_class":     "theme-odin",
        "prompt":          "C* Ω>",
        # Zones
        "header_title":    "⚔ VIGRID COMMAND",
        "sidebar_title":   "WAR ROOM",
        "trace_title":     "TRACE (LIES)",
        "console_title":   "THE WELL OF MIMIR",
        "forge_title":     "GUNGNIR FORGE",
        "help_title":      "MIMIR'S COUNSEL",
        # Decorators
        "separator":       "ᚱ",
        "bullet":          "ᚠ",
        "divider":         "═══════════════════",
        "empty_state":     "GINNUNGAGAP — The Primordial Void awaits your command.",
        # Status
        "online":          "VIGRID ONLINE",
        "offline":         "RAGNARÖK — LINK SEVERED",
        "gphs_label":      "ODIN'S EYE",
        # Forge
        "forge_start":     "Gungnir is cast. It will not miss.",
        "forge_progress":  "The spear flies true...",
        "forge_done":      "The target is struck. The rune is carved.",
        "forge_fail":      "The thread snaps. Ragnarök whispers.",
        # Transition
        "transition_in":   "The Allfather descends from Hlidskjalf...",
        "transition_out":  "Odin withdraws. The ravens circle.",
    },
    "ALFRED": {
        # Identity
        "app_title":       "C* BATCAVE MAINFRAME",
        "theme_class":     "theme-alfred",
        "prompt":          "C* >",
        # Zones
        "header_title":    "BATCAVE SYSTEMS",
        "sidebar_title":   "MISSION LOG",
        "trace_title":     "EVENT LOG",
        "console_title":   "BATCOMPUTER TERMINAL",
        "forge_title":     "THE WORKSHOP",
        "help_title":      "BUTLER'S MANUAL",
        # Decorators
        "separator":       "·",
        "bullet":          "○",
        "divider":         "───────────────────",
        "empty_state":     "The Cave is quiet, sir. Awaiting your instruction.",
        # Status
        "online":          "CAVE SYSTEMS ONLINE",
        "offline":         "CAVE LINK DISRUPTED",
        "gphs_label":      "SYSTEM HEALTH",
        # Forge
        "forge_start":     "The Workshop is prepared, sir.",
        "forge_progress":  "Fabrication in progress, sir...",
        "forge_done":      "The modification is complete, sir. Everything is in order.",
        "forge_fail":      "I'm afraid there was a complication, sir.",
        # Transition
        "transition_in":   "Alfred is assuming control of the Batcomputer...",
        "transition_out":  "Very good, sir. I shall step aside.",
    },
}

# ---------------------------------------------------------------------------
# ASCII Art  —  Expanded Transition Sequences
# ---------------------------------------------------------------------------
ODIN_FRAMES: list[str] = [
    # Frame 1: Distant spear
    "[bold red]"
    "\n"
    "\n"
    "                              ──══▶"
    "\n"
    "[/bold red]",
    # Frame 2: Approaching
    "[bold red]"
    "\n"
    "                        ────════▶▶"
    "\n"
    "[/bold red]",
    # Frame 3: Full Gungnir
    "[bold red]"
    "\n"
    "                    /               "
    "\n"
    "                  /                 "
    "\n"
    "   [bold yellow]──────════════▶[/bold yellow]  "
    "\n"
    "              /                     "
    "\n"
    "            /                       "
    "\n"
    "[/bold red]",
    # Frame 4: Impact flash
    "[bold yellow]"
    "\n"
    "           ░░▒▒▓▓██ GUNGNIR ██▓▓▒▒░░"
    "\n"
    "[/bold yellow]",
    # Frame 5: Rune cascade
    "[bold red]"
    "\n"
    "       ᚠ  ᚢ  ᚦ  ᚨ  ᚱ  ᚲ  ᚷ  ᚹ  ᚺ"  # noqa: RUF001
    "\n"
    "    ᚾ  ᛁ  ᛃ  ᛇ  ᛈ  ᛉ  ᛊ  ᛏ  ᛒ  ᛗ"  # noqa: RUF001
    "\n"
    "       ᛚ  ᛜ  ᛝ  ᛞ  ᛟ  ᛠ  ᛡ  ᛢ  ᛣ"
    "\n"
    "[/bold red]",
    # Frame 6: Title reveal
    "[bold yellow on #1a0500]"
    "\n"
    "    ╔══════════════════════════════╗"
    "\n"
    "    ║   ᚠ  HLIDSKJALF ONLINE  ᚠ   ║"
    "\n"
    "    ╚══════════════════════════════╝"
    "\n"
    "[/bold yellow on #1a0500]",
]

ALFRED_FRAMES: list[str] = [
    # Frame 1: Phosphor boot
    "[green]"
    "\n"
    "    BOOTING BATCAVE MAINFRAME..."
    "\n"
    "[/green]",
    # Frame 2: Memory check
    "[green]"
    "\n"
    "    MEM CHECK ████████████ OK"
    "\n"
    "    SUBSYSTEM INIT.....OK"
    "\n"
    "[/green]",
    # Frame 3: Bat-Signal
    "[bold green]"
    "\n"
    "           /\\                 /\\"
    "\n"
    "          / \\'._   (\\_/)   _.'/ \\"
    "\n"
    "         /_.''._'--('.')--'_.''._\\"
    "\n"
    "         | \\_ / `;=/ \" \\=;` \\_ / |"
    "\n"
    "          \\/ `\\__|`\\___/`|__/`  \\/"
    "\n"
    "[/bold green]",
    # Frame 4: Flash
    "[bold cyan]"
    "\n"
    "    ░░▒▒▓▓██ SIGNAL ██▓▓▒▒░░"
    "\n"
    "[/bold cyan]",
    # Frame 5: System ready
    "[bold green]"
    "\n"
    "    ┌──────────────────────────────┐"
    "\n"
    "    │   BATCAVE MAINFRAME READY    │"
    "\n"
    "    │   Good evening, sir.         │"
    "\n"
    "    └──────────────────────────────┘"
    "\n"
    "[/bold green]",
]

# ---------------------------------------------------------------------------
# Phrase Loader  —  Load persona greetings from phrases.yaml
# ---------------------------------------------------------------------------

def _load_greeting(persona: str) -> str:
    """
    Load a random greeting from the persona's phrase bank.

    Args:
        persona: 'ODIN' or 'ALFRED'.

    Returns:
        A greeting string, or a sensible fallback.
    """
    fallbacks: dict[str, str] = {
        "ODIN": "Speak, wanderer. The Hooded One listens.",
        "ALFRED": "Good day, sir. How may I be of service?",
    }
    try:
        phrases_path = PROJECT_ROOT / "src" / "data" / "dialogue" / "phrases.yaml"
        if yaml is not None and phrases_path.exists():
            with phrases_path.open("r", encoding="utf-8") as f:
                data: dict[str, Any] = yaml.safe_load(f) or {}
            greetings = data.get(persona, {}).get("GREETING", [])
            if greetings:
                entry = random.choice(greetings)  # noqa: S311
                return entry.get("phrase", fallbacks.get(persona, ""))
    except Exception:  # noqa: S110
        pass
    return fallbacks.get(persona, "Systems online.")


# ---------------------------------------------------------------------------
# Daemon Client  —  Enhanced with retries and stream support
# ---------------------------------------------------------------------------

class DaemonClient:
    """Async client for TUI → Daemon communication with retry logic."""

    MAX_RETRIES: int = 3
    TIMEOUT: float = 2.0
    BUFFER_SIZE: int = 32768

    async def send_command(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Send a JSON command to the daemon with retry logic.

        Args:
            payload: Dictionary containing the command and arguments.

        Returns:
            Parsed JSON response or graceful-degradation fallback.
        """
        for attempt in range(self.MAX_RETRIES):
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection("127.0.0.1", PORT),
                    timeout=self.TIMEOUT,
                )
                writer.write(json.dumps(payload).encode("utf-8"))
                await writer.drain()

                data = await reader.read(self.BUFFER_SIZE)
                response: dict[str, Any] = json.loads(data.decode("utf-8"))

                writer.close()
                await writer.wait_closed()
                return response
            except Exception:
                if attempt < self.MAX_RETRIES - 1:
                    await asyncio.sleep(0.3 * (attempt + 1))
                continue
        # Graceful degradation
        return {"persona": "ALFRED", "status": "disconnected", "error": True}

    async def stream_command(self, payload: dict[str, Any]):
        """
        Send a JSON command and yield streaming responses (Line-Delimited JSON).
        Keeps the socket open until EOF.
        """
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection("127.0.0.1", PORT),
                timeout=self.TIMEOUT,
            )
            writer.write(json.dumps(payload).encode("utf-8"))
            await writer.drain()

            while True:
                line = await reader.readline()
                if not line:
                    break
                try:
                    event = json.loads(line.decode("utf-8").strip())
                    yield event
                except json.JSONDecodeError:
                    continue
        except Exception as e:
            yield {"type": "result", "status": "error", "message": f"Stream severed: {str(e)}"}
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Transition Screen  —  Expanded Cinematic
# ---------------------------------------------------------------------------

class TransitionScreen(ModalScreen):
    """
    Modal screen with multi-frame ASCII cinematic for persona transitions.

    ODIN : Gungnir spear throw → rune cascade → war title
    ALFRED: Phosphor boot → memory check → Bat-Signal → system ready
    """

    CSS = """
    TransitionScreen {
        align: center middle;
        background: $surface 95%;
    }
    #anim_box {
        content-align: center middle;
        text-style: bold;
        min-height: 12;
        min-width: 60;
    }
    """

    def __init__(self, new_persona: str) -> None:
        """Initialize with target persona."""
        super().__init__()
        self.new_persona: str = new_persona

    def compose(self) -> ComposeResult:
        """Yield the animation container."""
        yield Static("", id="anim_box")

    async def on_mount(self) -> None:
        """Start animation on mount."""
        self.run_worker(self._animate())

    async def _animate(self) -> None:
        """Orchestrate frame-by-frame cinematic sequence."""
        box = self.query_one("#anim_box", Static)
        frames = ODIN_FRAMES if self.new_persona == "ODIN" else ALFRED_FRAMES

        for frame in frames:
            box.update(frame)
            await asyncio.sleep(0.22)

        await asyncio.sleep(0.8)
        self.dismiss()


# ---------------------------------------------------------------------------
# Header Widget  —  Live Vitals
# ---------------------------------------------------------------------------

class VitalsHeader(Static):
    """Top bar: lore title, branch, connection dot, CPU, RAM, GPHS sparkline."""

    def compose(self) -> ComposeResult:
        """Yield header labels in a single horizontal row."""
        with Horizontal(id="header_row"):
            yield Label("  ᚠ HLIDSKJALF ᚠ  ", id="h_project")
            yield Label(" │ ", id="h_sep1")
            yield Label("main", id="h_branch")
            yield Label(" │ ", id="h_sep2")
            yield Label("[green]●[/] ONLINE", id="h_status")
            yield Label(" │ ", id="h_sep3")
            yield Label("CPU --%", id="h_cpu")
            yield Label("  RAM --MB", id="h_ram")
            yield Label(" │ ", id="h_sep4")
            yield Label("▁▂▃▅▆", id="h_spark")

    def update_vitals(self, state: dict[str, Any], lore: dict[str, str]) -> None:
        """
        Refresh header from daemon state.

        Args:
            state: Dashboard state dictionary from RPC.
            lore: Active persona's lore dictionary.
        """
        # Update header title to persona-appropriate lore
        self.query_one("#h_project", Label).update(f"  {lore['app_title']}  ")

        # Connection status
        status_lbl = self.query_one("#h_status", Label)
        if state.get("error"):
            status_lbl.update(f"[red]● {lore['offline']}[/]")
        else:
            status_lbl.update(f"[green]●[/] {lore['online']}")

        vitals = state.get("vitals", {})
        if isinstance(vitals, dict):
            cpu = vitals.get("cpu", "--")
            ram = vitals.get("ram", "--")
            branch = vitals.get("branch", "main")
            self.query_one("#h_cpu", Label).update(f"CPU {cpu}%")
            self.query_one("#h_ram", Label).update(f"  RAM {ram}MB")
            self.query_one("#h_branch", Label).update(f"{branch}")


# ---------------------------------------------------------------------------
# Sidebar Widget  —  Tasks + Event Log
# ---------------------------------------------------------------------------

class SidebarWidget(Static):
    """Left panel: battle briefing with objectives, forge status, and intel."""

    def compose(self) -> ComposeResult:
        """Yield sidebar sections — structured as a war room briefing."""
        yield Static("", id="sb_objectives")
        yield Static("", id="sb_forge_status")
        yield Static("", id="sb_intel")

    def update_tasks(
        self, tasks: list[str], lore: dict[str, str]
    ) -> None:
        """
        Refresh the war room briefing panels.

        Args:
            tasks: List of task description strings.
            lore: Active persona lore dictionary.
        """
        bullet = lore["bullet"]
        sep = lore["separator"]

        # ── Section 1: Active Objectives ──
        obj_header = f"[bold]{sep} ACTIVE OBJECTIVES[/bold]"
        divider = f"[dim]{lore['divider']}[/dim]"
        if tasks:
            count = len(tasks)
            task_lines = "\n".join(f"  {bullet} {t}" for t in tasks)
            obj_content = (
                f"{obj_header}\n"
                f"{divider}\n"
                f"  [dim]Targets:[/dim] [bold]{count}[/bold]\n"
                f"{task_lines}"
            )
        else:
            obj_content = (
                f"{obj_header}\n"
                f"{divider}\n"
                f"  {lore['empty_state']}"
            )
        self.query_one("#sb_objectives", Static).update(obj_content)

        # ── Section 2: Forge Status ──
        forge_header = f"\n[bold]{sep} FORGE STATUS[/bold]"
        forge_content = (
            f"{forge_header}\n"
            f"{divider}\n"
            f"  [dim]Armory:[/dim] [green]READY[/green]\n"
            f"  [dim]Queue:[/dim]  0 weapons"
        )
        self.query_one("#sb_forge_status", Static).update(forge_content)

        # ── Section 3: Intel Feed ──
        trace_header = f"\n[bold]{sep} {lore['trace_title']}[/bold]"
        trace_content = (
            f"{trace_header}\n"
            f"{divider}\n"
            f"  [dim]Awaiting signals...[/dim]"
        )
        self.query_one("#sb_intel", Static).update(trace_content)

    def update_forge_status(
        self, status: str, queue: int, lore: dict[str, str]
    ) -> None:
        """
        Update the Forge Status section with live build state.

        Args:
            status: Current forge status (e.g., 'FORGING', 'READY', 'FAILED').
            queue: Number of pending forge operations.
            lore: Active persona lore dictionary.
        """
        sep = lore["separator"]
        divider = f"[dim]{lore['divider']}[/dim]"
        forge_header = f"\n[bold]{sep} FORGE STATUS[/bold]"

        if status == "FORGING":
            status_color = "yellow"
        elif status == "FAILED":
            status_color = "red"
        else:
            status_color = "green"

        forge_content = (
            f"{forge_header}\n"
            f"{divider}\n"
            f"  [dim]Armory:[/dim] [{status_color}]{status}[/{status_color}]\n"
            f"  [dim]Queue:[/dim]  {queue} weapons"
        )
        with contextlib.suppress(Exception):
            self.query_one("#sb_forge_status", Static).update(forge_content)


# ---------------------------------------------------------------------------
# GPHS Gauge  —  Visual Health Score
# ---------------------------------------------------------------------------

class GPHSGauge(Static):
    """Renders a visual progress bar for the Global Project Health Score."""

    def render_gauge(self, score: float, lore: dict[str, str]) -> None:
        """
        Update the gauge display.

        Args:
            score: Float 0.0-1.0 representing project health.
            lore: Active persona lore dict for label.
        """
        width = 20
        filled = int(score * width)
        empty = width - filled
        bar = "█" * filled + "░" * empty
        pct = int(score * 100)

        if score >= 0.8:
            color = "green"
        elif score >= 0.5:
            color = "yellow"
        else:
            color = "red"

        self.update(
            f" {lore['gphs_label']}: [{color}]{bar}[/] {pct}%"
        )


# ---------------------------------------------------------------------------
# Command Input  —  With Autocomplete Suggester
# ---------------------------------------------------------------------------

# Default known commands for autocomplete
KNOWN_COMMANDS: list[str] = [
    "scout", "ravens", "heimdall", "trace", "forge",
    "sleep", "help", "clear", "status", "synapse",
    "brain", "ask", "uplink", "sentinel",
]


class CommandInput(Input):
    """Command input with persona-aware prompt and autocomplete suggestions."""

    def __init__(self, **kwargs: str) -> None:
        """Initialize with autocomplete suggester."""
        super().__init__(
            suggester=SuggestFromList(KNOWN_COMMANDS, case_sensitive=False),
            **kwargs,
        )

    def on_mount(self) -> None:
        """Set placeholder on mount."""
        self.placeholder = "Enter command..."


# ---------------------------------------------------------------------------
# Dashboard Screen  —  Main 4-Zone Grid
# ---------------------------------------------------------------------------

class DashboardScreen(Screen):
    """
    Primary screen: Header vitals, sidebar tasks, console log, command input.

    The screen that the user sees 90% of the time during autonomous operation.
    """

    CSS = """
    DashboardScreen {
        layout: vertical;
    }

    #vitals_header {
        dock: top;
        height: 3;
    }

    #dash_body {
        height: 1fr;
    }

    #sidebar_container {
        width: 32;
        height: 100%;
        border: double $accent;
        border-title-align: center;
        border-title-color: $text;
        padding: 0 1;
    }

    #main_container {
        width: 1fr;
        height: 100%;
        layout: vertical;
    }

    #console {
        height: 1fr;
        border: double $accent;
        border-title-align: left;
        border-title-color: $text;
    }

    #gphs_bar {
        height: 3;
        border: heavy $accent;
        border-title-align: left;
        border-title-color: $text;
        padding: 0 1;
        content-align: left middle;
    }

    #cmd_input {
        dock: bottom;
        height: 3;
        border: double $accent;
    }
    """

    def compose(self) -> ComposeResult:
        """Yield the main dashboard layout matching the VIGRID/BATCAVE wireframe."""
        yield VitalsHeader(id="vitals_header")
        with Horizontal(id="dash_body"):
            with VerticalScroll(id="sidebar_container"):
                yield SidebarWidget(id="sidebar")
            with Vertical(id="main_container"):
                yield GPHSGauge(id="gphs_bar")
                yield Log(id="console")
                yield CommandInput(id="cmd_input")


# ---------------------------------------------------------------------------
# Forge Screen  —  Live Code Generation Stream
# ---------------------------------------------------------------------------

class ForgeScreen(Screen):
    """
    Dedicated Forge streaming view for autonomous code generation.

    Shows live output from the Forge as line-delimited JSON events.
    """

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("escape", "pop_screen", "Back"),
    ]

    CSS = """
    ForgeScreen {
        layout: vertical;
    }

    #forge_header {
        height: 3;
        content-align: center middle;
        text-style: bold;
    }

    #forge_log {
        height: 1fr;
        border: double $accent;
        padding: 0 1;
    }

    #forge_status {
        height: 3;
        padding: 0 1;
        border: heavy $accent;
    }
    """

    def compose(self) -> ComposeResult:
        """Yield Forge screen layout."""
        yield Static(" GUNGNIR FORGE ", id="forge_header")
        yield Log(id="forge_log")
        yield Static(" Awaiting forge invocation... ", id="forge_status")


# ---------------------------------------------------------------------------
# Trace Screen  —  Neural Trace Visualization
# ---------------------------------------------------------------------------

class TraceScreen(Screen):
    """
    Trace visualization: skill matches, confidence scores, path history.

    Shows the neural decision-making path of the Sovereign Engine.
    """

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("escape", "pop_screen", "Back"),
    ]

    CSS = """
    TraceScreen {
        layout: vertical;
    }

    #trace_header {
        height: 3;
        content-align: center middle;
        text-style: bold;
    }

    #trace_log {
        height: 1fr;
    }
    """

    def compose(self) -> ComposeResult:
        """Yield trace screen layout."""
        yield Static(" TRACE ANALYSIS ", id="trace_header")
        yield Log(id="trace_log")


# ---------------------------------------------------------------------------
# Help Screen  —  Modal with commands, keybindings, lore
# ---------------------------------------------------------------------------

class HelpScreen(ModalScreen):
    """Modal overlay showing commands, keybindings, and lore snippets."""

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("escape", "dismiss", "Close"),
        Binding("f1", "dismiss", "Close"),
    ]

    CSS = """
    HelpScreen {
        align: center middle;
        background: $surface 90%;
    }

    #help_box {
        width: 70;
        max-height: 80%;
        padding: 2 3;
        border: solid $accent;
    }
    """

    def __init__(self, persona: str) -> None:
        """Initialize with active persona for themed content."""
        super().__init__()
        self.persona: str = persona

    def compose(self) -> ComposeResult:
        """Yield help content."""
        lore = LORE.get(self.persona, LORE["ALFRED"])
        help_text = (
            f"[bold]{lore['help_title']}[/bold]\n"
            f"{lore['divider']}\n"
            "\n"
            "[bold]KEYBINDINGS[/bold]\n"
            "  F1       This help screen\n"
            "  F2       Dashboard (main view)\n"
            "  F3       Forge (code generation)\n"
            "  F4       Traces (neural paths)\n"
            "  Ctrl+T   Toggle Persona (ODIN ↔ ALFRED)\n"
            "  Ctrl+S   Sleep Protocol (consolidate session)\n"
            "  Ctrl+Q   Quit\n"
            "\n"
            "[bold]COMMANDS[/bold]\n"
            "  scout      Run system audit\n"
            "  ravens     Launch the autonomous daemon\n"
            "  heimdall   Security scan\n"
            "  forge      Code generation stream\n"
            "  trace      View neural trace\n"
            "  sleep      Consolidate session\n"
            "  clear      Clear console\n"
            "  status     System vitals\n"
            "\n"
            f"{lore['divider']}\n"
            f"  {lore['separator']} Press ESC or F1 to close {lore['separator']}\n"
        )
        yield Static(help_text, id="help_box")


# ═══════════════════════════════════════════════════════════════════════════
# The Sovereign App  —  Multi-Screen, Lore-Drenched Command Center
# ═══════════════════════════════════════════════════════════════════════════

class SovereignApp(App):
    """
    The Sovereign HUD: Corvus Star's autonomous command center.

    Features:
        - Multi-screen architecture (Dashboard, Forge, Traces, Help)
        - Dual-persona themes (ODIN: DOOM/Quake, ALFRED: C64/Spy Hunter)
        - Keybinding navigation (F1-F4, Ctrl+T/S/Q)
        - RPC-driven real-time vitals
        - Autocomplete command input
        - Expanded Norse / Batman lore throughout
    """

    TITLE = "C* SOVEREIGN HUD"

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("f1", "show_help", "Help", show=True),
        Binding("f2", "show_dashboard", "Dashboard", show=True),
        Binding("f3", "show_forge", "Forge", show=True),
        Binding("f4", "show_traces", "Traces", show=True),
        Binding("ctrl+t", "toggle_persona", "Toggle Persona", show=True),
        Binding("ctrl+s", "sleep_protocol", "Sleep", show=True),
        Binding("ctrl+q", "quit", "Quit", show=True),
    ]

    # ── ODIN "VIGRID" Theme ──────────────────────────────────────────────
    # DOOM/Quake: Heavy double-borders, crimson chrome, gold text on abyss
    # ── ALFRED "BATCAVE" Theme ───────────────────────────────────────────
    # C64/Spy Hunter: Green phosphor CRT, thin borders, clean separators
    CSS = """
    /* ═══════════════════ LAYOUT ═══════════════════ */
    Screen {
        background: $surface;
    }

    VitalsHeader {
        dock: top;
        height: 3;
        content-align: center middle;
        text-style: bold;
    }

    #header_row {
        height: 3;
        align: center middle;
    }

    /* ═══════════════════ ODIN: VIGRID ═══════════════════ */
    /* DOOM Eternal / Quake: Chunky red chrome, aggressive weight */

    .theme-odin {
        background: #0a0000;
    }

    .theme-odin VitalsHeader {
        background: #2a0000;
        border-bottom: thick #cc2200;
        color: #ffcc00;
        text-style: bold;
    }

    .theme-odin #header_row {
        background: #2a0000;
    }

    .theme-odin #header_row Label {
        color: #ffcc00;
        text-style: bold;
    }

    .theme-odin #h_project {
        color: #ff4400;
        text-style: bold;
    }

    .theme-odin #sidebar_container {
        background: #1a0500;
        border: heavy #cc2200;
        border-title-color: #ff4400;
        border-title-style: bold;
        color: #ffcc00;
        scrollbar-color: #cc2200;
        scrollbar-background: #1a0500;
    }

    .theme-odin SidebarWidget {
        color: #ffcc00;
    }

    .theme-odin SidebarWidget Label {
        color: #ff6600;
        text-style: bold;
    }

    .theme-odin SidebarWidget Static {
        color: #cc8800;
    }

    .theme-odin #console {
        background: #0a0000;
        border: heavy #cc2200;
        border-title-color: #ff4400;
        border-title-style: bold;
        color: #ffcc00;
        scrollbar-color: #cc2200;
        scrollbar-background: #1a0500;
    }

    .theme-odin #gphs_bar {
        background: #2a0000;
        border: wide #cc2200;
        border-title-color: #ff4400;
        border-title-style: bold;
        color: #ffcc00;
        text-style: bold;
    }

    .theme-odin CommandInput {
        background: #1a0500;
        border: heavy #8b0000;
        color: #ffcc00;
    }

    .theme-odin CommandInput:focus {
        border: heavy #ff2200;
        background: #2a0000;
    }

    .theme-odin GPHSGauge {
        background: #2a0000;
        color: #ffcc00;
    }

    .theme-odin Footer {
        background: #2a0000;
        color: #ffcc00;
        text-style: bold;
    }

    .theme-odin FooterKey {
        background: #cc2200;
        color: #ffcc00;
        text-style: bold;
    }

    .theme-odin #forge_header {
        background: #2a0000;
        border: heavy #cc2200;
        color: #ff4400;
        text-style: bold;
    }

    .theme-odin #forge_log {
        background: #0a0000;
        border: heavy #cc2200;
        color: #ffcc00;
    }

    .theme-odin #forge_status {
        background: #1a0500;
        color: #cc8800;
    }

    .theme-odin #trace_header {
        background: #2a0000;
        border: heavy #cc2200;
        color: #ff4400;
        text-style: bold;
    }

    .theme-odin #trace_log {
        background: #0a0000;
        border: heavy #cc2200;
        color: #ffcc00;
    }

    .theme-odin #help_box {
        background: #1a0500;
        border: heavy #cc2200;
        border-title-color: #ff4400;
        color: #ffcc00;
    }

    /* ═══════════════════ ALFRED: BATCAVE ═══════════════════ */

    .theme-alfred {
        background: #001a00;
    }

    .theme-alfred VitalsHeader {
        background: #002200;
        border-bottom: solid #004400;
        color: #33ff33;
    }

    .theme-alfred #sidebar_container {
        background: #002200;
        border: solid #004400;
        border-title-color: #00ffcc;
        color: #33ff33;
        scrollbar-color: #004400;
        scrollbar-background: #002200;
    }

    .theme-alfred SidebarWidget {
        color: #33ff33;
    }

    .theme-alfred SidebarWidget Label {
        color: #00ffcc;
    }

    .theme-alfred SidebarWidget Static {
        color: #116611;
    }

    .theme-alfred #console {
        background: #001a00;
        border: solid #004400;
        border-title-color: #00ffcc;
        color: #33ff33;
        scrollbar-color: #004400;
        scrollbar-background: #002200;
    }

    .theme-alfred #gphs_bar {
        background: #002200;
        border: solid #004400;
        border-title-color: #00ffcc;
        color: #33ff33;
    }

    .theme-alfred CommandInput {
        background: #002200;
        border: solid #004400;
        color: #33ff33;
    }

    .theme-alfred CommandInput:focus {
        border: solid #00ffcc;
    }

    .theme-alfred GPHSGauge {
        background: #002200;
        color: #33ff33;
    }

    .theme-alfred Footer {
        background: #002200;
        color: #33ff33;
    }

    .theme-alfred FooterKey {
        background: #004400;
        color: #33ff33;
    }

    .theme-alfred #forge_header {
        background: #002200;
        border: solid #004400;
        color: #00ffcc;
    }

    .theme-alfred #forge_log {
        background: #001a00;
        border: solid #004400;
        color: #33ff33;
    }

    .theme-alfred #forge_status {
        background: #002200;
        color: #116611;
    }

    .theme-alfred #trace_header {
        background: #002200;
        border: solid #004400;
        color: #00ffcc;
    }

    .theme-alfred #trace_log {
        background: #001a00;
        border: solid #004400;
        color: #33ff33;
    }

    .theme-alfred #help_box {
        background: #002200;
        border: solid #004400;
        color: #33ff33;
    }
    """

    # ── Screens ──────────────────────────────────────────────────────────

    SCREENS: ClassVar[dict[str, type[Screen]]] = {
        "dashboard": DashboardScreen,
        "forge": ForgeScreen,
        "traces": TraceScreen,
    }

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("f1", "push_screen('help')", "Help", show=True),
        Binding("f2", "push_screen('dashboard')", "Dashboard", show=True),
        Binding("f3", "push_screen('forge')", "Forge", show=True),
        Binding("f4", "push_screen('traces')", "Traces", show=True),
        Binding("ctrl+t", "toggle_persona", "Persona", show=True),
        Binding("ctrl+s", "sleep_protocol", "Sleep", show=True),
        Binding("escape", "quit", "Quit", show=True),
    ]

    # ── Lifecycle ────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        """Yield footer only; screens handle the rest."""
        yield Footer()

    def on_mount(self) -> None:
        """Initialize state, apply theme, push dashboard, start polling."""
        self.client: DaemonClient = DaemonClient()
        self.active_persona: str = self._detect_persona()
        self.is_transitioning: bool = False

        # Apply theme
        lore = LORE[self.active_persona]
        self.add_class(lore["theme_class"])
        self.title = lore["app_title"]

        # Push default screen
        self.push_screen("dashboard")

        # Apply lore to panel titles after widgets mount
        self.set_timer(0.3, self._apply_panel_lore)

        # Log startup greeting
        self.set_timer(0.5, self._startup_greeting)

        # Start vitals polling
        self.set_interval(5, self.poll_dashboard)
        self.poll_dashboard()

    def _apply_panel_lore(self) -> None:
        """Set border-title on sidebar, console, GPHS, and input from lore."""
        lore = LORE[self.active_persona]
        try:
            screen = self.screen
            # Sidebar panel title
            sidebar = screen.query_one("#sidebar_container")
            sidebar.border_title = lore["sidebar_title"]

            # Console title
            console = screen.query_one("#console")
            console.border_title = lore["console_title"]

            # GPHS gauge title
            gphs = screen.query_one(GPHSGauge)
            gphs.border_title = lore["gphs_label"]
            gphs.render_gauge(0.78, lore)  # Default until daemon responds

            # Command prompt
            cmd = screen.query_one("#cmd_input", Input)
            cmd.placeholder = f"{lore['prompt']} enter command..."
        except Exception:  # noqa: S110
            pass

    def _detect_persona(self) -> str:
        """
        Read active persona from .agent/config.json.

        Returns:
            'ODIN' or 'ALFRED', defaulting to ALFRED.
        """
        try:
            config_path = PROJECT_ROOT / ".agent" / "config.json"
            if config_path.exists():
                data = json.loads(config_path.read_text(encoding="utf-8"))
                persona = str(
                    data.get("persona") or data.get("Persona") or "ALFRED"
                ).upper()
                if persona in LORE:
                    return persona
        except Exception:  # noqa: S110
            pass
        return "ALFRED"

    async def _startup_greeting(self) -> None:
        """Log a persona-specific greeting on startup."""
        try:
            screen = self.screen
            if hasattr(screen, "query_one"):
                log_widget = screen.query_one("#console", Log)
                lore = LORE[self.active_persona]
                greeting = _load_greeting(self.active_persona)
                log_widget.write(f"[{self.active_persona}] {greeting}")
                log_widget.write(f"  {lore['separator']} Type 'help' or press F1 for commands.")
        except Exception:  # noqa: S110
            pass

    # ── Actions ──────────────────────────────────────────────────────────

    def action_show_help(self) -> None:
        """Open the Help modal."""
        self.push_screen(HelpScreen(self.active_persona))

    def action_show_dashboard(self) -> None:
        """Switch to Dashboard screen."""
        self.switch_screen("dashboard")

    def action_show_forge(self) -> None:
        """Switch to Forge screen."""
        self.switch_screen("forge")
        # Update forge header with lore
        try:
            lore = LORE[self.active_persona]
            screen = self.screen
            screen.query_one("#forge_header", Static).update(
                f" {lore['forge_title']} "
            )
        except Exception:  # noqa: S110
            pass

    def action_show_traces(self) -> None:
        """Switch to Traces screen."""
        self.switch_screen("traces")
        try:
            lore = LORE[self.active_persona]
            screen = self.screen
            screen.query_one("#trace_header", Static).update(
                f" {lore['trace_title']} "
            )
        except Exception:  # noqa: S110
            pass

    def action_toggle_persona(self) -> None:
        """Toggle between ODIN and ALFRED personas."""
        if self.is_transitioning:
            return
        new_persona = "ALFRED" if self.active_persona == "ODIN" else "ODIN"
        self.run_worker(self._execute_transition(new_persona))

    async def action_sleep_protocol(self) -> None:
        """Send sleep command to daemon for session consolidation."""
        try:
            screen = self.screen
            log_widget = screen.query_one("#console", Log)
            lore = LORE[self.active_persona]
            log_widget.write(f"[{self.active_persona}] Initiating Sleep Protocol...")
            resp = await self.client.send_command({"command": "sleep"})
            if resp.get("status") == "success":
                msg = f"Session consolidated. {lore['forge_done']}"
                log_widget.write(f"[{self.active_persona}] {msg}")
            else:
                log_widget.write(f"[{self.active_persona}] {lore['forge_fail']}")
        except Exception:  # noqa: S110
            pass

    # ── Transition ───────────────────────────────────────────────────────

    async def _execute_transition(self, new_persona: str) -> None:
        """
        Cinematic persona transition: halt UI, play animation, rewrite theme.

        Args:
            new_persona: Target persona key ('ODIN' or 'ALFRED').
        """
        self.is_transitioning = True

        await self.push_screen(TransitionScreen(new_persona))

        # Swap theme
        old_lore = LORE[self.active_persona]
        self.remove_class(old_lore["theme_class"])
        self.active_persona = new_persona
        new_lore = LORE[new_persona]
        self.add_class(new_lore["theme_class"])
        self.title = new_lore["app_title"]

        # Log transition
        try:
            screen = self.screen
            log_widget = screen.query_one("#console", Log)
            log_widget.write(f"[{new_persona}] {new_lore['transition_in']}")
            greeting = _load_greeting(new_persona)
            log_widget.write(f"[{new_persona}] {greeting}")
        except Exception:  # noqa: S110
            pass

        self.is_transitioning = False
        self._apply_panel_lore()

    # ── Polling ──────────────────────────────────────────────────────────

    @work(exclusive=True)
    async def poll_dashboard(self) -> None:
        """Poll the daemon for state and refresh the dashboard."""
        if self.is_transitioning:
            return

        state = await self.client.send_command({"command": "get_dashboard_state"})
        lore = LORE[self.active_persona]

        # Update header vitals (on any screen)
        try:
            screen = self.screen
            header = screen.query_one(VitalsHeader)
            header.update_vitals(state, lore)
        except Exception:  # noqa: S110
            pass

        if state.get("error"):
            return  # Suppress log spam on disconnect

        # Check persona drift from daemon
        daemon_persona = state.get("persona", self.active_persona)
        if isinstance(daemon_persona, str):
            daemon_persona = daemon_persona.upper()
        if daemon_persona != self.active_persona and daemon_persona in LORE:
            await self._execute_transition(daemon_persona)

        # Update sidebar tasks
        try:
            screen = self.screen
            sidebar = screen.query_one(SidebarWidget)
            sidebar.update_tasks(state.get("tasks", []), lore)
        except Exception:  # noqa: S110
            pass

        # Update GPHS gauge
        try:
            screen = self.screen
            gauge = screen.query_one(GPHSGauge)
            gphs = state.get("gphs", 0.78)  # Default placeholder
            gauge.render_gauge(float(gphs), lore)
        except Exception:  # noqa: S110
            pass

    # ── Command Handling ─────────────────────────────────────────────────

    async def on_input_submitted(self, message: Input.Submitted) -> None:
        """
        Handle command submission from the input bar.

        Args:
            message: Textual Input.Submitted event.
        """
        cmd = message.value.strip()
        message.input.value = ""

        if not cmd:
            return

        lore = LORE[self.active_persona]

        try:
            log_widget = self.screen.query_one("#console", Log)
        except Exception:
            return

        # Built-in commands
        if cmd.lower() in ("exit", "quit"):
            self.exit()
            return

        if cmd.lower() == "clear":
            log_widget.clear()
            return

        if cmd.lower() == "help":
            self.action_show_help()
            return

        # Echo user input
        log_widget.write(f"{lore['prompt']} {cmd}")

        # Forge stream handling
        if cmd.lower().startswith("forge"):
            await self._handle_forge_command(cmd, log_widget, lore)
            return

        # Standard command → daemon
        try:
            parts = cmd.split()
            resp = await self.client.send_command(
                {"command": parts[0].lower(), "args": parts[1:]}
            )

            if resp.get("error"):
                log_widget.write(f"[SYSTEM] {lore['offline']}")
                return

            status = resp.get("status", "")
            msg = resp.get("message", "")

            if status == "success":
                log_widget.write(
                    f"[{self.active_persona}] {msg or 'Task accomplished.'}"
                )
            elif status == "error":
                log_widget.write(
                    f"[{self.active_persona}] {msg or lore['forge_fail']}"
                )
            elif status == "uplink_success":
                uplink_data = resp.get("data", {})
                uplink_text = uplink_data.get("text", str(uplink_data))
                log_widget.write(f"[UPLINK] {uplink_text}")
            else:
                log_widget.write(str(resp))

        except Exception as e:
            log_widget.write(f"[CRITICAL] {e}")

    async def _handle_forge_command(
        self, cmd: str, log_widget: Log, lore: dict[str, str]
    ) -> None:
        """Handle forge commands by switching to the Forge Screen and streaming output."""
        
        # 1. Switch to the dedicated Forge Screen
        self.action_show_forge()
        forge_log = self.screen.query_one("#forge_log", Log)
        forge_status = self.screen.query_one("#forge_status", Static)
        
        forge_log.clear()
        forge_log.write(f"[{self.active_persona}] {lore['forge_start']}")
        forge_status.update(f"[{self.active_persona}] {lore['forge_progress']}")

        # 2. Package the payload
        # Drop the word "forge" and send the rest as args. The daemon's new router will parse it.
        parts = cmd.split()[1:] 
        payload = {"command": "forge", "args": parts}

        # 3. Consume the Stream
        try:
            async for event in self.client.stream_command(payload):
                event_type = event.get("type")
                persona = event.get("persona", "SYSTEM")
                msg = event.get("msg", "")
                
                if event_type == "ui":
                    forge_log.write(f"[{persona}] {msg}")
                
                elif event_type == "result":
                    status = event.get("status")
                    if status == "success":
                        forge_log.write(f"[{self.active_persona}] {lore['forge_done']}")
                        llr = event.get("llr")
                        if llr:
                            forge_log.write(f"[GUNGNIR] Final Verdict LLR: {llr}")
                        forge_status.update("[green]Forge Complete. Zero Regression.[/green]")
                    else:
                        forge_log.write(f"[{self.active_persona}] {lore['forge_fail']}")
                        forge_log.write(f"[ERROR] {event.get('message')}")
                        forge_status.update("[red]Forge Failed. Logic Breach.[/red]")
                        
        except Exception as e:
            forge_log.write(f"[CRITICAL] {e}")
            forge_status.update("[red]Stream Disconnected.[/red]")


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = SovereignApp()
    app.run()
