"""
Operation Ragnarök: The Sovereign HUD Rebirth.
A multi-screen, lore-drenched Textual TUI for the Corvus Star autonomous loop.
"""

import asyncio
import contextlib
import json
import os
import random
import time
from pathlib import Path
from typing import Any, ClassVar

from websockets.sync.client import connect

try:
    import yaml
except ModuleNotFoundError:
    yaml = None

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
HOST: str = "127.0.0.1"
PORT: int = int(os.getenv("CSTAR_DAEMON_PORT", "50051"))

LORE: dict[str, dict[str, str]] = {
    "ODIN": {
        "app_title": "ᚠ HLIDSKJALF ᚠ  —  THE HIGH SEAT",
        "theme_class": "theme-odin",
        "prompt": "C* Ω>",
        "header_title": "⚔ VIGRID COMMAND",
        "sidebar_title": "WAR ROOM",
        "trace_title": "TRACE (LIES)",
        "console_title": "THE WELL OF MIMIR",
        "forge_title": "GUNGNIR FORGE",
        "help_title": "MIMIR'S COUNSEL",
        "separator": "ᚱ",
        "bullet": "ᚠ",
        "divider": "═══════════════════",
        "empty_state": "GINNUNGAGAP — The Void awaits.",
        "online": "VIGRID ONLINE",
        "offline": "RAGNARÖK — LINK SEVERED",
        "gphs_label": "ODIN'S EYE",
        "forge_start": "Gungnir is cast. It will not miss.",
        "forge_progress": "The spear flies true...",
        "forge_done": "The target is struck. The rune is carved.",
        "forge_fail": "The thread snaps. Ragnarök whispers.",
        "transition_in": "The Allfather descends from Hlidskjalf...",
        "transition_out": "Odin withdraws. The ravens circle.",
    },
    "ALFRED": {
        "app_title": "C* BATCAVE MAINFRAME",
        "theme_class": "theme-alfred",
        "prompt": "[WAYNE_MANOR] >",
        "header_title": "BATCAVE SYSTEMS",
        "sidebar_title": "MISSION LOG",
        "trace_title": "EVENT LOG",
        "console_title": "BATCOMPUTER TERMINAL",
        "forge_title": "THE WORKSHOP",
        "help_title": "BUTLER'S MANUAL",
        "separator": "·",
        "bullet": "○",
        "divider": "───────────────────",
        "empty_state": "The Cave is quiet, sir.",
        "online": "CAVE SYSTEMS ONLINE",
        "offline": "CAVE LINK DISRUPTED",
        "gphs_label": "SYSTEM HEALTH",
        "forge_start": "The Workshop is prepared, sir.",
        "forge_progress": "Fabrication in progress...",
        "forge_done": "The modification is complete, sir.",
        "forge_fail": "I'm afraid there was a complication, sir.",
        "transition_in": "Alfred is assuming control of the Batcomputer...",
        "transition_out": "Very good, sir. I shall step aside.",
    },
}

def _load_greeting(persona: str) -> str:
    return "Systems online."

# ---------------------------------------------------------------------------
# UI Components
# ---------------------------------------------------------------------------

class VitalsHeader(Static):
    def compose(self) -> ComposeResult:
        with Horizontal(id="header_row"):
            yield Label("  ᚠ HLIDSKJALF ᚠ  ", id="h_project")
            yield Label(" │ ", id="h_sep1")
            yield Label("main", id="h_branch")
            yield Label(" │ ", id="h_sep2")
            yield Label("[green]●[/] ONLINE", id="h_status")
            yield Label(" │ ", id="h_sep3")
            yield Label("EDGE --", id="h_edge")
            yield Label(" │ ", id="h_sep_edge")
            yield Label("CPU --%", id="h_cpu")
            yield Label("  RAM --MB", id="h_ram")
            yield Label(" │ ", id="h_sep4")
            yield Label("▁▂▃▅▆", id="h_spark")

    def update_vitals(self, state: dict[str, Any], lore: dict[str, str]) -> None:
        self.query_one("#h_project", Label).update(f"  {lore['app_title']}  ")
        status_lbl = self.query_one("#h_status", Label)
        if state.get("error"):
            status_lbl.update(f"[red]● {lore['offline']}[/]")
        else:
            status_lbl.update(f"[green]●[/] {lore['online']}")
        
        vitals = state.get("vitals", {})
        if isinstance(vitals, dict):
            # Update Edge Status
            edge_lbl = self.query_one("#h_edge", Label)
            edge_status = vitals.get("edge_status", "UNKNOWN")
            if edge_status == "ONLINE":
                edge_lbl.update("[green]EDGE UP[/]")
            else:
                edge_lbl.update("[dim]EDGE DOWN[/dim]")

            cpu = vitals.get("cpu", "--")
            ram = vitals.get("ram", "--")
            branch = vitals.get("branch", "main")
            self.query_one("#h_cpu", Label).update(f"CPU {cpu}%")
            self.query_one("#h_ram", Label).update(f"  RAM {ram}MB")
            self.query_one("#h_branch", Label).update(f"{branch}")

