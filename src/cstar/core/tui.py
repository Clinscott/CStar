"""
Sovereign HUD (TUI) Module.

This module implements the Textual-based Terminal User Interface for Corvus Star.
It acts as a "dumb" client that renders state provided by the Daemon via RPC.

Linscott Standard Compliance:
- Strict Type Hints
- Docstrings for all classes/methods
- Error Resiliency (Graceful Degradation)
"""

import asyncio
import json
import os
from pathlib import Path
from typing import Dict, Any, List

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Static, Input, Log, Label
from textual.screen import ModalScreen
from textual import work

# Project Root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

# Daemon Connection
HOST = 'localhost'
PORT = int(os.getenv("CSTAR_DAEMON_PORT", "50051"))

# --- ASCII ASSETS & DICTIONARY ---

BAT_SYMBOL = """
[cyan]
       /\\                 /\\
      / \\'._   (\\_/)   _.'/ \\
     /_.''._'--('.')--'_.''._\\
     | \\_ / `;=/ " \\=;` \\_ / |
      \\/ `\\__|`\\___/`|__/`  \\/
[/cyan]
"""

GUNGNIR_SPEAR = """
[red]
                     /
                   /
 [bold white]------========>[/bold white]
               /
             /
[/red]
"""

DICTIONARY = {
    "ODIN": {
        "sidebar_title": "TRACE (LIES)",
        "header_title": "THE WAR ROOM (CONFLICT RADAR)",
        "theme_class": "theme-odin",
        "sys_prompt": "C* Ω>"
    },
    "ALFRED": {
        "sidebar_title": "EVENT LOG",
        "header_title": "THE BATCAVE (ANOMALY DETECTOR)",
        "theme_class": "theme-alfred",
        "sys_prompt": "C* >"
    }
}

# --- CLIENT ---

