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
from typing import Any

import personas
import utils
from engine import Cortex, DialogueRetriever, SovereignVector
from src.core.sovereign_hud import SovereignHUD


class SovereignEngine:
    """
    Main orchestrator for the Corvus Star engine operations.
    """

    THRESHOLDS = {"REC": 0.5, "INSTALL": 0.85, "HANDSHAKE": 0.9, "ACCURACY": 0.8}

    def __init__(self, project_root: Path | None = None):
        self.script_dir = Path(__file__).parent.absolute()
        self.project_root = project_root if project_root else self.script_dir.parent.parent
        self.base_path = self.project_root / ".agent"
        self.config = utils.load_config(str(self.project_root))

        # Persona & SovereignHUD Initialization
        SovereignHUD.PERSONA = (self.config.get("persona") or self.config.get("Persona") or "ALFRED").upper()
        self.strategy = personas.get_strategy(SovereignHUD.PERSONA, str(self.project_root))
        self._init_hud_dialogue()

    def _init_hud_dialogue(self) -> None:
        """Initializes the SovereignHUD dialogue retriever based on persona voice."""
        voice = self.strategy.get_voice()
        # [ALFRED] Staged Path Resolution for dialogue databases
        qmd = self.project_root / "dialogue_db" / f"{voice}.qmd"
        md = self.project_root / "dialogue_db" / f"{voice}.md"
        path = qmd if qmd.exists() else md
        SovereignHUD.DIALOGUE = DialogueRetriever(str(path))

    def _init_vector_engine(self) -> SovereignVector:
        """Initializes and loads skills into the Sovereign Vector engine."""
        engine = SovereignVector(
            str(self.project_root / "thesaurus.qmd"),
            str(self.base_path / "corrections.json"),
            str(self.base_path / "scripts" / "stopwords.json")
        )
        engine.load_core_skills()
        engine.load_skills_from_dir(str(self.base_path / "skills"))

        # Load Remote Knowledge Skills
        remote_path_str = self.config.get("KnowledgeCore") or \
                         str(Path(self.config.get("FrameworkRoot", "")) / "skills_db")
        if remote_path_str:
            remote_path = Path(remote_path_str)
            if remote_path.exists():
                skill_dir = remote_path / "skills" if "KnowledgeCores" in str(remote_path) else remote_path
                engine.load_skills_from_dir(str(skill_dir), prefix="GLOBAL:")

        engine.build_index()
        return engine

    def handle_cortex_query(self, query: str) -> None:
        """Execution path for Knowledge Graph (Cortex) queries."""
        cortex = Cortex(str(self.project_root), str(self.base_path))
        results = cortex.query(query)
        SovereignHUD.box_top("CORTEX KNOWLEDGE QUERY")
        SovereignHUD.box_row("QUERY", query, SovereignHUD.BOLD)
        SovereignHUD.box_separator()
        if not results:
            SovereignHUD.box_row("RESULT", "NO DATA FOUND", SovereignHUD.RED)
        else:
            for r in results[:3]:
                color = SovereignHUD.GREEN if r['score'] > self.THRESHOLDS["REC"] else SovereignHUD.YELLOW
                SovereignHUD.box_row("SOURCE", r.get('trigger', 'unknown'), SovereignHUD.MAGENTA, dim_label=True)
                SovereignHUD.box_row("RELEVANCE", f"{r['score']:.2f}", color, dim_label=True)
                SovereignHUD.box_separator()
        SovereignHUD.box_bottom()
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
            "persona": SovereignHUD.PERSONA,
            "timestamp": self.config.get("version", "unknown")
        }

        try:
            with trace_file.open("w", encoding='utf-8') as f:
                json.dump(trace_data, f, indent=2)
        except OSError:
            pass

    def _render_hud(self, query: str, top: dict[str, Any] | None) -> None:
        """Renders the standard search results in the SovereignHUD."""
        SovereignHUD.box_top()
        label = "COMMAND" if SovereignHUD.PERSONA == "ODIN" else "Intent"
        SovereignHUD.box_row(label, query, SovereignHUD.BOLD)

        if top:
            color = SovereignHUD.GREEN if top['score'] > self.THRESHOLDS["ACCURACY"] else SovereignHUD.YELLOW
            match_str = f"{'[G] ' if top['is_global'] else ''}{top['trigger']}"
            SovereignHUD.box_row("Match", match_str, SovereignHUD.DIM)
            SovereignHUD.box_row("Confidence", f"{SovereignHUD.progress_bar(top['score'])} {top['score']:.2f}", color)
        else:
            SovereignHUD.box_row("Match", "NONE", SovereignHUD.RED)

        SovereignHUD.box_bottom()

    def _handle_proactive(self, top: dict[str, Any]) -> None:
        """Checks for and executes proactive installation or command runs."""
        if top['score'] <= self.THRESHOLDS["ACCURACY"]:
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
        SovereignHUD.box_top("PROACTIVE INSTALL")
        SovereignHUD.box_row("SKILL", skill_name, SovereignHUD.CYAN)
        SovereignHUD.box_bottom()
        prompt = f"\n{SovereignHUD.CYAN}>> [C*] {SovereignHUD._speak('PROACTIVE_INSTALL', 'Install skill?')} [Y/n] {SovereignHUD.RESET}"
        if utils.input_with_timeout(prompt) in ['', 'y', 'yes', 'Y', 'YES']:
            subprocess.run([sys.executable, str(self.script_dir / "install_skill.py"), skill_name])

    def _proactive_execute(self, command: str) -> None:
        """Prompts and executes a direct CLI command."""
        SovereignHUD.box_top("PROACTIVE EXECUTE")
        SovereignHUD.box_row("CMD", command, SovereignHUD.YELLOW)
        SovereignHUD.box_bottom()
        prompt = f"\n{SovereignHUD.CYAN}>> [C*] {SovereignHUD._speak('PROACTIVE_EXECUTE', 'Run this command?')} [Y/n] {SovereignHUD.RESET}"
        if utils.input_with_timeout(prompt) in ['', 'y', 'yes', 'Y', 'YES']:
            subprocess.run(command, shell=True, cwd=str(self.project_root))

    def run(self, query: str, json_mode: bool = False, record: bool = False, use_cortex: bool = False) -> None:
        """Orchestrates the main engine search flow."""
        if use_cortex and query:
            self.handle_cortex_query(query)
            return

        if not query and not json_mode:
            for res in self.strategy.enforce_policy():
                SovereignHUD.persona_log("INFO", res)
            return

        # Engine Setup & Execution
        engine = self._init_vector_engine()
        if not query:
            return

        results = engine.search(query)
        top = results[0] if results else None

        if record and top:
            self.record_trace(query, top)

        if json_mode:
            print(json.dumps({"query": query, "top_match": top}, indent=2))
            return

        # Interface Feedback
        self._render_hud(query, top)
        if top:
            self._handle_proactive(top)


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
        SovereignHUD.box_top("DIAGNOSTIC")
        SovereignHUD.box_row("ENGINE", "SovereignVector 2.5 (Iron Cortex)", SovereignHUD.CYAN)
        SovereignHUD.box_row("PERSONA", SovereignHUD.PERSONA, SovereignHUD.MAGENTA)
        SovereignHUD.box_bottom()
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
