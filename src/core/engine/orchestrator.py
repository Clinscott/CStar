"""
[SPOKE] Sovereign Orchestrator
Lore: "The Weaver of Intent."
Purpose: Orchestration of the Search -> Discovery -> Fallback flow.
"""

import json
from pathlib import Path
from typing import Any
from src.core.payload import IntentPayload
from src.core.engine.cortex import Cortex
from src.core.sovereign_hud import SovereignHUD
from src.tools.brave_search import BraveSearch
from src.tools.gemini_search import GeminiSearch

class SovereignOrchestrator:
    """
    [Ω] The Weaver spoke.
    Orchestrates search flows, handles web fallbacks, and constructs payloads.
    """
    def __init__(self, project_root: Path, base_path: Path, thresholds: dict, config: dict):
        self.project_root = project_root
        self.base_path = base_path
        self.thresholds = thresholds
        self.config = config

    def execute_search(self, query: str, engine: Any, injector: Any, executor: Any, reporter: Any, context: Any, record: bool = False, json_mode: bool = False) -> None:
        """Orchestrates the main engine search flow."""
        if not query and not json_mode:
            # Policy enforcement (Moved from engine.run)
            for res in context.strategy.enforce_policy():
                SovereignHUD.persona_log("INFO", res)
            return

        if not query:
            return

        # 1. Search Local Engine
        results = engine.search(query)
        top = results[0] if results else None

        # 2. Sovereign Discovery (Local skills insufficient)
        if not top or top['score'] < 1.9:
            discovery = injector.proactive_discovery(query)
            if discovery and (not top or discovery['score'] > top['score']):
                top = discovery
            elif not top or top['score'] < self.thresholds["REC"]:
                # Zero-Hit Fallback: Web Search
                SovereignHUD.persona_log("INFO", "SovereignEngine: No matching skills found. Fallback...")
                top = self.web_fallback(query)

        # 3. Payload Generation
        payload = self.create_payload(query, top, engine) if top else None

        if record and payload:
            reporter.record_trace(payload)

        if json_mode:
            print(json.dumps({"query": query, "payload": payload.to_dict() if payload else None}, indent=2))
            return

        # 4. Rendering & Proactive Logic
        reporter.render_hud(payload, query, engine)

        if payload:
            # Lexicon Expansion
            if payload.system_meta['confidence'] < 0.65 or payload.target_workflow == 'WEB_FALLBACK':
                injector.proactive_lexicon_lift(query, engine)
            
            # Automated Actions
            executor.handle_proactive(payload)

        # Forge Suggestion (Autonomous JIT Tool Forging)
        if not payload or payload.system_meta['confidence'] < 0.5:
            executor.suggest_forge(query)

    def web_fallback(self, query: str) -> dict | None:
        """Executes integrated web search when skills are elusive."""
        gemini = GeminiSearch()
        searcher = gemini if gemini.is_available() else BraveSearch()
        
        contextual_query = f"Corvus Star agent command '{query}' meaning programmatic interface"
        web_results = searcher.search(contextual_query)

        if web_results:
            formatted_results = "\n".join(
                [f"- {r['title']} ({r['url']})\n  {r['description']}" for r in web_results[:3]]
            )
            return {
                "trigger": "WEB_FALLBACK",
                "score": 1.0,
                "data": formatted_results,
                "is_global": False,
                "web_results": web_results
            }
        return None

    def create_payload(self, query: str, top: dict, engine: Any) -> IntentPayload:
        """Loads state and constructs the IntentPayload."""
        state_path = self.base_path / "state" / "terminal.json"
        terminal_state = {}
        if state_path.exists():
            try:
                with state_path.open(encoding="utf-8") as f:
                    terminal_state = json.load(f)
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"State Registry Load Failure: {e}")

        meta = {
            "confidence": top['score'],
            "version": self.config.get("version", "unknown"),
            "is_global": top.get("is_global", False)
        }
        return IntentPayload(
            system_meta=meta,
            intent_raw=query,
            intent_normalized=engine.normalize(query),
            target_workflow=top['trigger'],
            extracted_entities={"web_results": top.get("web_results", [])} if "web_results" in top else {},
            terminal_state=terminal_state
        )
