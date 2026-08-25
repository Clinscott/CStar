# report_engine.py
import sys
from datetime import datetime
from pathlib import Path

# Add script directory to path for module discovery
current_dir = Path(__file__).parent.absolute()
if str(current_dir) not in sys.path:
    sys.path.append(str(current_dir))

from src.core.sovereign_hud import SovereignHUD


class ReportEngine:
    """
    Applies an explicitly supplied, style-only presentation profile.
    """

    def __init__(self, project_root: str | Path | None = None, persona: str | None = None) -> None:
        self.root = Path(project_root) if project_root else Path.cwd()
        self.persona = str(persona or "NEUTRAL").upper()

        # Ensure SovereignHUD is synced
        SovereignHUD.PERSONA = None if self.persona == "NEUTRAL" else self.persona

    def header(self, title: str) -> str:
        """Returns the stylized ASCII header for the report."""
        is_odin = self.persona in ["O.D.I.N.", "ODIN", "GOD"]
        icon = "Ω" if is_odin else "⚓"
        label = "WAR ROOM:" if is_odin else "The Archive:"
        display_title = title.upper() if is_odin else title.title()
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        return f"""
┌──────────────────────────────────────────────────────────────────────────────┐
│  {icon}  {display_title:<64} │
│  {label} {now:<{60 if is_odin else 58}} │
└──────────────────────────────────────────────────────────────────────────────┘
"""

    def section(self, title: str) -> str:
        """Returns a section divider."""
        if self.persona in ["O.D.I.N.", "ODIN", "GOD"]:
            return f"\n> [!IMPORTANT]\n> **{title.upper()}**\n"
        else:
            return f"\n### {title.title()}\n"

    def verdict(self, status: str, detail: str) -> str:
        """Formats a verdict/conclusion line."""
        if self.persona in ["O.D.I.N.", "ODIN", "GOD"]:
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
        if self.persona in ["O.D.I.N.", "ODIN", "GOD"]:
            return "\n\n---\n**SIGNED: O.D.I.N., THE ALL-FATHER**\n*The Runes Are Cast.*"
        else:
            return "\n\n---\n**Your Humble Servant,**\n*A.L.F.R.E.D. Pennyworth*"

    def generate_report(self, title: str, body: str, status: str = "INFO") -> str:
        """Combines all elements into a final markdown string."""
        return (
            self.header(title) +
            "\n" + body +
            "\n" + self.signature()
        )
