"""
[SPOKE] Sovereign Context
Lore: "The Memory of the All-Father."
Purpose: Manage engine configuration, persona state, feedback context, and teardown cycles.
"""

import json
import os
import gc
from pathlib import Path
from src.core import personas, utils
from src.core.sovereign_hud import SovereignHUD
from src.tools.compile_session_traces import TraceCompiler

class SovereignContext:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.base_path = self.project_root / ".agent"
        self.config = utils.load_config(str(self.project_root))
        
        # Persona Initialization
        legacy_persona = self.config.get("persona") or self.config.get("Persona") or "ALFRED"
        persona_val = str(self.config.get("system", {}).get("persona", legacy_persona))
        SovereignHUD.PERSONA = persona_val.upper()
        SovereignHUD._INITIALIZED = True
        self.strategy = personas.get_strategy(SovereignHUD.PERSONA, str(self.project_root))
        
        self.poor_files = self._load_feedback_context()
        self.THRESHOLDS = self.config.get("thresholds", {"ACCURACY": 0.85, "REC": 0.70})

    def _load_feedback_context(self) -> list[str]:
        """Loads poor performance flags from feedback.jsonl."""
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

    def teardown(self, engine_instance=None) -> None:
        """[V4] Explicitly unregisters observers and clears resources."""
        SovereignHUD.persona_log("INFO", "SovereignEngine: Initiating deep teardown...")

        try:
            TraceCompiler.execute(
                tdir=str(self.base_path / "traces"),
                rpath=str(self.base_path / "TRACE_REPORT.qmd")
            )
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Learning loop disrupted: {e}")

        if engine_instance and hasattr(engine_instance, 'clear_active_ram'):
            engine_instance.clear_active_ram()

        SovereignHUD._INITIALIZED = False
        self.strategy = None
        gc.collect()
        SovereignHUD.persona_log("SUCCESS", "SovereignEngine: Memory boundaries secured.")
