import argparse
import glob
import json
import math
import os
import sys
from pathlib import Path
from collections import defaultdict
from typing import Any

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.core.engine.vector import SovereignVector
from src.core.sovereign_hud import SovereignHUD

class TraceRenderer:
    """
    [ALFRED] Decoupled renderer that enforces a specific theme for neural replay.
    Ensures ODIN can view ALFRED'S traces in their native Cyan without persona leakage.
    """
    def __init__(self, target_persona: str) -> None:
        self.target_persona = target_persona
        self.original_persona = SovereignHUD.PERSONA
        SovereignHUD.PERSONA = target_persona
        self.theme = SovereignHUD.get_theme()
        SovereignHUD.PERSONA = self.original_persona # Restore

    def box_top(self, title: str) -> None:
        SovereignHUD.PERSONA = self.target_persona
        SovereignHUD.box_top(title)

    def box_row(self, label: str, value: Any, value_color: str | None = None, dim_label: bool = False) -> None:
        SovereignHUD.PERSONA = self.target_persona
        SovereignHUD.box_row(label, value, value_color, dim_label)

    def box_separator(self) -> None:
        SovereignHUD.PERSONA = self.target_persona
        SovereignHUD.box_separator()

    def box_bottom(self) -> None:
        SovereignHUD.PERSONA = self.target_persona
        SovereignHUD.box_bottom()
        SovereignHUD.PERSONA = self.original_persona

    def render_neural_path(self, traces: list[dict]) -> None:
        """[ALFRED] Render a chronological flowchart of triggered intents."""
        self.box_top("NEURAL PATH (THE CAUSAL CHAIN)")

        path = []
        for t in traces:
            trigger = t.get("trigger", "UNKNOWN")
            if not path or path[-1] != trigger:
                path.append(trigger)

        if not path:
            self.box_row("PATH", "Empty Signal", SovereignHUD.YELLOW)
        else:
            for i, step in enumerate(path):
                arrow = "  ▼  " if i < len(path)-1 else "  🏁  "
                self.box_row(f"STEP {i+1:02}", step, SovereignHUD.CYAN)
                if i < len(path)-1:
                    SovereignHUD.PERSONA = self.target_persona
                    inner_width = getattr(SovereignHUD, "_last_width", 60)
                    pad = " " * (inner_width - 2 - 20 - 5 - 1)
                    print(f"{SovereignHUD.DIM}│{SovereignHUD.RESET} {' '*20} {SovereignHUD.DIM}{arrow}{SovereignHUD.RESET}{pad}{SovereignHUD.DIM}│{SovereignHUD.RESET}")

        self.box_bottom()

    def render_analysis(self, query: str, trigger: str, score: float, is_global: bool, engine_instance=None) -> None:
        SovereignHUD.PERSONA = self.target_persona
        theme = SovereignHUD.get_theme()

        print("\n")
        if self.target_persona in ["ODIN", "GOD"]:
             print(f"{theme['dim']}>> INITIATING WAR PROTOCOL...{SovereignHUD.RESET}")
        else:
             print(f"{theme['dim']}>> DECRYPTING LOG...{SovereignHUD.RESET}")

        self.box_top(theme["war_title"])
        self.box_row("Query", query, dim_label=True)

        match_color = SovereignHUD.GREEN if score > 0.8 else SovereignHUD.YELLOW
        if self.target_persona in ["ODIN", "GOD"]:
             match_color = SovereignHUD.RED if score > 0.8 else SovereignHUD.YELLOW

        global_tag = f"{SovereignHUD.MAGENTA}[GLOBAL]{SovereignHUD.RESET} " if is_global else ""
        self.box_row(theme["trace_label"], f"{global_tag}{trigger}", match_color, dim_label=True)
        self.box_row("Confidence", f"{score:.4f}", match_color, dim_label=True)

        self.box_separator()

        if engine_instance:
            q_tokens = engine_instance.expand_query(query)
            skill_text = engine_instance.skills.get(trigger, "")
            s_tokens = engine_instance.tokenize(skill_text)

            overlaps = []
            for qt, qw in q_tokens.items():
                if qt in s_tokens:
                    count = s_tokens.count(qt)
                    idf = engine_instance.idf.get(qt, 0)
                    overlaps.append((qt, qw, count, idf))
            overlaps.sort(key=lambda x: x[3], reverse=True)

            print(f"{theme['dim']}│{SovereignHUD.RESET} {theme['main']}{'TOKEN':<15} {'WEIGHT':<10} {'IDF':<10} {'SIGNAL'}{SovereignHUD.RESET}")

            for token, weight, count, idf in overlaps[:5]:
                signal_strength = weight * idf * math.log(1 + count)
                print(f"{theme['dim']}│{SovereignHUD.RESET} {token:<15} {weight:<10.2f} {idf:<10.2f} {theme['main']}{'█' * int(signal_strength * 2)}{SovereignHUD.RESET}")
        else:
            self.box_row("Status", "Offline (No Engine)", SovereignHUD.YELLOW)

        self.box_bottom()
        print("\n")


