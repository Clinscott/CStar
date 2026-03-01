import json
from pathlib import Path

from src.core.sovereign_hud import SovereignHUD


class MissionCoordinator:
    """
    [ALFRED] Coordinates the Hunt and Selection phases of the Ravens Protocol.
    Integrates with PennyOne Tech Debt Ledger and Matrix Graph.
    """
    def __init__(self, root: Path):
        self.root = root

    def select_mission(self, runtime_breaches: list) -> dict | None:
        """Prioritizes missions from the Ledger and selects specific Gungnir targets."""
        ledger_path = self.root / ".agent" / "tech_debt_ledger.json"
        graph_path = self.root / ".stats" / "matrix-graph.json"

        if not ledger_path.exists():
            return self._legacy_sort(runtime_breaches)

        try:
            # 1. Load Data
            ledger_data = json.loads(ledger_path.read_text(encoding="utf-8"))
            targets = [t for t in ledger_data.get("top_targets", []) if t.get("status") != "BLOCKED_STUCK"]
            
            if not targets:
                return self._legacy_sort(runtime_breaches)

            # 2. Sort by Priority
            priority_weight = {"CRITICAL": 3, "HIGH": 2, "MEDIUM": 1}
            targets.sort(key=lambda x: (priority_weight.get(x["priority"], 0), x["metrics"].get("gravity", 0)), reverse=True)
            
            top = targets[0]
            
            # 3. Consult Matrix Graph for specific calculus
            target_metric = "OVERALL"
            initial_score = 5.0
            
            if graph_path.exists():
                graph = json.loads(graph_path.read_text(encoding="utf-8"))
                file_entry = next((f for f in graph.get("files", []) if f["path"] == top["file"]), None)
                if file_entry:
                    m = file_entry.get("matrix", {})
                    # Pick the absolute lowest score from Logic, Style, Intel
                    scores = {
                        "LOGIC": m.get("logic", 10.0),
                        "STYLE": m.get("style", 10.0),
                        "INTEL": m.get("intel", 10.0)
                    }
                    target_metric = min(scores, key=scores.get)
                    initial_score = scores[target_metric]

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
                "metrics": top.get("metrics", {})
            }
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Mission Coordination Failed: {e}")
            return self._legacy_sort(runtime_breaches)

    def _legacy_sort(self, breaches: list) -> dict | None:
        if not breaches: return None
        severity_map = {"CRITICAL": 100, "HIGH": 80, "MEDIUM": 50, "LOW": 20}
        breaches.sort(key=lambda b: severity_map.get(b.get("severity", "LOW").upper(), 0), reverse=True)
        return breaches[0]
