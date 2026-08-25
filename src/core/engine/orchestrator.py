"""
[SPOKE] Sovereign Orchestrator
Lore: "The Weaver of Intent."
Purpose: Orchestration of the Search -> Discovery -> Fallback flow.
"""

import json
from pathlib import Path
from typing import Any

from src.core.payload import IntentPayload
from src.core.sovereign_hud import SovereignHUD


class SovereignOrchestrator:
    """
    [Omega] The Weaver spoke.
    Orchestrates local search flows and constructs payloads.
    """

    def __init__(
        self,
        project_root: Path,
        base_path: Path,
        thresholds: dict,
        config: dict,
    ) -> None:
        self.project_root = project_root
        self.base_path = base_path
        self.thresholds = thresholds
        self.config = config

    def execute_search(
        self,
        query: str,
        engine: Any,
        injector: Any,
        executor: Any,
        reporter: Any,
        context: Any,
        record: bool = False,
        json_mode: bool = False,
    ) -> None:
        """Orchestrates the main engine search flow."""
        if not query and not json_mode:
            # A blank query may surface the active presentation profile, but it
            # must never use persona selection as a policy-enforcement trigger.
            style_context = getattr(context, "persona_style_context", None)
            if not isinstance(style_context, dict):
                style_context = context.strategy.get_style_context()
            persona = str(style_context.get("persona", "ALFRED"))
            tone = str(style_context.get("tone", "professional"))
            SovereignHUD.persona_log(
                "INFO",
                f"Persona style active: {persona} ({tone}); authority unchanged.",
            )
            return

        if not query:
            return

        # 1. Search Local Engine
        results = engine.search(query)
        top = results[0] if results else None

        # 2. Sovereign Discovery (Local skills insufficient)
        if not top or top["score"] < 1.9:
            discovery = injector.proactive_discovery(query)
            if discovery and (not top or discovery["score"] > top["score"]):
                top = discovery
            elif not top or top["score"] < self.thresholds["REC"]:
                SovereignHUD.persona_log(
                    "WARN",
                    "SovereignEngine: No matching local skills found. "
                    "External research requires the authorized Researcher lane.",
                )
                top = None

        # 3. Payload Generation
        payload = self.create_payload(query, top, engine) if top else None

        if record and payload:
            reporter.record_trace(payload)

        if json_mode:
            print(
                json.dumps(
                    {"query": query, "payload": payload.to_dict() if payload else None},
                    indent=2,
                )
            )
            return

        # 4. Rendering & Proactive Logic
        reporter.render_hud(payload, query, engine)

        if payload:
            # Compatibility notification only. The executor is permanently
            # non-actuating and cannot install or forge from an intent match.
            executor.handle_proactive(payload)

        # Forge Suggestion (Autonomous JIT Tool Forging)
        if not payload or payload.system_meta["confidence"] < 0.5:
            executor.suggest_forge(query)

    def web_fallback(self, query: str) -> dict | None:
        """Retained compatibility surface; external search is Researcher-owned."""
        del query
        return None

    def create_payload(self, query: str, top: dict, engine: Any) -> IntentPayload:
        """Loads state and constructs the IntentPayload."""
        state_path = self.base_path / "state" / "terminal.json"
        terminal_state = {}
        if state_path.exists():
            try:
                with state_path.open(encoding="utf-8") as f:
                    terminal_state = json.load(f)
            except Exception as exc:
                SovereignHUD.persona_log(
                    "WARN",
                    f"State Registry Load Failure: {exc}",
                )

        meta = {
            "confidence": top["score"],
            "version": self.config.get("version", "unknown"),
            "is_global": top.get("is_global", False),
        }
        return IntentPayload(
            system_meta=meta,
            intent_raw=query,
            intent_normalized=engine.normalize(query),
            target_workflow=top["trigger"],
            extracted_entities=(
                {"web_results": top.get("web_results", [])}
                if "web_results" in top
                else {}
            ),
            terminal_state=terminal_state,
        )
