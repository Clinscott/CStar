# report_engine.py
import os
import sys
from datetime import datetime
from pathlib import Path

# Add script directory to path for module discovery
current_dir = Path(__file__).parent.absolute()
if str(current_dir) not in sys.path:
    sys.path.append(str(current_dir))

import utils
from ui import HUD


class ReportEngine:
    """
    Enforces Persona-driven reporting standards.
    Prevents "generic engineer" hallucinations by algorithmically 
    injecting the correct voice and signature.
    """
    
    def __init__(self, project_root: str | Path | None = None) -> None:
        self.root = Path(project_root) if project_root else Path.cwd()
        # Load fresh config to ensure we catch dynamic switches
        self.config = utils.load_config(self.root)
        legacy = self.config.get("persona") or self.config.get("Persona") or "ALFRED"
        self.persona = str(self.config.get("system", {}).get("persona", legacy)).upper()
        
        # Ensure HUD is synced
        HUD.PERSONA = self.persona

    def header(self, title: str) -> str:
        """Returns the stylized ASCII header for the report."""
        if self.persona in ["ODIN", "GOD"]:
            return f"""
┌──────────────────────────────────────────────────────────────────────────────┐
│  Ω  {title.upper():<64} │
│  WAR ROOM: {datetime.now().strftime('%Y-%m-%d %H:%M:%S'):<60} │
└──────────────────────────────────────────────────────────────────────────────┘
"""
        else: # ALFRED
            return f"""
┌──────────────────────────────────────────────────────────────────────────────┐
│  ⚓  {title.title():<64} │
│  The Archive: {datetime.now().strftime('%Y-%m-%d %H:%M:%S'):<58} │
└──────────────────────────────────────────────────────────────────────────────┘
"""

    def section(self, title: str) -> str:
        """Returns a section divider."""
        if self.persona in ["ODIN", "GOD"]:
            return f"\n> [!IMPORTANT]\n> **{title.upper()}**\n"
        else:
            return f"\n### {title.title()}\n"

    def verdict(self, status: str, detail: str) -> str:
        """Formats a verdict/conclusion line."""
        if self.persona in ["ODIN", "GOD"]:
            icon = "✅" if status == "PASS" else "❌"
            return f"\n**JUDGMENT**: {icon} {status.upper()} — *{detail}*"
        else:
            icon = "Isolating..." if status == "FAIL" else "Verified."
            return f"\n**Observation**: {icon} {status} — {detail}"

    def signature(self) -> str:
        """
        The anti-hallucination seal. 
        Returns the ONLY authorized signature for the active persona.
        """
        if self.persona in ["ODIN", "GOD"]:
            return "\n\n---\n**SIGNED: ODIN, THE ALL-FATHER**\n*The Runes Are Cast.*"
        else:
            return "\n\n---\n**Your Humble Servant,**\n*Alfred Pennyworth*"

    def generate_report(self, title: str, body: str, status: str = "INFO") -> str:
        """Combines all elements into a final markdown string."""
        return (
            self.header(title) + 
            "\n" + body + 
            "\n" + self.signature()
        )