class DaemonClient:
    """Lightweight async client for TUI to communicate with Daemon."""

    async def send_command(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sends a JSON command to the daemon and returns the response.

        Args:
            payload: Dictionary containing the command and arguments.

        Returns:
            Dictionary response from the daemon or error state.
        """
        try:
            # Force 127.0.0.1 and use timeout to prevent UI freeze
            reader, writer = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", PORT), timeout=2.0)
            writer.write(json.dumps(payload).encode('utf-8'))
            await writer.drain()
            
            data = await reader.read(8192)
            response = json.loads(data.decode('utf-8'))
            
            writer.close()
            await writer.wait_closed()
            return response
        except Exception:
            # Graceful degradation if daemon drops
            return {"persona": "ALFRED", "status": "disconnected", "error": True}

# --- UI COMPONENTS ---

class TransitionScreen(ModalScreen):
    """
    Modal screen that renders the cinematic ASCII transition sequence.
    Blocks input during the transition.
    """
    
    CSS = """
    TransitionScreen {
        align: center middle;
        background: $surface 90%;
    }
    #anim_box {
        content-align: center middle;
        text-style: bold;
    }
    """

    def __init__(self, new_persona: str) -> None:
        """Initialize with target persona."""
        super().__init__()
        self.new_persona = new_persona

    def compose(self) -> ComposeResult:
        """Yields the animation container."""
        yield Static("", id="anim_box")

    async def on_mount(self) -> None:
        """Starts the animation on mount."""
        self.run_worker(self.animate_transition())
        
    async def animate_transition(self) -> None:
        """Orchestrates the frame-by-frame ASCII animation."""
        box = self.query_one("#anim_box", Static)
        
        if self.new_persona == "ALFRED":
            # Bat-Signal Flash Sequence
            for _ in range(3):
                box.update(BAT_SYMBOL)
                await asyncio.sleep(0.15)
                box.update("")
                await asyncio.sleep(0.1)
            box.update(BAT_SYMBOL)
        else:
            # Gungnir Spear Slicing Effect
            frames = [
                "\n\n\n[red]  --==>[/red]",
                "\n\n\n[red]        ------=====>[/red]",
                GUNGNIR_SPEAR,
                "\n\n\n[red]                         --==>[/red]"
            ]
            for f in frames:
                box.update(f)
                await asyncio.sleep(0.15)
                
        await asyncio.sleep(0.6)
        self.dismiss()

class HeaderWidget(Static):
    """Top bar displaying project info and status."""
    
    def compose(self) -> ComposeResult:
        with Horizontal():
            yield Label(f" PROJECT: {PROJECT_ROOT.name} ", id="header_project")
            yield Label(" THE BATCAVE ", id="header_title")
            yield Label(" ● ", id="header_status")
            yield Label(" RAM: ... ", id="header_ram")

    def update_stats(self, data: Dict[str, Any], dict_ref: Dict[str, str]) -> None:
        """Updates header text based on daemon state."""
        self.query_one("#header_title", Label).update(f" {dict_ref['header_title']} ")
        if "vitals" in data:
            v = data["vitals"]
            # Safely access ram, defaulting to '?' if missing
            ram = v.get('ram', '?') if isinstance(v, dict) else '?'
            self.query_one("#header_ram", Label).update(f" RAM: {ram}MB ")
        
        # Update connection status
        status_label = self.query_one("#header_status", Label)
        if data.get("error"):
            status_label.update("[red] ● [/]")
        else:
            status_label.update("[green] ● [/]")

class SidebarWidget(Static):
    """Left sidebar displaying tasks/logs."""

    def compose(self) -> ComposeResult:
        yield Label("[u]EVENT LOG[/u]", id="sidebar_title")
        yield Static("Awaiting Intel...", id="sidebar_content")

    def update_tasks(self, tasks: List[str], dict_ref: Dict[str, str]) -> None:
        """Updates tasks list."""
        self.query_one("#sidebar_title", Label).update(f"[u]{dict_ref['sidebar_title']}[/u]")
        content = ""
        for i, t in enumerate(tasks):
            content += f"{i+1}. {t}\n\n"
        self.query_one("#sidebar_content", Static).update(content)

class InputWidget(Input):
    """Command input field."""
    
    def on_mount(self) -> None:
        self.placeholder = "Command (Active)..."

# --- MAIN APP ---

class SovereignApp(App):
    """
    The Sovereign HUD Application.
    
    Features:
    - 4-Zone Grid Layout
    - Dynamic Theming via Descendant Selectors
    - RPC-driven State
    """
    TITLE = "C* SOVEREIGN HUD"
    
    CSS = """
    /* Layout */
    Screen {
        layout: grid;
        grid-size: 2;
        grid-columns: 25% 75%;
        grid-rows: 3fr 1fr;
        background: $surface;
    }

    HeaderWidget {
        column-span: 2;
        height: 3;
        dock: top;
        content-align: center middle;
        text-style: bold;
    }

    SidebarWidget {
        row-span: 2;
        dock: left;
        width: 100%;
        height: 100%;
        padding: 1;
    }

    Log {
        column-span: 1;
        row-span: 1;
        height: 100%;
        border: solid $secondary;
    }

    InputWidget {
        column-span: 1;
        dock: bottom;
        height: 3;
    }

    /* ODIN THEME */
    .theme-odin HeaderWidget {
        background: #1a0000;
        border-bottom: solid #8b0000;
        color: #ffaa00;
    }
    .theme-odin SidebarWidget {
        background: #1a0000;
        border-right: solid #8b0000;
        color: #ffaa00;
    }
    .theme-odin Log {
        background: $surface;
        border: solid #8b0000;
        color: #ffaa00; 
    }
    .theme-odin InputWidget {
        background: #1a0000;
        border: solid #8b0000;
        color: #ffaa00;
    }

    /* ALFRED THEME */
    .theme-alfred HeaderWidget {
        background: #001a1a;
        border-bottom: solid #008b8b;
        color: #00ff00;
    }
    .theme-alfred SidebarWidget {
        background: #001a1a;
        border-right: solid #008b8b;
        color: #00ff00;
    }
    .theme-alfred Log {
        background: $surface;
        border: solid #008b8b;
        color: #00ff00;
    }
    .theme-alfred InputWidget {
        background: #001a1a;
        border: solid #008b8b;
        color: #00ff00;
    }
    """

    def compose(self) -> ComposeResult:
        yield HeaderWidget()
        with Horizontal():
            yield SidebarWidget()
            with Vertical():
                # FIX: Removed markup=True to prevent TypeError on older Textual versions
                yield Log(id="console")
                yield InputWidget(id="input")

    def on_mount(self) -> None:
        """Lifecycle hook: App startup."""
        self.client = DaemonClient()
        
        # Initial State
        self.active_persona = "ALFRED" 
        self.app.add_class(DICTIONARY[self.active_persona]["theme_class"])
        self.is_transitioning = False
        
        # Start Polling
        self.set_interval(5, self.poll_dashboard)
        self.poll_dashboard()

    async def execute_transition(self, new_persona: str) -> None:
        """
        Halts the UI, fires the cinematic, rewrites the DOM.
        
        Args:
            new_persona: The target persona key (ODIN/ALFRED).
        """
        self.is_transitioning = True
        
        # Fire Cinematic Overlay
        await self.push_screen(TransitionScreen(new_persona))
        
        # Rewrite the underlying DOM theme classes
        self.app.remove_class(DICTIONARY[self.active_persona]["theme_class"])
        self.active_persona = new_persona
        self.app.add_class(DICTIONARY[self.active_persona]["theme_class"])
        
        self.is_transitioning = False

    @work(exclusive=True)
    async def poll_dashboard(self) -> None:
        """Polls the daemon for state updates and handles drift."""
        if self.is_transitioning:
            return # Do not interrupt a transition

        state = await self.client.send_command({"command": "get_dashboard_state"})
        
        # Always update UI Components with active dictionary
        ref = DICTIONARY[self.active_persona]
        self.query_one(HeaderWidget).update_stats(state, ref)

        if state.get("error"):
            # Suppress log spam
            return

        # 1. State Sync: Check Persona Drift
        daemon_persona = state.get("persona", self.active_persona).upper()
        if daemon_persona != self.active_persona and daemon_persona in DICTIONARY:
            await self.execute_transition(daemon_persona)

        # 2. Update Sidebar
        self.query_one(SidebarWidget).update_tasks(state.get("tasks", []), ref)

    async def on_input_submitted(self, message: Input.Submitted) -> None:
        """Handles command submission."""
        cmd = message.value
        self.query_one(Input).value = ""
        
        if not cmd.strip(): 
            return
            
        ref = DICTIONARY[self.active_persona]
        log_widget = self.query_one(Log)
        
        if cmd.lower() == "clear":
            log_widget.clear()
            return

        # Echo user input
        log_widget.write(f"{ref['sys_prompt']} {cmd}")

        try:
            parts = cmd.split()
            resp = await self.client.send_command({"command": parts[0].lower(), "args": parts[1:]})
            
            if resp.get("error"):
                log_widget.write("[SYSTEM OFFLINE] The Daemon is currently unreachable.")
                return

            if resp.get("status") == "success":
                msg = resp.get("message", "Task accomplished.")
                log_widget.write(f"[{self.active_persona}] {msg}")
            elif resp.get("status") == "error":
                msg = resp.get("message", "Execution failed.")
                log_widget.write(f"[{self.active_persona}] {msg}")
            else:
                log_widget.write(str(resp))
                
        except Exception as e:
             log_widget.write(f"[CRITICAL FAILURE] {e}")

if __name__ == "__main__":
    app = SovereignApp()
    app.run()
