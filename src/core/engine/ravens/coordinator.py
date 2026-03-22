import json
from pathlib import Path
from typing import Any

from src.core.norn_coordinator import NornCoordinator
from src.core.sovereign_hud import SovereignHUD


class MissionCoordinator:
    """
    [ALFRED] Coordinates the Hunt and Selection phases of the Ravens Protocol.
    Integrates with PennyOne Tech Debt Ledger and Matrix Graph.
    """
    def __init__(self, root: Path):
        self.root = root
        self.norn = NornCoordinator(root)

    def select_mission(
        self,
        runtime_breaches: list,
        *,
        allow_legacy_fallback: bool = True,
        claim_agent: str | None = None,
    ) -> dict | None:
        """Prioritizes missions from canonical beads first, then falls back to compatibility projections."""
        bead = self.norn.get_next_bead(claim_agent) if claim_agent else self.norn.peek_next_bead()
        if bead is not None:
            return self._bead_to_mission(bead, claimed=claim_agent is not None)

        if runtime_breaches:
            return self._legacy_sort(runtime_breaches)

        if not allow_legacy_fallback:
            return None

        return self._select_legacy_projected_mission()

    def _bead_to_mission(self, bead: dict[str, Any], *, claimed: bool) -> dict[str, Any]:
        metrics = dict(bead.get("baseline_scores") or {})
        initial_score = self._initial_score_from_metrics("OVERALL", metrics)
        target_path = bead.get("target_path") or bead.get("target_ref") or "unscoped"
        SovereignHUD.persona_log(
            "INFO",
            f"Mission Selected: {Path(target_path).name} | Target: OVERALL ({initial_score:.2f})",
        )
        return {
            "mission_id": bead["id"],
            "bead_id": bead["id"],
            "file": target_path,
            "type": "SOVEREIGN_BEAD",
            "action": bead["rationale"],
            "severity": "HIGH",
            "target_metric": "OVERALL",
            "initial_score": initial_score,
            "metrics": metrics,
            "acceptance_criteria": bead.get("acceptance_criteria"),
            "target_kind": bead.get("target_kind"),
            "target_ref": bead.get("target_ref"),
            "scan_id": bead.get("scan_id"),
            "claimed": claimed,
            "compatibility_source": "hall_beads",
        }

    def _select_legacy_projected_mission(self) -> dict | None:
        ledger_path = self.root / ".agents" / "tech_debt_ledger.json"
        if not ledger_path.exists():
            return None

        try:
            ledger_data = json.loads(ledger_path.read_text(encoding="utf-8"))
            targets = [t for t in ledger_data.get("top_targets", []) if t.get("status") != "BLOCKED_STUCK"]
            if not targets:
                return None

            priority_weight = {"CRITICAL": 3, "HIGH": 2, "MEDIUM": 1}
            targets.sort(key=lambda x: (priority_weight.get(x["priority"], 0), x["metrics"].get("gravity", 0)), reverse=True)
            top = targets[0]
            target_metric = top.get("target_metric", "OVERALL").upper()
            metrics = top.get("metrics", {})
            initial_score = self._initial_score_from_metrics(target_metric, metrics)

            SovereignHUD.persona_log("INFO", f"Mission Selected: {Path(top['file']).name} | Target: {target_metric} ({initial_score:.2f})")
            import uuid
            return {
                "mission_id": str(uuid.uuid4()),
                "file": top["file"],
                "type": f"WARDEN_{top['priority']}",
                "action": top["justification"],
                "severity": top["priority"],
                "target_metric": target_metric,
                "initial_score": initial_score,
                "metrics": metrics,
                "compatibility_source": "legacy:tech_debt_ledger",
            }
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Mission Coordination Failed: {e}")
            return None

    @staticmethod
    def _initial_score_from_metrics(target_metric: str, metrics: dict[str, Any]) -> float:
        score_map = {
            "LOGIC": metrics.get("logic", 5.0),
            "STYLE": metrics.get("style", 5.0),
            "INTEL": metrics.get("intel", 5.0),
            "STABILITY": metrics.get("stability", 0.5) * 10,
            "COUPLING": (1.0 - metrics.get("coupling", 0.5)) * 10,
            "ANOMALY": (1.0 - metrics.get("anomaly", 0.0)) * 10,
            "OVERALL": metrics.get("overall", metrics.get("logic", 5.0)),
        }
        return float(score_map.get(target_metric, metrics.get("logic", 5.0)) or 0.0)

    def _legacy_sort(self, breaches: list) -> dict | None:
        if not breaches: return None
        severity_map = {"CRITICAL": 100, "HIGH": 80, "MEDIUM": 50, "LOW": 20}
        breaches.sort(key=lambda b: severity_map.get(b.get("severity", "LOW").upper(), 0), reverse=True)
        return breaches[0]