class SidebarWidget(Static):
    def compose(self) -> ComposeResult:
        yield Static("", id="sb_objectives")
        yield Static("", id="sb_forge_status")
        yield Static("", id="sb_intel")

    def update_tasks(self, tasks: list[str], lore: dict[str, str]) -> None:
        bullet = lore["bullet"]
        sep = lore["separator"]
        obj_header = f"[bold]{sep} ACTIVE OBJECTIVES[/bold]"
        divider = f"[dim]{lore['divider']}[/dim]"
        if tasks:
            task_lines = "\n".join(f"  {bullet} {t}" for t in tasks)
            obj_content = f"{obj_header}\n{divider}\n  [dim]Targets:[/dim] [bold]{len(tasks)}[/bold]\n{task_lines}"
        else:
            obj_content = f"{obj_header}\n{divider}\n  {lore['empty_state']}"
        self.query_one("#sb_objectives", Static).update(obj_content)

class GPHSGauge(Static):
    def render_gauge(self, score: float, lore: dict[str, str]) -> None:
        width = 20
        filled = int(score * width)
        empty = width - filled
        bar = "█" * filled + "░" * empty
        pct = int(score * 100)
        color = "green" if score >= 0.8 else "yellow" if score >= 0.5 else "red"
        self.update(f" {lore['gphs_label']}: [{color}]{bar}[/] {pct}%")

KNOWN_COMMANDS: list[str] = [
    "scout", "ravens", "heimdall", "trace", "forge",
    "sleep", "help", "clear", "status", "synapse",
    "brain", "ask", "uplink", "sentinel", "analyze", "summarize",
    "thanks alfred", "dismiss", "resume vanguard"
]

class CommandInput(Input):
    def __init__(self, **kwargs: str) -> None:
        super().__init__(suggester=SuggestFromList(KNOWN_COMMANDS, case_sensitive=False), **kwargs)

class DashboardScreen(Screen):
    CSS = """
    DashboardScreen { layout: vertical; }
    #vitals_header { dock: top; height: 3; }
    #dash_body { height: 1fr; }
    #sidebar_container { width: 32; height: 100%; border: double $accent; border-title-align: center; border-title-color: $text; padding: 0 1; }
    #main_container { width: 1fr; height: 100%; layout: vertical; }
    #console { height: 1fr; border: double $accent; border-title-align: left; border-title-color: $text; }
    #gphs_bar { height: 3; border: heavy $accent; border-title-align: left; border-title-color: $text; padding: 0 1; content-align: left middle; }
    #cmd_input { dock: bottom; height: 3; border: double $accent; }
    #odin_heartbeat { width: 30; height: 100%; border: double $accent; border-title-color: $text; color: #cc2200; }
    """
    def compose(self) -> ComposeResult:
        yield VitalsHeader(id="vitals_header")
        with Horizontal(id="dash_body"):
            with VerticalScroll(id="sidebar_container"):
                yield SidebarWidget(id="sidebar")
            with Vertical(id="main_container"):
                yield GPHSGauge(id="gphs_bar")
                yield Log(id="console")
                yield CommandInput(id="cmd_input")
            yield Log(id="odin_heartbeat")

class ForgeScreen(Screen):
    BINDINGS: ClassVar[list[Binding]] = [Binding("escape", "pop_screen", "Back")]
    CSS = """
    ForgeScreen { layout: vertical; }
    #forge_header { height: 3; content-align: center middle; text-style: bold; }
    #forge_log { height: 1fr; border: double $accent; padding: 0 1; }
    #forge_status { height: 3; padding: 0 1; border: heavy $accent; }
    """
    def compose(self) -> ComposeResult:
        yield Static(" GUNGNIR FORGE ", id="forge_header")
        yield Log(id="forge_log")
        yield Static(" Awaiting forge invocation... ", id="forge_status")