class TraceVisualizer:
    """[O.D.I.N.] Orchestration logic for neural trace visualization."""

    @staticmethod
    def load_json(path: str, max_size_mb: int = 10) -> dict:
        """[ALFRED] Secure JSON loader with size-gating for trace artifacts."""
        if not os.path.exists(path): return {}
        try:
            file_size = os.path.getsize(path)
            if file_size > max_size_mb * 1024 * 1024:
                SovereignHUD.log("WARN", "Trace Integrity", f"Artifact too large: {os.path.basename(path)}")
                return {}
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError, PermissionError) as e:
            SovereignHUD.log("FAIL", "Replay Error", f"{os.path.basename(path)} ({e!s})")
            return {}

    @staticmethod
    def get_engine():
        base_path = PROJECT_ROOT / ".agents"
        config = TraceVisualizer.load_json(str(base_path / "config.json"))

        def _res(fname):
            qmd = PROJECT_ROOT / fname.replace('.md', '.qmd')
            md = PROJECT_ROOT / fname
            return str(qmd if qmd.exists() else md)

        engine = SovereignVector(
            thesaurus_path=_res("thesaurus.qmd"),
            corrections_path=str(base_path / "corrections.json"),
            stopwords_path=str(base_path / "scripts" / "stopwords.json")
        )

        if hasattr(engine, 'load_core_skills'):
            engine.load_core_skills()
        engine.load_skills_from_dir(str(base_path / "skills"))

        framework_root = config.get("FrameworkRoot")
        if framework_root:
            global_path = Path(framework_root) / "skills_db"
            if global_path.exists():
                engine.load_skills_from_dir(str(global_path), prefix="GLOBAL:")

        engine.build_index()
        return engine

    @staticmethod
    def mode_live(query: str) -> None:
        engine = TraceVisualizer.get_engine()
        results = engine.search(query)
        top_match = results[0] if results else None
        renderer = TraceRenderer(SovereignHUD.PERSONA)
        renderer.render_analysis(
            query,
            top_match['trigger'] if top_match else "NONE",
            top_match['score'] if top_match else 0.0,
            top_match.get('is_global', False),
            engine
        )

    @staticmethod
    def mode_file(file_path: str) -> None:
        data = TraceVisualizer.load_json(file_path)
        if not data: return
        stored_persona = data.get("persona", "ALFRED").upper()
        renderer = TraceRenderer(stored_persona)
        engine = TraceVisualizer.get_engine()
        renderer.render_analysis(
            data.get("query"),
            data.get("match", "UNKNOWN"),
            data.get("score", 0.0),
            data.get("is_global", False),
            engine
        )

    @staticmethod
    def mode_war_room() -> None:
        renderer = TraceRenderer("ODIN")
        SovereignHUD.PERSONA = "ODIN"
        theme = SovereignHUD.get_theme()

        print("\n")
        renderer.box_top("⚔️  THE WAR ROOM  ⚔️")

        base_path = PROJECT_ROOT / ".agents"
        traces_dir = base_path / "traces"
        trace_files = list(traces_dir.glob("*.json"))

        query_map = defaultdict(list)
        for tf in trace_files:
            t_data = TraceVisualizer.load_json(str(tf))
            q = t_data.get("query")
            if q:
                t_data['_filename'] = tf.name
                query_map[q].append(t_data)

        conflicts = []
        print(f"{theme['dim']}>> SCANNING {len(trace_files)} SECTORS...{SovereignHUD.RESET}")

        for query, traces in query_map.items():
            matches = set()
            personas_involved = set()
            for t in traces:
                matches.add(t.get("match"))
                personas_involved.add(t.get("persona", "ALFRED"))

            if len(matches) > 1 and len(personas_involved) > 1:
                conflicts.append({
                    "query": query,
                    "factions": list(personas_involved),
                    "outcomes": list(matches)
                })

        if not conflicts:
            renderer.box_row("STATUS", "PACIFIED", SovereignHUD.GREEN)
        else:
            renderer.box_row("STATUS", f"{len(conflicts)} ACTIVE CONFLICTS", SovereignHUD.RED)
            renderer.box_separator()
            print(f"{theme['dim']}│{SovereignHUD.RESET} {theme['main']}{'QUERY':<25} {'FACTIONS':<20} {'CONFLICTING OUTCOMES'}{SovereignHUD.RESET}")
            for c in conflicts:
                q_short = (c['query'][:22] + '..') if len(c['query']) > 22 else c['query']
                f_str = ",".join(c['factions'])
                o_str = " vs ".join([str(o) for o in c['outcomes']])
                print(f"{theme['dim']}│{SovereignHUD.RESET} {q_short:<25} {f_str:<20} {o_str}")

        renderer.box_bottom()
        print("\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Neural Trace Visualizer & War Room")
    parser.add_argument("query", nargs="?", help="The natural language query to visualize")
    parser.add_argument("--file", "-f", help="Path to a JSON trace file to replay")
    parser.add_argument("--war-room", "-w", action="store_true", help="Enter Conflict Analysis Mode")

    args = parser.parse_args()
    if args.war_room: TraceVisualizer.mode_war_room()
    elif args.file: TraceVisualizer.mode_file(args.file)
    elif args.query: TraceVisualizer.mode_live(args.query)
    else: parser.print_help()
