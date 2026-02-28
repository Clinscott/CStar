#!/usr/bin/env python3
"""
[O.D.I.N.] Sovereign Engine Entry Point (sv_engine.py)
Orchestrates neural search, cortex queries, and proactive skill installation.
Refined for the Linscott Standard (Typing, Pathlib, Encapsulation).
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

# [ALFRED] Ensure environment is loaded and root is in sys.path
try:
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from src.sentinel._bootstrap import bootstrap
    bootstrap()
except (ImportError, ValueError, IndexError) as e:
    print(f"Bootstrap Failure: {e}")

from src.core import personas, utils
from src.core.engine.cortex import Cortex
from src.core.engine.instruction_loader import InstructionLoader
from src.core.engine.memory_db import MemoryDB
from src.core.engine.vector import SovereignVector
from src.core.payload import IntentPayload
from src.core.sovereign_hud import SovereignHUD
from src.tools.brave_search import BraveSearch
from src.tools.gemini_search import GeminiSearch
from src.tools.compile_session_traces import compile_traces


class SovereignEngine:
    """
    [O.D.I.N.] The Master Engine of Corvus Star.
    V4: High-Performance Intent Resolution with Proactive Acquisition.
    """

    def __init__(self, project_root: Path | None = None) -> None:
        self.project_root = project_root or Path(os.getcwd())
        self.base_path = self.project_root / ".agent"
        self.config = utils.load_config(str(self.project_root))

        # Persona & SovereignHUD Initialization
        legacy_persona = self.config.get("persona") or self.config.get("Persona") or "ALFRED"
        persona_val = str(self.config.get("system", {}).get("persona", legacy_persona))
        SovereignHUD.PERSONA = persona_val.upper()
        SovereignHUD._INITIALIZED = True
        self.strategy = personas.get_strategy(SovereignHUD.PERSONA, str(self.project_root))
        self._init_hud_dialogue()
        self.engine = self._init_vector_engine()
        self.poor_files = self._load_feedback_context()

        # Thresholds
        self.THRESHOLDS = self.config.get("thresholds", {"ACCURACY": 0.85, "REC": 0.70})

    def _load_feedback_context(self) -> list[str]:
        """[ALFRED] Loads poor performance flags from feedback.jsonl."""
        feedback_path = self.base_path / "feedback.jsonl"
        poor_files = []
        if feedback_path.exists():
            try:
                with feedback_path.open(encoding="utf-8") as f:
                    for line in f:
                        data = json.loads(line)
                        if data.get("score", 5) <= 2:
                            target = data.get("target_file")
                            if target and target != "unknown":
                                poor_files.append(target)
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Feedback load error: {e}")
        return list(set(poor_files))

    def _init_hud_dialogue(self) -> None:
        """Sets up the visual greeting."""
        if not sys.stdout.isatty():
            return
        # Silence boot logs for CLI speed
        pass

    def _init_vector_engine(self) -> SovereignVector:
        """Initializes and builds the semantic search index."""
        thesaurus = self.project_root / "src" / "data" / "thesaurus.qmd"
        corrections = self.base_path / "corrections.json"
        stopwords = self.project_root / "src" / "data" / "stopwords.json"

        # Initialize core components
        memory_db = MemoryDB(str(self.base_path))
        instruction_loader = InstructionLoader(str(self.project_root))

        # Check for remote cores in config
        k_config = self.config.get("knowledge", {})
        active = k_config.get("active_core", "primary")
        remote_path_str = k_config.get("cores", {}).get(active) or \
            self.config.get("KnowledgeCore") or \
            str(Path(self.config.get("system", {}).get("framework_root", "")) / "skills_db")

        if remote_path_str:
            remote_path = Path(remote_path_str)
            if remote_path.exists():
                instruction_loader.add_source(str(remote_path))

        vector = SovereignVector(str(thesaurus), str(corrections), str(stopwords))
        vector.memory_db = memory_db
        vector.loader = instruction_loader

        # Load skills
        vector.load_core_skills()
        vector.load_skills_from_dir(str(self.project_root / "src" / "skills" / "local"))
        vector.build_index()

        return vector

    def _render_hud(self, payload: IntentPayload | None, query: str) -> None:
        """Renders the semantic result to the HUD."""
        if not payload:
            SovereignHUD.persona_log("WARN", f"Dissonance detected: '{query}' remains elusive.")
            results = self.engine.search(query)
            if not results:
                SovereignHUD.persona_log("INFO", "The Well of Mimir is silent.")
            else:
                for r in results[:3]:
                    is_good = r['score'] > self.THRESHOLDS["REC"]
                    color = SovereignHUD.GREEN if is_good else SovereignHUD.YELLOW
                    SovereignHUD.box_row("SOURCE", r.get('trigger', 'unknown'),
                                         SovereignHUD.MAGENTA, dim_label=True)
                    SovereignHUD.box_row("RELEVANCE", f"{r['score']:.2f}", color, dim_label=True)
                    SovereignHUD.box_separator()
            return

        SovereignHUD.box_top("GUNGNIR IMPACT")
        SovereignHUD.box_row("Intent", query, SovereignHUD.CYAN)

        if payload:
            confidence = payload.system_meta['confidence']
            is_acc = confidence > self.THRESHOLDS["ACCURACY"]
            color = SovereignHUD.GREEN if is_acc else SovereignHUD.YELLOW
            is_global = payload.system_meta.get('is_global', False)
            match_str = f"{'[G] ' if is_global else ''}{payload.target_workflow}"
            SovereignHUD.box_row("Match", match_str, SovereignHUD.DIM)
            prog = SovereignHUD.progress_bar(confidence)
            SovereignHUD.box_row("Confidence", f"{prog} {confidence:.2f}", color)

            if payload.target_workflow == 'WEB_FALLBACK':
                SovereignHUD.box_separator()
                SovereignHUD.box_row("WEB RESULTS", "", SovereignHUD.CYAN)
                web_results = payload.extracted_entities.get('web_results', [])
                for i, r in enumerate(web_results[:3]):
                    SovereignHUD.box_row(f"[{i+1}]", r['title'], SovereignHUD.BOLD)
                    SovereignHUD.box_row("   ", r['url'], SovereignHUD.DIM)

        SovereignHUD.box_bottom()

    def record_trace(self, payload: IntentPayload) -> None:
        """Persists the neural trace for later analysis."""
        tdir = self.base_path / "traces"
        tdir.mkdir(exist_ok=True)
        conf = payload.system_meta['confidence']
        tid = re.sub(r'\W+', '_', payload.intent_raw[:20]) + f"_{conf:.2f}"
        trace_file = tdir / f"{tid}.json"

        with trace_file.open("w", encoding="utf-8") as f:
            json.dump(payload.to_dict(), f, indent=2)

    def handle_cortex_query(self, query: str) -> None:
        """Direct search against the Knowledge Graph."""
        cortex = Cortex(str(self.project_root), str(self.base_path))
        results = cortex.search(query)

        SovereignHUD.box_top("CORTEX KNOWLEDGE")
        if not results:
            SovereignHUD.box_row("Result", "No documentation matches found.", SovereignHUD.RED)
        else:
            for r in results[:5]:
                SovereignHUD.box_row("SOURCE", r['source'], SovereignHUD.MAGENTA, dim_label=True)
                SovereignHUD.box_row("DOC", r['doc'][:200] + "...", SovereignHUD.DIM)
                SovereignHUD.box_separator()
        SovereignHUD.box_bottom()

    def _handle_proactive(self, payload: IntentPayload) -> None:
        """Executes automated tasks based on payload triggers."""
        if payload.target_workflow == "AUTO_INSTALL":
            skill_name = payload.extracted_entities.get("skill_name")
            if skill_name:
                install_script = self.project_root / "src" / "skills" / "install_skill.py"
                command = f"{sys.executable} {install_script} {skill_name}"
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
                SovereignHUD.persona_log("INFO", res)
            return

        # Engine Setup & Execution
        engine = self._init_vector_engine()
        if not query:
            return

        results = engine.search(query)
        top = results[0] if results else None

        if not top or top['score'] < 0.6:
            # Zero-Hit Fallback: Integrated Search
            SovereignHUD.persona_log("INFO", "SovereignEngine: Low confidence. Fallback...")
            
            # [Ω] Prioritize Gemini CLI Search if active
            gemini = GeminiSearch()
            if gemini.is_available():
                searcher = gemini
            else:
                searcher = BraveSearch()
            
            # [ALFRED] Contextualize the query for better search relevance
            contextual_query = f"Corvus Star agent command '{query}' meaning programmatic interface"
            web_results = searcher.search(contextual_query)

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

        payload = None
        if top:
            meta = {
                "confidence": top['score'],
                "version": self.config.get("version", "unknown"),
                "is_global": top.get("is_global", False)
            }
            payload = IntentPayload(
                system_meta=meta,
                intent_raw=query,
                intent_normalized=engine.normalize(query),
                target_workflow=top['trigger'],
                extracted_entities={"web_results": top.get("web_results", [])}
                if "web_results" in top else {}
            )

        if record and payload:
            self.record_trace(payload)

        self._render_hud(payload, query)

        # [BIFRÖST] Raven's Eye: Proactive Lexicon Expansion
        if payload and (payload.system_meta['confidence'] < 0.65 or
                        payload.target_workflow == 'WEB_FALLBACK'):
            self._proactive_lexicon_lift(query, engine)

        if payload:
            self._handle_proactive(payload)

        # [Ω] Proactive Forge Suggestion
        if not payload or payload.system_meta['confidence'] < 0.5:
            self._suggest_forge(query)

    def _suggest_forge(self, query: str) -> None:
        """Suggests running SkillForge if no good match is found."""
        if len(query.split()) < 2:
            return

        msg = f"Raven's Insight: No existing skill matches '{query}'. Shall I forge a new one?"
        SovereignHUD.persona_log("INFO", msg)
        # For simplicity in this engine class, we just log the suggestion
        cmd_msg = f"To create this skill, run: cstar skill-forge -q \"{query}\""
        SovereignHUD.persona_log("INFO", cmd_msg)

    def teardown(self) -> None:
        """[V4] Explicitly unregisters observers and clears module-level singletons."""
        SovereignHUD.persona_log("INFO", "SovereignEngine: Initiating deep teardown...")

        # [Ω] The Eternal Loop: Compile session traces and apply corrections
        try:
            compile_traces(
                tdir=str(self.base_path / "traces"),
                rpath=str(self.base_path / "TRACE_REPORT.qmd")
            )
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Learning loop disrupted: {e}")

        if self.engine:
            self.engine.clear_active_ram()

        # Unregister observers
        SovereignHUD._INITIALIZED = False

        # [ALFRED] Break cyclic references
        self.strategy = None
        self.engine = None

        import gc
        gc.collect()  # Trigger immediate Generation 2 sweep
        SovereignHUD.persona_log("SUCCESS", "SovereignEngine: Memory boundaries secured.")

    def json_mode(self, query: str, top: dict[str, Any]) -> None:
        """Outputs search results in JSON format."""
        print(json.dumps({"query": query, "top_match": top}, indent=2))

    def search(self, query: str) -> list[dict[str, Any]]:
        """Proxy for the underlying vector engine search."""
        return self.engine.search(query)

    def _proactive_lexicon_lift(self, query: str, engine: SovereignVector) -> None:
        """
        Identify unknown terms and trigger a web search to expand the session lexicon.
        Injects definitions into the active Cortex session.
        """
        # 1. Identify words not in vocab (Support underscores for technical terms)
        words = re.findall(r'\b[a-zA-Z_]{4,}\b', query.lower())
        unknown_terms = [w for w in words if w not in engine.vocab and w not in engine.stopwords]

        if not unknown_terms:
            return

        term = unknown_terms[0]
        SovereignHUD.persona_log("INFO", f"Raven's Eye: Unknown term '{term}'. Seeking definition.")

        # 2. Trigger Search (Prioritize Gemini CLI)
        gemini = GeminiSearch()
        if gemini.is_available():
            searcher = gemini
        else:
            searcher = BraveSearch()
            
        results = searcher.search(f"Technical definition and synonyms for {term}")

        if not results:
            return

        # 3. Synthesize definition (take first valid snippet)
        definition = results[0].get('description', '')
        if not definition:
            return

        SovereignHUD.persona_log("INFO", f"Raven's Eye: Ingesting intelligence for '{term}'.")

        # 4. Inject into Engine (Session-local memory)
        self.engine.add_skill(f"LEXICON:{term}", definition, domain="GENERAL")

        # [Ω] Persistent Learning: Update thesaurus.qmd with the new knowledge
        try:
            t_path = self.project_root / "src" / "data" / "thesaurus.qmd"
            if t_path.exists():
                content = t_path.read_text(encoding='utf-8')
                if f"**{term}**" not in content:
                    # Append new cluster
                    new_entry = f"\n- **{term}**: {term}, {definition[:50].replace(',', ' ')}"
                    t_path.write_text(content + new_entry, encoding='utf-8')
                    SovereignHUD.persona_log("SUCCESS", f"Lexicon Expanded: '{term}' added.")
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Thesaurus update failed: {e}")


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
        SovereignHUD.box_top("DIAGNOSTIC")
        SovereignHUD.box_row("ENGINE", "SovereignVector 2.5 (Iron)", SovereignHUD.CYAN)
        SovereignHUD.box_row("PERSONA", SovereignHUD.PERSONA, SovereignHUD.MAGENTA)
        SovereignHUD.box_separator()
        SovereignHUD.box_row("SKILLS", f"{len(ve.skills)}", SovereignHUD.GREEN)
        SovereignHUD.box_row("TOKENS", f"{len(ve.vocab)}", SovereignHUD.YELLOW)
        SovereignHUD.box_row("VECTORS", f"{len(ve.vectors)}", SovereignHUD.CYAN)
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
