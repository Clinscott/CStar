"""
[SPOKE] Sovereign Reporter
Lore: "The Quill of Alfred."
Purpose: Decouple HUD rendering and neural trace recording from the engine core.
"""

import json
import re
from pathlib import Path
from src.core.sovereign_hud import SovereignHUD

class SovereignReporter:
    def __init__(self, base_path: Path, thresholds: dict):
        self.base_path = base_path
        self.thresholds = thresholds

    def render_hud(self, payload, query: str, engine_instance=None) -> None:
        """Renders the semantic result to the HUD."""
        if not payload:
            SovereignHUD.persona_log("WARN", f"Dissonance detected: '{query}' remains elusive.")
            if engine_instance:
                results = engine_instance.search(query)
                if not results:
                    SovereignHUD.persona_log("INFO", "The Well of Mimir is silent.")
                else:
                    for r in results[:3]:
                        is_good = r['score'] > self.thresholds["REC"]
                        color = SovereignHUD.GREEN if is_good else SovereignHUD.YELLOW
                        SovereignHUD.box_row("SOURCE", r.get('trigger', 'unknown'),
                                             SovereignHUD.MAGENTA, dim_label=True)
                        SovereignHUD.box_row("RELEVANCE", f"{r['score']:.2f}", color, dim_label=True)
                        SovereignHUD.box_separator()
            return

        SovereignHUD.box_top("GUNGNIR IMPACT")
        SovereignHUD.box_row("Intent", query, SovereignHUD.CYAN)

        confidence = payload.system_meta['confidence']
        is_acc = confidence > self.thresholds["ACCURACY"]
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

    def record_trace(self, payload) -> None:
        """Persists the neural trace for later analysis."""
        tdir = self.base_path / "traces"
        tdir.mkdir(exist_ok=True)
        conf = payload.system_meta['confidence']
        tid = re.sub(r'\W+', '_', payload.intent_raw[:20]) + f"_{conf:.2f}"
        trace_file = tdir / f"{tid}.json"

        with trace_file.open("w", encoding="utf-8") as f:
            json.dump(payload.to_dict(), f, indent=2)
