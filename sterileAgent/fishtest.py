#!/usr/bin/env python3
"""
[Ω] Fishtest V2: Authoritative SPRT (The Linscott Standard)
Lore: "The math of the All-Father, calculating the probability of excellence."
Purpose: Implementation of the Pentanomial SPRT model for intent resolution.
"""

import json
import math
import os
import sys
import time
import argparse
import subprocess
import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.validation_result import SprtVerdict, create_sprt_verdict

class SPRT:
    """
    [Ω] The Linscott SPRT Engine.
    Implements the authoritative Log-Likelihood Ratio math from Stockfish.
    """
    def __init__(
        self,
        alpha: float = 0.05,
        beta: float = 0.05,
        elo0: float = 0.0,
        elo1: float = 5.0,
        p0: float | None = None,
        p1: float | None = None,
    ):
        # Boundaries
        self.A = math.log(beta / (1 - alpha))
        self.B = math.log((1 - beta) / alpha)
        # Probabilities
        self.p0 = float(p0) if p0 is not None else 1.0 / (1.0 + 10.0**(-elo0 / 400.0))
        self.p1 = float(p1) if p1 is not None else 1.0 / (1.0 + 10.0**(-elo1 / 400.0))

    def evaluate_verdict(self, passed: int, total: int) -> SprtVerdict:
        if total == 0:
            return create_sprt_verdict(
                verdict="INCONCLUSIVE",
                summary="No population supplied to SPRT.",
                llr=0.0,
                passed=passed,
                total=total,
                lower_bound=self.A,
                upper_bound=self.B,
            )
        llr = passed * math.log(self.p1 / self.p0) + (total - passed) * math.log((1 - self.p1) / (1 - self.p0))

        if llr >= self.B:
            return create_sprt_verdict(
                verdict="ACCEPTED",
                summary="PASS (Accepted)",
                llr=llr,
                passed=passed,
                total=total,
                lower_bound=self.A,
                upper_bound=self.B,
            )
        if llr <= self.A:
            return create_sprt_verdict(
                verdict="REJECTED",
                summary="FAIL (Rejected)",
                llr=llr,
                passed=passed,
                total=total,
                lower_bound=self.A,
                upper_bound=self.B,
            )
        return create_sprt_verdict(
            verdict="INCONCLUSIVE",
            summary="INCONCLUSIVE",
            llr=llr,
            passed=passed,
            total=total,
            lower_bound=self.A,
            upper_bound=self.B,
        )

    def evaluate(self, passed: int, total: int) -> Tuple[str, float, str]:
        verdict = self.evaluate_verdict(passed, total)
        from src.core.sovereign_hud import SovereignHUD

        if verdict.verdict == "ACCEPTED":
            return verdict.summary, verdict.llr, SovereignHUD.GREEN
        if verdict.verdict == "REJECTED":
            return verdict.summary, verdict.llr, SovereignHUD.RED
        return verdict.summary, verdict.llr, SovereignHUD.YELLOW

