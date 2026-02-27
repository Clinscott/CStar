"""
[RuneCaster: TYPE SAFETY]
Lore: "Casting the Runes of Definition."
Purpose: Identify missing type hints using AST.
"""

import ast
from typing import Any

from src.sentinel.wardens.base import BaseWarden


class RuneCasterWarden(BaseWarden):
    def scan(self) -> list[dict[str, Any]]:
        """
        [Ω] THE RUNE CASTING
        Delegates the heavy lifting to the RuneCasterAudit tool.
        """
        from src.tools.debug.runecaster_audit import RuneCasterAudit
        
        audit = RuneCasterAudit(self.root)
        self.breaches = audit.run()
        return self.breaches
