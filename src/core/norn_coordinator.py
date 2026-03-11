from pathlib import Path
from typing import Any

from src.core.engine.bead_ledger import BeadLedger


class NornCoordinator:
    """
    [🧵] THE SOVEREIGN BEAD SYSTEM
    Compatibility wrapper over the Hall-backed bead ledger and `tasks.qmd` projection.
    """

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.db_path = project_root / ".stats" / "pennyone.db"
        self.tasks_file = project_root / "tasks.qmd"
        self.ledger = BeadLedger(project_root)

    def _get_conn(self):
        return self.ledger.connect()

    def sync_tasks(self) -> int:
        """Regenerates the `tasks.qmd` projection from the sovereign bead ledger."""
        return self.ledger.sync_tasks_projection()

    def peek_next_bead(self) -> dict[str, Any] | None:
        self.sync_tasks()
        return self.ledger.peek_next_bead()

    def get_next_bead(self, agent_id: str) -> dict[str, Any] | None:
        """Claims the next structured bead for the given agent."""
        self.sync_tasks()
        return self.ledger.claim_next_bead(agent_id)

    def complete_bead_work(self, bead_id: int | str, resolution_note: str | None = None) -> None:
        """Moves a claimed bead into review once implementation work is complete."""
        bead = self.ledger.get_bead(bead_id)
        if bead is not None and bead.status == "OPEN":
            self.ledger.claim_bead(bead_id, "NORN")
        self.ledger.mark_ready_for_review(bead_id, resolution_note=resolution_note)

    def finalize_bead(
        self,
        bead_id: int | str,
        *,
        validation_id: str | None = None,
        resolution_note: str | None = None,
    ):
        """Finalizes a bead only when canonical validation evidence exists."""
        bead = self.ledger.get_bead(bead_id)
        if bead is None:
            return None
        if bead.status == "OPEN":
            bead = self.ledger.claim_bead(bead_id, "NORN")
        bead = self.ledger.get_bead(bead_id)
        if bead is not None and bead.status == "IN_PROGRESS":
            self.ledger.mark_ready_for_review(bead_id, resolution_note=resolution_note)
        return self.ledger.resolve_bead(bead_id, validation_id=validation_id, resolution_note=resolution_note)

    def block_bead(self, bead_id: int | str, triage_reason: str, resolution_note: str | None = None):
        """Moves a bead out of the live queue when autonomous work fails and requires review."""
        return self.ledger.block_bead(bead_id, triage_reason, resolution_note=resolution_note)

    def resolve_bead(self, bead_id: int | str) -> None:
        """Compatibility wrapper that now advances a bead into review instead of resolving it outright."""
        self.complete_bead_work(bead_id)