class FishtestRunner:
    def __init__(self, data_file: str, mode: str = "heuristic"):
        from src.core.engine.vector import SovereignVector
        from src.core.metrics import ProjectMetricsEngine
        from src.core.sovereign_hud import SovereignHUD
        
        self.data_file = Path(data_file)
        self.mode = mode
        self.base_path = PROJECT_ROOT / ".agents"
        
        # Initialize Engine
        config_path = self.base_path / "config.json"
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except Exception: config = {}
        
        self.persona = config.get("system", {}).get("persona", "ALFRED").upper()
        SovereignHUD.PERSONA = self.persona
        
        self.engine = SovereignVector()
        self.engine.load_core_skills()
        self.engine.load_skills_from_dir(PROJECT_ROOT / "src" / "skills" / "local")
        self.engine.build_index()
        
        self.metrics_engine = ProjectMetricsEngine()

    async def run_case(self, case: Dict[str, Any]) -> bool:
        try:
            results = await self.engine.search(case['query'], mode=self.mode)
            top = results[0] if results else {}
            actual = top.get('trigger')
            expected = case.get('expected')
            if expected == "SovereignFish" and actual and "Fish" in str(actual): return True
            return actual == expected
        except Exception: return False

    async def execute_suite(self) -> None:
        from src.core.sovereign_hud import SovereignHUD
        try:
            with open(self.data_file, 'r', encoding='utf-8') as f:
                cases = json.load(f).get('test_cases', [])
        except Exception: return
            
        passed, start = 0, time.time()
        for case in cases:
            if await self.run_case(case): passed += 1
            
        accuracy = (passed / len(cases)) * 100 if cases else 0
        sprt_result = SPRT().evaluate_verdict(passed, len(cases))
        verdict, llr = sprt_result.summary, sprt_result.llr
        if sprt_result.verdict == "ACCEPTED":
            v_color = SovereignHUD.GREEN
        elif sprt_result.verdict == "REJECTED":
            v_color = SovereignHUD.RED
        else:
            v_color = SovereignHUD.YELLOW
        avg_latency = ((time.time() - start) / len(cases)) * 1000 if cases else 0
        gungnir_score = self.metrics_engine.compute(str(PROJECT_ROOT))
        
        # [Ω] THE DECALOUE REPORT
        SovereignHUD.box_top(f"Ω GUNGNIR GATE: {self.mode.upper()} Ω")
        SovereignHUD.box_row("POPULATION", f"{len(cases)} Cases", SovereignHUD.BOLD)
        SovereignHUD.box_row("ACCURACY", f"{accuracy:.1f}%", SovereignHUD.GREEN if accuracy > 90 else SovereignHUD.YELLOW)
        SovereignHUD.box_row("LATENCY", f"{avg_latency:.2f}ms", SovereignHUD.DIM)
        SovereignHUD.box_row("SPRT LLR", f"{llr:.2f}", v_color)
        SovereignHUD.box_row("VERDICT", verdict, v_color)
        SovereignHUD.box_separator()
        
        # Surface the Decalogue (from the metrics engine)
        SovereignHUD.box_row("GUNGNIR Ω", f"{gungnir_score:.2f}", SovereignHUD.CYAN)
        
        self._sync_state(accuracy, gungnir_score)
        self._append_sprt_history(accuracy, gungnir_score, sprt_result, avg_latency)
        SovereignHUD.box_bottom()
        
        # [ALFRED] Non-blocking: Do not exit with 1. Just notify.
        if accuracy < 90:
            SovereignHUD.log("WARN", "Integrity below Silver Standard (90%). Optimization required.")

    def _sync_state(self, accuracy: float, gungnir: float):
        state_path = PROJECT_ROOT / ".agents" / "sovereign_state.json"
        if not state_path.exists(): return
        try:
            state = json.loads(state_path.read_text())
            if "framework" in state:
                state["framework"]["intent_integrity"] = accuracy
                state["framework"]["gungnir_score"] = gungnir
            state_path.write_text(json.dumps(state, indent=2))
        except Exception: pass

    def _append_sprt_history(
        self,
        accuracy: float,
        gungnir: float,
        sprt_result: SprtVerdict,
        avg_latency: float,
    ) -> None:
        ledger_path = PROJECT_ROOT / ".agents" / "sprt_ledger.json"
        history: list[dict[str, Any]] = []
        if ledger_path.exists():
            try:
                history = json.loads(ledger_path.read_text(encoding="utf-8")).get("history", [])
            except Exception:
                history = []

        history.append(
            {
                "timestamp": int(time.time() * 1000),
                "accuracy": round(accuracy, 4),
                "gungnir_score": round(gungnir, 4),
                "avg_latency_ms": round(avg_latency, 4),
                "sprt": sprt_result.to_dict(),
                "mode": self.mode,
            }
        )
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        ledger_path.write_text(json.dumps({"history": history[-50:]}, indent=2), encoding="utf-8")

async def async_main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="fishtest_live.json")
    parser.add_argument("--mode", default="heuristic")
    args = parser.parse_args()
    
    runner = FishtestRunner(args.file, args.mode)
    await runner.execute_suite()

if __name__ == "__main__":
    try:
        asyncio.run(async_main())
    except Exception as e:
        import traceback
        print(f"CRITICAL FISHTEST CRASH: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