class TraceScreen(Screen):
    BINDINGS: ClassVar[list[Binding]] = [Binding("escape", "pop_screen", "Back")]
    CSS = """
    TraceScreen { layout: vertical; }
    #trace_header { height: 3; content-align: center middle; text-style: bold; }
    #trace_log { height: 1fr; }
    """
    def compose(self) -> ComposeResult:
        yield Static(" TRACE ANALYSIS ", id="trace_header")
        yield Log(id="trace_log")

class HelpScreen(ModalScreen):
    BINDINGS: ClassVar[list[Binding]] = [
        Binding("escape", "dismiss", "Close"),
        Binding("f1", "dismiss", "Close"),
    ]
    CSS = """
    HelpScreen { align: center middle; background: $surface 90%; }
    #help_box { width: 70; max-height: 80%; padding: 2 3; border: solid $accent; }
    """
    def __init__(self, persona: str) -> None:
        super().__init__()
        self.persona = persona
    def compose(self) -> ComposeResult:
        lore = LORE.get(self.persona, LORE["ALFRED"])
        help_text = (
            f"[bold]{lore['help_title']}[/bold]\n"
            f"{lore['divider']}\n\n"
            "  scout      Run system audit\n"
            "  forge      Code generation stream\n"
            "  sleep      Consolidate session\n"
        )
        yield Static(help_text, id="help_box")

# ---------------------------------------------------------------------------
# App Main
# ---------------------------------------------------------------------------

