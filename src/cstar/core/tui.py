
import asyncio
import json
import psutil
import os
from datetime import datetime
from pathlib import Path

from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Header, Footer, Static, Input, Log, Label
from textual import work
from rich.text import Text

# Project Root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

# Mock Uplink for TUI (or import if safe)
# Better to use the dumb client approach: socket only.
# But we reused AntigravityUplink in Daemon.
# We need a simple socket client here that doesn't import the heavy engine.
# Let's write a lightweight client class.

HOST = 'localhost'
PORT = int(os.getenv("CSTAR_DAEMON_PORT", 50051))

class DaemonClient:
    """Lightweight sync/async client for TUI."""
    
    async def send_command(self, payload: dict) -> dict:
        reader, writer = await asyncio.open_connection(HOST, PORT)
        writer.write(json.dumps(payload).encode('utf-8'))
        await writer.drain()
        
        data = await reader.read(8192) # Adjust buffer if needed
        response = json.loads(data.decode('utf-8'))
        
        writer.close()
        await writer.wait_closed()
        return response

class HeaderWidget(Static):
    """zone 1: Header"""
    def compose(self) -> ComposeResult:
        with Horizontal():
            yield Label(f" PROJECT: {PROJECT_ROOT.name} ", id="header_project")
            yield Label(" BRANCH: ... ", id="header_branch")
            yield Label(" RAM: ... ", id="header_ram")
            yield Label(" STATUS: ... ", id="header_status")

    def update_stats(self, data: dict):
        self.query_one("#header_project", Label).update(f" PROJECT: {PROJECT_ROOT.name} ")
        if "vitals" in data:
            v = data["vitals"]
            self.query_one("#header_branch", Label).update(f" BRANCH: {v.get('branch')} ")
            self.query_one("#header_ram", Label).update(f" RAM: {v.get('ram')}MB ")
            self.query_one("#header_status", Label).update(f" STATUS: {v.get('status')} ")

class SidebarWidget(Static):
    """zone 2: Sidebar (Mission Log)"""
    def compose(self) -> ComposeResult:
        yield Label("[u]MISSION LOG[/u]", id="sidebar_title")
        yield Static("Loading...", id="sidebar_content")

    def update_tasks(self, tasks: list):
        content = ""
        for i, t in enumerate(tasks):
            content += f"[bold cyan]{i+1}.[/] {t}\n\n"
        self.query_one("#sidebar_content", Static).update(content)

class InputWidget(Input):
    """zone 4: Input Bar"""
    def on_mount(self):
        self.placeholder = "Command (Active)..."

class SovereignApp(App):
    """The Sovereign HUD Application."""
    
    CSS = """
    Screen {
        layout: grid;
        grid-size: 2;
        grid-columns: 25% 75%;
        grid-rows: 3fr 1fr;
    }
    
    HeaderWidget {
        column-span: 2;
        height: 3;
        dock: top;
        background: $surface-darken-1;
        content-align: center middle;
        text-style: bold;
    }

    SidebarWidget {
        row-span: 2;
        dock: left;
        width: 100%;
        height: 100%;
        background: $panel;
        border-right: vkey $accent;
        padding: 1;
    }

    Log {
        column-span: 1;
        row-span: 1;
        height: 100%;
        border: solid $accent;
        background: $surface;
    }

    InputWidget {
        column-span: 1;
        dock: bottom;
        height: 3;
        border: solid $accent;
    }
    
    #header_project { color: $accent; }
    #header_status { color: $success; }
    """

    def compose(self) -> ComposeResult:
        yield HeaderWidget()
        with Horizontal():
            yield SidebarWidget()
            with Vertical():
                yield Log(id="console", markup=True)
                yield InputWidget(id="input")
        yield Footer()

    def on_mount(self):
        self.client = DaemonClient()
        self.title = "C* SOVEREIGN HUD"
        # Start Polling
        self.set_interval(5, self.poll_dashboard)
        self.poll_dashboard() # drift

    @work(exclusive=True)
    async def poll_dashboard(self):
        try:
            state = await self.client.send_command({"command": "get_dashboard_state"})
            
            # Update Header
            self.query_one(HeaderWidget).update_stats(state)
            
            # Update Sidebar
            self.query_one(SidebarWidget).update_tasks(state.get("tasks", []))
            
        except Exception as e:
            self.query_one(Log).write(Text(f"[ERROR] Daemon Connection Failed: {e}", style="bold red"))

    async def on_input_submitted(self, message: Input.Submitted):
        cmd = message.value
        self.query_one(Input).value = ""
        
        if cmd.strip():
            self.query_one(Log).write(Text(f"C*> {cmd}", style="bold white"))
            # Send to Daemon
            # For now, simplistic command handling via same client
            # In Phase 11 plan, we agreed: handle_input sends {"command": cmd}
            # Wait, daemon expects {"command": "forge", ...}
            # We need to map TUI input to Daemon command structure
            # For this MVP, we treat the input as the 'command' string key or raw input?
            # Daemon.handle_request parse: command = request.get('command')
            # Daemon.process_command(input_str...)
            # So we pass {"command": cmd_parts[0], "args": cmd_parts[1:]}
            
            parts = cmd.split()
            c = parts[0].lower()
            a = parts[1:]
            
            if c == "clear":
                self.query_one(Log).clear()
                return

            try:
                # If forge, strictly map args? "forge task target" -> forge --task ...
                # Or simplistic: just pass raw string and let daemon handle?
                # Daemon.handle_request expects JSON.
                
                resp = await self.client.send_command({"command": c, "args": a})
                
                # Render Response
                log = self.query_one(Log)
                if resp.get("status") == "success":
                   log.write(Text(f"[ALFRED] {resp}", style="cyan"))
                elif resp.get("status") == "error":
                   log.write(Text(f"[HEIMDALL] {resp.get('message')}", style="bold red"))
                else:
                   log.write(str(resp))
                   
            except Exception as e:
                 self.query_one(Log).write(Text(f"[ERROR] Command Failed: {e}", style="bold red"))

if __name__ == "__main__":
    app = SovereignApp()
    app.run()
