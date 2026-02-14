#!/usr/bin/env python3
"""
[ODIN] Sovereign Engine Entry Point (sv_engine.py)
Orchestrates neural search, cortex queries, and proactive skill installation.
Refined for the Linscott Standard (Typing, Pathlib, Encapsulation).
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, ClassVar

# Add project root to path for src imports
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core import personas, utils  # noqa: E402
from src.core.engine.cortex import Cortex  # noqa: E402
from src.core.engine.dialogue import DialogueEngine  # noqa: E402
from src.core.engine.vector import SovereignVector  # noqa: E402
from src.core.ui import HUD  # noqa: E402
from src.tools.brave_search import BraveSearch  # noqa: E402


class SovereignEngine:
    """
    Main orchestrator for the Corvus Star engine operations.
    """

    _DEFAULT_THRESHOLDS: ClassVar[dict[str, float]] = {
        "REC": 0.5, "INSTALL": 0.85, "HANDSHAKE": 0.9, "ACCURACY": 0.8
    }

    def __init__(self, project_root: Path | None = None) -> None:
        self.script_dir = Path(__file__).parent.absolute()
        self.project_root = project_root if project_root else self.script_dir.parent.parent
        self.base_path = self.project_root / ".agent"
        self.config = utils.load_config(str(self.project_root))

        # [ALFRED] Externalized thresholds: config.json overrides defaults
        self.THRESHOLDS = {
            k: self.config.get("thresholds", {}).get(k, v)
            for k, v in self._DEFAULT_THRESHOLDS.items()
        }

        # Persona & HUD Initialization
        HUD.PERSONA = (self.config.get("persona") or self.config.get("Persona") or "ALFRED").upper()
        HUD._INITIALIZED = True
        self.strategy = personas.get_strategy(HUD.PERSONA, str(self.project_root))
        self._init_hud_dialogue()
        self.engine = self._init_vector_engine()

    def _init_hud_dialogue(self) -> None:
        """Initializes the HUD dialogue retriever based on persona voice."""
        voice = self.strategy.get_voice()
        # [ALFRED] Staged Path Resolution for dialogue databases
        qmd = self.project_root / "src" / "data" / "dialogue" / f"{voice}.qmd"
        md = self.project_root / "src" / "data" / "dialogue" / f"{voice}.md"
        path = qmd if qmd.exists() else md
        HUD.DIALOGUE = DialogueEngine(str(path))

    def _init_vector_engine(self) -> SovereignVector:
        """Initializes and loads skills into the Sovereign Vector engine."""
        engine = SovereignVector(
            str(self.project_root / "src" / "data" / "thesaurus.qmd"),
            str(self.base_path / "corrections.json"),
            str(self.project_root / "src" / "data" / "stopwords.json")
        )
        engine.load_core_skills()
        engine.load_skills_from_dir(str(self.project_root / "src" / "skills" / "local"))

        # Load Remote Knowledge Skills
        remote_path_str = self.config.get("KnowledgeCore") or \
                         str(Path(self.config.get("FrameworkRoot", "")) / "skills_db")
        if remote_path_str:
            remote_path = Path(remote_path_str)
            if remote_path.exists():

                # Check for 'skills' subdir explicitly
                skill_dir = remote_path / "skills"
                if not skill_dir.exists():
                     skill_dir = remote_path
                engine.load_skills_from_dir(str(skill_dir), prefix="GLOBAL:")

        # Force-load local skills_db if present (Project-level Global Skills)
        local_skills_db = self.project_root / "skills_db"
        if local_skills_db.exists():
            engine.load_skills_from_dir(str(local_skills_db), prefix="GLOBAL:")

        engine.build_index()
        return engine

    def handle_cortex_query(self, query: str) -> None:
        """Execution path for Knowledge Graph (Cortex) queries."""
        cortex = Cortex(str(self.project_root), str(self.base_path))
        results = cortex.query(query)
        HUD.box_top("CORTEX KNOWLEDGE QUERY")
        HUD.box_row("QUERY", query, HUD.BOLD)
        HUD.box_separator()
        if not results:
            HUD.box_row("RESULT", "NO DATA FOUND", HUD.RED)
        else:
            for r in results[:3]:
                color = HUD.GREEN if r['score'] > self.THRESHOLDS["REC"] else HUD.YELLOW
                HUD.box_row("SOURCE", r.get('trigger', 'unknown'), HUD.MAGENTA, dim_label=True)
                HUD.box_row("RELEVANCE", f"{r['score']:.2f}", color, dim_label=True)
                HUD.box_separator()
        HUD.box_bottom()
        sys.exit(0)

    def record_trace(self, query: str, match: dict[str, Any]) -> None:
        """Persistence for neural interaction traces."""
        tdir = self.base_path / "traces"
        tdir.mkdir(exist_ok=True)
        tid = re.sub(r'\W+', '_', query[:20]) + f"_{match['score']:.2f}"
        trace_file = tdir / f"{tid}.json"

        trace_data = {
            "query": query,
            "match": match.get('trigger'),
            "score": match.get('score'),
            "is_global": match.get('is_global', False),
            "persona": HUD.PERSONA,
            "timestamp": self.config.get("version", "unknown")
        }

        try:
            with trace_file.open("w", encoding='utf-8') as f:
                json.dump(trace_data, f, indent=2)
        except OSError:
            pass

    def _render_hud(self, query: str, top: dict[str, Any] | None) -> None:
        """Renders the standard search results in the HUD."""
        HUD.box_top()
        label = "COMMAND" if HUD.PERSONA == "ODIN" else "Intent"
        HUD.box_row(label, query, HUD.BOLD)

        if top:
            color = HUD.GREEN if top['score'] > self.THRESHOLDS["ACCURACY"] else HUD.YELLOW
            match_str = f"{'[G] ' if top['is_global'] else ''}{top['trigger']}"
            HUD.box_row("Match", match_str, HUD.DIM)
            HUD.box_row("Confidence", f"{HUD.progress_bar(top['score'])} {top['score']:.2f}", color)
            
            if top['trigger'] == 'WEB_FALLBACK':
                 HUD.box_separator()
                 HUD.box_row("WEB RESULTS", "", HUD.CYAN)
                 for i, r in enumerate(top['web_results'][:3]): # Show top 3
                     HUD.box_row(f"[{i+1}]", r['title'], HUD.BOLD)
                     HUD.box_row("   ", r['url'], HUD.DIM)

        else:
            HUD.box_row("Match", "NONE", HUD.RED)

        HUD.box_bottom()

    def _handle_proactive(self, top: dict[str, Any]) -> None:
        """Checks for and executes proactive installation or command runs."""
        if top['score'] <= self.THRESHOLDS["ACCURACY"] and top['trigger'] != 'WEB_FALLBACK':
            return
        
        if top['trigger'] == 'WEB_FALLBACK':
            return

        trigger = top['trigger']

        # 1. Global Skill Installation
        if top['is_global'] and top['score'] > self.THRESHOLDS["INSTALL"]:
            self._proactive_install(trigger.replace("GLOBAL:", ""))

        # 2. Direct Command Execution
        elif not trigger.startswith("/") and not trigger.startswith("GLOBAL:"):
            self._proactive_execute(trigger)

    def _proactive_install(self, skill_name: str) -> None:
        """Prompts and installs a missing global skill."""
        HUD.box_top("PROACTIVE INSTALL")
        HUD.box_row("SKILL", skill_name, HUD.CYAN)
        HUD.box_bottom()
        speak = HUD._speak('PROACTIVE_INSTALL', 'Install skill?')
        prompt = f"\n{HUD.CYAN}>> [C*] {speak} [Y/n] {HUD.RESET}"
        if utils.input_with_timeout(prompt) in ['', 'y', 'yes', 'Y', 'YES']:
            subprocess.run(  # noqa: S603
                [sys.executable, str(self.script_dir / "install_skill.py"), skill_name]
            )

    def _proactive_execute(self, command: str) -> None:
        """Prompts and executes a direct CLI command."""
        HUD.box_top("PROACTIVE EXECUTE")
        HUD.box_row("CMD", command, HUD.YELLOW)
        HUD.box_bottom()
        speak = HUD._speak('PROACTIVE_EXECUTE', 'Run this command?')
        prompt = f"\n{HUD.CYAN}>> [C*] {speak} [Y/n] {HUD.RESET}"
        if utils.input_with_timeout(prompt) in ['', 'y', 'yes', 'Y', 'YES']:
            subprocess.run(command, shell=True, cwd=str(self.project_root))  # noqa: S602

    def run(
        self,
        query: str,
        json_mode: bool = False,
        record: bool = False,
        use_cortex: bool = False,
    ) -> None:
        """Orchestrates the main engine search flow."""
        if use_cortex and query:
            self.handle_cortex_query(query)
            return

        if not query and not json_mode:
            for res in self.strategy.enforce_policy():
                HUD.persona_log("INFO", res)
            return

        # Engine Setup & Execution
        engine = self._init_vector_engine()
        if not query:
            return

        results = engine.search(query)
        top = results[0] if results else None

        if not top or top['score'] < 0.6:
            # Zero-Hit Fallback: Brave Web Search
            HUD.persona_log("INFO", "SovereignEngine: Low confidence match. Creating Web Fallback...") 
            searcher = BraveSearch()
            web_results = searcher.search(query)
            
            if web_results:
                formatted_results = "\n".join(
                    [f"- {r['title']} ({r['url']})\n  {r['description']}" for r in web_results[:3]]
                )
                top = {
                    "trigger": "WEB_FALLBACK",
                    "score": 1.0,
                    "data": formatted_results,
                    "is_global": False,
                    "web_results": web_results 
                }

        if record and top:
            self.record_trace(query, top)

        self._render_hud(query, top)

        # [BIFRÖST] Raven's Eye: Proactive Lexicon Expansion
        if top and top['score'] < 0.65:
            self._proactive_lexicon_lift(query, engine)

        if top:
            self._handle_proactive(top)

        if json_mode:
            print(json.dumps({"query": query, "top_match": top}, indent=2))
            return

    def search(self, query: str) -> list[dict[str, Any]]:
        """Proxy for the underlying vector engine search."""
        return self.engine.search(query)

    def _proactive_lexicon_lift(self, query: str, engine: SovereignVector) -> None:
        """
        Identify unknown terms and trigger a web search to expand the session lexicon.
        Injects definitions into the active Cortex session.
        """
        # 1. Identify words not in vocab
        words = re.findall(r'\b[a-zA-Z]{4,}\b', query.lower())
        unknown_terms = [w for w in words if w not in engine.vocab and w not in engine.stopwords]

        if not unknown_terms:
            return

        term = unknown_terms[0]
        HUD.persona_log("INFO", f"Raven's Eye: Unknown term detected '{term}'. Seeking definition...")

        # 2. Trigger Brave Search
        searcher = BraveSearch()
        results = searcher.search(f"Technical definition and synonyms for {term}")

        if not results:
            return

        # 3. Synthesize definition (take first valid snippet)
        definition = results[0].get('description', '')
        if not definition:
            return

        HUD.persona_log("INFO", f"Raven's Eye: Ingesting intelligence for '{term}'.")

        # 4. Inject into Cortex (Session-local)
        cortex = Cortex(str(self.project_root), str(self.base_path))
        cortex.add_node(f"LEXICON:{term}", {"definition": definition, "source": "BraveSearch", "query": term})
        
        # [ALFRED] Note: This improves session-level intent mapping for subsequent queries


def main() -> None:
    """CLI entry point for sv_engine.py."""
    parser = argparse.ArgumentParser(description="Corvus Star Sovereign Engine")
    parser.add_argument("query", nargs="*", help="Query phrase or intent")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    parser.add_argument("--record", action="store_true", help="Record neural trace")
    parser.add_argument("--benchmark", action="store_true", help="Display diagnostic info")
    parser.add_argument("--cortex", action="store_true", help="Query the Knowledge Graph")
    args = parser.parse_args()

    engine = SovereignEngine()

    if args.benchmark:
        ve = engine._init_vector_engine()
        HUD.box_top("DIAGNOSTIC")
        HUD.box_row("ENGINE", "SovereignVector 2.5 (Iron Cortex)", HUD.CYAN)
        HUD.box_row("PERSONA", HUD.PERSONA, HUD.MAGENTA)
        HUD.box_separator()
        HUD.box_row("SKILLS", f"{len(ve.skills)}", HUD.GREEN)
        HUD.box_row("TOKENS", f"{len(ve.vocab)}", HUD.YELLOW)
        HUD.box_row("VECTORS", f"{len(ve.vectors)}", HUD.CYAN)
        HUD.box_bottom()
        sys.exit(0)

    query = utils.sanitize_query(" ".join(args.query))
    engine.run(
        query=query,
        json_mode=args.json,
        record=args.record,
        use_cortex=args.cortex
    )


if __name__ == "__main__":
    main()