class SovereignApp(App):
    TITLE = "C* SOVEREIGN HUD"
    BINDINGS: ClassVar[list[Binding]] = [
        Binding("f1", "push_screen('help')", "Help", show=True),
        Binding("f2", "push_screen('dashboard')", "Dashboard", show=True),
        Binding("f3", "push_screen('forge')", "Forge", show=True),
        Binding("f4", "push_screen('traces')", "Traces", show=True),
        Binding("ctrl+s", "sleep_protocol", "Sleep", show=True),
        Binding("escape", "quit", "Quit", show=True),
    ]

    CSS = """
    Screen { background: $surface; }
    VitalsHeader { dock: top; height: 3; content-align: center middle; text-style: bold; }
    #header_row { height: 3; align: center middle; }

    /* ODIN VIGRID */
    .theme-odin { background: #0a0000; }
    .theme-odin VitalsHeader { background: #2a0000; border-bottom: thick #cc2200; color: #ffcc00; }
    .theme-odin #header_row { background: #2a0000; }
    .theme-odin #header_row Label { color: #ffcc00; text-style: bold; }
    .theme-odin #sidebar_container, .theme-odin #console { background: #1a0500; border: heavy #cc2200; border-title-color: #ff4400; color: #ffcc00; }
    .theme-odin #odin_heartbeat { background: #0a0000; border: double #cc2200; border-title-color: #ff4400; color: #ff6600; }
    .theme-odin CommandInput { background: #1a0500; border: heavy #8b0000; color: #ffcc00; }
    .theme-odin Footer { background: #2a0000; color: #ffcc00; }

    /* ALFRED BATCAVE */
    .theme-alfred { background: #001a00; }
    .theme-alfred VitalsHeader { background: #002200; border-bottom: solid #004400; color: #33ff33; }
    .theme-alfred #sidebar_container, .theme-alfred #console { background: #002200; border: solid #004400; border-title-color: #00ffcc; color: #33ff33; }
    .theme-alfred #odin_heartbeat { background: #001a00; border: solid #004400; border-title-color: #00ffcc; color: #116611; }
    .theme-alfred CommandInput { background: #002200; border: solid #004400; color: #33ff33; }
    .theme-alfred Footer { background: #002200; color: #33ff33; }
    """

    SCREENS: ClassVar[dict[str, type[Screen]]] = {
        "dashboard": DashboardScreen,
        "forge": ForgeScreen,
        "traces": TraceScreen,
    }

    def compose(self) -> ComposeResult:
        yield Footer()

    def on_mount(self) -> None:
        self.active_persona: str = "ODIN"
        self.is_transitioning: bool = False
        self.ws = None
        self.prompt_string = LORE["ODIN"]["prompt"]
        self.active_request_timestamp = None

        self.add_class(LORE["ODIN"]["theme_class"])
        self.push_screen("dashboard")
        
        # Start pure WebSockets listener strictly off-thread
        self.run_worker(self.websocket_listener())

        self.set_interval(3.0, self._odin_heartbeat_tick)
        self.set_interval(5.0, self.poll_dashboard)

        self.set_timer(0.3, self._apply_panel_lore)
        self.set_timer(0.5, self._startup_greeting)

    def _apply_panel_lore(self) -> None:
        lore = LORE[self.active_persona]
        try:
            screen = self.screen
            screen.query_one("#sidebar_container").border_title = lore["sidebar_title"]
            screen.query_one("#console").border_title = lore["console_title"]
            
            gphs = screen.query_one(GPHSGauge)
            gphs.border_title = lore["gphs_label"]
            gphs.render_gauge(0.78, lore)
            
            hb = screen.query_one("#odin_heartbeat")
            hb.border_title = "VANGUARD SECURE FEED"
            
            cmd = screen.query_one("#cmd_input", Input)
            cmd.placeholder = f"{self.prompt_string} enter command..."
        except Exception:
            pass

    async def _startup_greeting(self) -> None:
        try:
            log_widget = self.screen.query_one("#console", Log)
            log_widget.write(f"[{self.active_persona}] SYSTEMS SYNCHRONIZED.")
        except: pass

    def _odin_heartbeat_tick(self) -> None:
        if self.active_persona == "ODIN":
            try:
                log = self.screen.query_one("#odin_heartbeat", Log)
                scenarios = [
                    "Squad 7 Morale: 85%",
                    "Perimeter sensors detected anomaly.",
                    "Re-routing power to forward shields.",
                    "Awaiting Vanguard orders...",
                    "Munitions stockpile optimized.",
                    "Raven-1 returned safely.",
                    "Sector scanning complete."
                ]
                log.write(f"{random.choice(scenarios)}")
            except Exception: pass

    @work(exclusive=True)
    async def poll_dashboard(self) -> None:
        if not self.is_transitioning:
            self._send_command({"command": "get_dashboard_state"})

    @work(thread=True)
    def websocket_listener(self) -> None:
        """Background thread holding the websocket connection to avoid event loop contention."""
        uri = f"ws://{HOST}:{PORT}"
        key_file = PROJECT_ROOT / ".agent" / "daemon.key"
        
        while True:
            try:
                auth_key = key_file.read_text().strip() if key_file.exists() else ""
                with connect(uri) as ws:
                    self.ws = ws
                    ws.send(json.dumps({"type": "auth", "auth_key": auth_key}))
                    
                    for msg in ws:
                        data = json.loads(msg)
                        self.call_from_thread(self.handle_daemon_message, data)
            except Exception as e:
                self.ws = None
                time.sleep(2)

    def _send_command(self, payload: dict) -> None:
        @work(thread=True)
        def _send():
            if getattr(self, "ws", None):
                try:
                    self.ws.send(json.dumps(payload))
                except Exception:
                    pass
        _send()

    def handle_daemon_message(self, data: dict) -> None:
        """Call exclusively from main thread to update UI."""
        msg_type = data.get("type")
        event = data.get("event")
        payload = data.get("data", {})

        try:
            console = self.screen.query_one("#console", Log)

            # -----------------------------------------------------------------------
            # [UPGRADE] Cognitive Router Intercepts (Phase 4 Telemetry)
            # -----------------------------------------------------------------------
            if msg_type == "INFERENCE_RESULT" and data.get("source") == "ollama":
                intent = data.get("intent", "UNKNOWN")
                console.write(f"[dim][EDGE_ROUTER] Zero-cost inference executed: {intent}[/dim]")
                return

            if msg_type == "TELEMETRY" and data.get("source") == "CognitiveRouter":
                status = data.get("status", "INFO")
                msg = data.get("message", "")
                if status == "ERROR":
                    console.write(f"[red][ROUTER_FAULT] {msg}[/red]")
                else:
                    console.write(f"[cyan][ROUTER] {msg}[/cyan]")
                return
            # -----------------------------------------------------------------------
            
            # [CANARY] Correlation logic: Stop the clock on terminal events
            
            if msg_type == "broadcast":
                if event == "SYNC_STATE":
                    state = payload.get("state")
                    persona = "ALFRED" if state == "STATE_ALFRED_REPORT" else "ODIN"
                    if persona != self.active_persona and not self.is_transitioning:
                        self.trigger_crt_glitch(persona)
                
                elif event == "PAYLOAD_READY":
                    terminal_event = True
                    persona = payload.get("persona", "ALFRED")
                    if self.active_persona != persona and not self.is_transitioning:
                        self.trigger_crt_glitch(persona)
                        
                elif event == "STATE_ODIN":
                    if self.active_persona != "ODIN" and not self.is_transitioning:
                        self.trigger_crt_glitch("ODIN")
                        
                elif event == "STATE_ALFRED_THINKING":
                    console.write(f"[dim][ALFRED] processing...[/dim]")
                    
                elif event == "STATE_SYSTEM_LOCKED":
                    pass # Handled gracefully implicitly
                    
            elif msg_type == "result":
                # Check if it's dashboard poll
                if isinstance(payload, dict) and "vitals" in payload:
                    header = self.screen.query_one(VitalsHeader)
                    header.update_vitals(payload, LORE[self.active_persona])
                    
                    sidebar = self.screen.query_one(SidebarWidget)
                    sidebar.update_tasks(payload.get("tasks", []), LORE[self.active_persona])
                    return

                status = data.get("status")
                msg = data.get("message", "")
                
                if status == "uplink_success":
                    text = payload.get("text", str(payload))
                    console.write(f"\n[ALFRED_REPORT]\n{text}\n")
                elif status == "error":
                    terminal_event = True
                    error_status = 1.0
                    console.write(f"[ERROR] {msg}")
                elif status == "success":
                    terminal_event = True
                    if msg: console.write(f"[{self.active_persona}] {msg}")
                    if "target" in data:
                        console.write(f"[{self.active_persona}] Protocol Engaged: {data['target']}")

            # [CANARY] Report Telemetry
            if terminal_event and self.active_request_timestamp:
                latency = (time.time() - self.active_request_timestamp) * 1000
                self._send_command({
                    "command": "telemetry",
                    "latency": latency,
                    "error": error_status
                })
                self.active_request_timestamp = None

        except Exception as e: 
            pass # Graceful fail if widgets not mounted

    @work(exclusive=True)
    async def trigger_crt_glitch(self, new_persona: str) -> None:
        """Execute the intense CRT Glitch Matrix wipe safely."""
        self.is_transitioning = True
        
        old_lore = LORE[self.active_persona]
        new_lore = LORE[new_persona]
        
        try:
            screen = self.screen
            console = screen.query_one("#console", Log)
            cmd_input = screen.query_one("#cmd_input", Input)
            cmd_input.disabled = True
            
            # The CRT Wipe Handoff
            chars = ['█', '▓', '▒', '░', '▄', '▀', '▌', '▐', '▆', '▇']
            for _ in range(6):
                trash = "".join(random.choices(chars, k=75))
                console.write(f"[bold cyan]{trash}[/bold cyan]")
                await asyncio.sleep(0.04)
                
            # Perform CSS Theme Swap
            self.remove_class(old_lore["theme_class"])
            self.active_persona = new_persona
            self.add_class(new_lore["theme_class"])
            
            self.title = new_lore["app_title"]
            self.prompt_string = new_lore["prompt"]
            self._apply_panel_lore()
            
            console.write(f"\n[{new_persona}] {new_lore['transition_in']}")
            console.write(f"[{new_persona}] Systems synchronized.\n")
            
        except Exception:
            pass
        finally:
            cmd_input.disabled = False
            self.is_transitioning = False

    async def on_input_submitted(self, message: Input.Submitted) -> None:
        cmd = message.value.strip()
        message.input.value = ""
        
        if not cmd or self.is_transitioning: 
            return
            
        # [CANARY] Start Correlation Clock
        self.active_request_timestamp = time.time()
            
        if cmd.lower() in ("exit", "quit"): 
            self.exit()
            return
            
        try:
            console = self.screen.query_one("#console", Log)
            
            if cmd == "/dev force_alfred":
                self.trigger_crt_glitch("ALFRED")
                return
            elif cmd == "/dev force_odin":
                self.trigger_crt_glitch("ODIN")
                return
            elif cmd == "clear":
                console.clear()
                return
                
            console.write(f"\n{self.prompt_string} {cmd}")
            self._send_command({"command": cmd.split()[0].lower(), "args": cmd.split()[1:]})
            
        except Exception: 
            pass

    async def action_sleep_protocol(self) -> None:
        try:
            console = self.screen.query_one("#console", Log)
            console.write(f"[{self.active_persona}] Initiating Sleep Protocol...")
            self._send_command({"command": "sleep", "args": []})
        except Exception: pass

if __name__ == "__main__":
    app = SovereignApp()
    app.run()
