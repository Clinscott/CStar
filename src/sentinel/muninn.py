"""
Muninn: The Raven of Memory & Excellence (Autonomous Improver)
Identity: ODIN/ALFRED Hybrid
Purpose: Execute the Ravens Protocol autonomously via Antigravity Uplink.
"""

import asyncio
import json
import logging
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

# [Ω] BOOTSTRAP: Add project root to sys.path
import sys
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.metrics import ProjectMetricsEngine
from src.core.sovereign_hud import SovereignHUD
from src.core.telemetry import SubspaceTelemetry
from src.cstar.core.uplink import AntigravityUplink
from src.sentinel.code_sanitizer import sanitize_code, sanitize_test
from src.sentinel.stability import TheWatcher
from src.sentinel.wardens.base import BaseWarden
from src.sentinel.wardens.norn import NornWarden
from src.sentinel.coordinator import MissionCoordinator
from tests.integration.project_fishtest import GungnirSPRT

class Muninn:
    """
    [Ω] Muninn upgraded to Linscott Standard v3.
    Direct API dependencies removed. All intelligence via Uplink.
    """
    def __init__(self, target_path: str = None, use_docker: bool = False):
        self.root = Path(target_path or Path.cwd()).resolve()
        self.use_docker = use_docker
        
        # All intelligence redirected through the Antigravity Uplink
        if os.getenv("MOCK_MODE") == "true":
            from tests.harness.raven_proxy import RavenProxy
            SovereignHUD.persona_log("INFO", "[SHADOW] Engaging Local Mock (RavenProxy)")
            self.uplink = RavenProxy(mock_mode=True)
        else:
            self.uplink = AntigravityUplink()
        
        self.watcher = TheWatcher(self.root)
        self.coordinator = MissionCoordinator(self.root)
        self.metrics_engine = ProjectMetricsEngine()
        self.sprt = GungnirSPRT()
        self.pid_file = self.root / ".agent" / "muninn.pid"

    def _is_repo_silent(self) -> bool:
        """Wait for 5 minutes of silence."""
        return (time.time() - self.watcher.get_last_edit_time()) >= 300

    def _wait_for_silence(self) -> None:
        SovereignHUD.persona_log("INFO", "Muninn is observing the matrix, waiting for silence...")
        while not self._is_repo_silent():
            if self.pid_file.exists(): self.pid_file.touch()
            time.sleep(30)
        SovereignHUD.persona_log("SUCCESS", "Repository is silent. Muninn takes flight.")

    async def run_cycle(self) -> bool:
        """Executes a single autonomous repair cycle."""
        self.pid_file.parent.mkdir(parents=True, exist_ok=True)
        self.pid_file.write_text(str(os.getpid()))
        
        try:
            # 0. Targeted Task Injection (Bypass Hunt/Silence)
            targeted_task = os.getenv("SHADOW_FORGE_TASK")
            if targeted_task:
                try:
                    task_data = json.loads(targeted_task)
                    SovereignHUD.persona_log("INFO", f"[TARGET] Executing injected task: {task_data['action']}")
                    pre_gphs = self.metrics_engine.compute(str(self.root))
                    return await self._execute_mission(task_data, pre_gphs)
                except Exception as e:
                    SovereignHUD.persona_log("ERROR", f"Targeted task failed: {e}")
                    return False

            self._wait_for_silence()
            pre_gphs = self.metrics_engine.compute(str(self.root))
            
            # 1. HUNT (Parallel Scans)
            all_breaches, _ = await self._execute_hunt_async()
            
            # 2. SELECT (Ledger Synchronized)
            target = self.coordinator.select_mission(all_breaches)
            if not target:
                SovereignHUD.persona_log("SUCCESS", "Matrix is stable. No targets identified.")
                return False

            # [Ω] Start Neural Trace
            SubspaceTelemetry.log_trace(
                mission_id=target.get("mission_id", "manual"),
                file_path=target["file"],
                target_metric=target.get("target_metric", "OVERALL"),
                initial_score=target.get("initial_score", 0.0),
                justification=target["action"],
                status="FORGING"
            )

            # 3. FORGE & CRUCIBLE
            return await self._execute_mission(target, pre_gphs)
        finally:
            if self.pid_file.exists(): self.pid_file.unlink()

    async def _execute_mission(self, target: dict, pre_gphs: float) -> bool:
        if self.watcher.is_locked(target["file"]):
            SovereignHUD.persona_log("WARN", f"Target {target['file']} is LOCKED.")
            return False

        SovereignHUD.persona_log("INFO", f"Forging: {target['file']} -> {target['action']}")
        
        if not await self._forge_improvement(target):
            return False

        if self._verify_fix(target):
            return self._finalize_success(target, pre_gphs)
        else:
            return self._handle_failure(target)

    async def _forge_improvement(self, target: dict) -> bool:
        file_path = self.root / target["file"]
        original = file_path.read_text(encoding="utf-8") if file_path.exists() else ""
        
        SovereignHUD.persona_log("INFO", f"Step 1/3: Generating Gauntlet (Reproduction Test)...")
        test_path = await self._generate_gauntlet(target, original)
        if not test_path: 
            SovereignHUD.persona_log("ERROR", "Gauntlet generation failed.")
            return False
        
        SovereignHUD.persona_log("INFO", f"Step 2/3: Forging Steel (Code Fix)...")
        new_content = await self._generate_steel(target, original, test_path)
        if not new_content: 
            SovereignHUD.persona_log("ERROR", "Steel forging failed.")
            return False
        
        SovereignHUD.persona_log("INFO", f"Step 3/3: Applying Fix and Recording Edit...")
        if file_path.exists(): shutil.copy(file_path, str(file_path) + ".bak")
        file_path.write_text(new_content, encoding="utf-8")
        return self.watcher.record_edit(target["file"], new_content)

    async def _generate_gauntlet(self, target: dict, code: str) -> Path | None:
        prompt = f"Create a pytest reproduction for: {target['action']} in {target['file']}\nContext:\n{code}"
        SovereignHUD.persona_log("INFO", "Contacting the High Seat for Gauntlet blueprints...")
        res = await self.uplink.send_payload(prompt, {"persona": "ALFRED"})
        if res.get("status") != "success": return None
        
        raw_code = res["data"].get("code") or res["data"].get("raw", "")
        clean_test = sanitize_test(raw_code, target["file"], self.root)
        test_file = self.root / "tests" / "gauntlet" / f"test_{int(time.time())}.py"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text(clean_test, encoding="utf-8")
        SovereignHUD.persona_log("SUCCESS", f"Gauntlet forged at {test_file.name}")
        return test_file

    async def _generate_steel(self, target: dict, code: str, test_path: Path) -> str | None:
        test_code = test_path.read_text(encoding="utf-8")
        prompt = f"Fix issue: {target['action']}\nFile: {target['file']}\nCode:\n{code}\nReproduction Test:\n{test_code}"
        SovereignHUD.persona_log("INFO", "Consulting Mimir for the Steel formula...")
        res = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
        if res.get("status") != "success": return None
        raw_code = res["data"].get("code") or res["data"].get("raw", "")
        SovereignHUD.persona_log("SUCCESS", "Steel formula received.")
        return sanitize_code(raw_code)

    def _verify_fix(self, target: dict) -> bool:
        SovereignHUD.persona_log("INFO", "Entering the Crucible for verification...")
        cmd = [sys.executable, "-m", "pytest", str(self.root / "tests" / "gauntlet"), "-v"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode == 0:
            SovereignHUD.persona_log("SUCCESS", "The Crucible is satisfied. Fix verified.")
        else:
            SovereignHUD.persona_log("ERROR", f"Crucible Failure:\n{result.stdout}\n{result.stderr}")
        return result.returncode == 0

    def _finalize_success(self, target: dict, pre_gphs: float) -> bool:
        post_gphs = self.metrics_engine.compute(str(self.root))
        delta = post_gphs - pre_gphs
        SovereignHUD.persona_log("PASS", f"GPHS DELTA SECURED: {delta:+.4f}")
        
        # [Ω] Success Trace
        SubspaceTelemetry.log_trace(
            mission_id=target.get("mission_id", "manual"),
            file_path=target["file"],
            target_metric=target.get("target_metric", "OVERALL"),
            initial_score=target.get("initial_score", 0.0),
            final_score=post_gphs,
            justification=f"Refactoring successful. GPHS Improvement: {delta:+.4f}",
            status="SUCCESS"
        )

        if target.get("type") == "CAMPAIGN_TASK":
            NornWarden(self.root).mark_complete(target)
        return True

    def _handle_failure(self, target: dict) -> bool:
        fail_count = self.watcher.record_failure(target["file"])
        status = "FAILED"
        if fail_count >= 3:
            SovereignHUD.persona_log("CRITICAL", f"FILE BLOCKED: {target['file']}. ODIN intervention required.")
            self._flag_blocked(target["file"])
            status = "BLOCKED"
        
        # [Ω] Failure Trace
        SubspaceTelemetry.log_trace(
            mission_id=target.get("mission_id", "manual"),
            file_path=target["file"],
            target_metric=target.get("target_metric", "OVERALL"),
            initial_score=target.get("initial_score", 0.0),
            justification=f"Crucible verification failed. Attempt {fail_count}/3.",
            status=status
        )

        self._rollback(target)
        return False

    def _rollback(self, target: dict) -> None:
        """Restores the file from .bak if it exists."""
        file_path = self.root / target["file"]
        bak_path = Path(str(file_path) + ".bak")
        if bak_path.exists():
            SovereignHUD.persona_log("INFO", f"Rolling back {target['file']}...")
            shutil.copy(bak_path, file_path)
            bak_path.unlink()

    def _flag_blocked(self, filepath: str) -> None:
        ledger_path = self.root / ".agent" / "tech_debt_ledger.json"
        if not ledger_path.exists(): return
        try:
            data = json.loads(ledger_path.read_text(encoding="utf-8"))
            for t in data.get("top_targets", []):
                if t["file"] == filepath: t["status"] = "BLOCKED_STUCK"
            ledger_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception: pass

    async def _execute_hunt_async(self) -> tuple[list[dict[str, Any]], dict[str, int]]:
        import importlib
        import inspect
        all_breaches, scan_results, discovered_wardens = [], {}, {}
        warden_dir = Path(__file__).parent / "wardens"
        for warden_file in warden_dir.glob("*.py"):
            if warden_file.name in ("__init__.py", "base.py"): continue
            try:
                module = importlib.import_module(f"src.sentinel.wardens.{warden_file.stem}")
                for _name, obj in inspect.getmembers(module):
                    if inspect.isclass(obj) and issubclass(obj, BaseWarden) and obj is not BaseWarden:
                        discovered_wardens[warden_file.stem.upper()] = obj(self.root)
                        break
            except Exception: pass
        tasks, names = [], []
        for name, w in discovered_wardens.items():
            tasks.append(asyncio.to_thread(w.scan))
            names.append(name)
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for name, res in zip(names, results, strict=False):
                if isinstance(res, list):
                    scan_results[name] = len(res)
                    for breach in res:
                        if "file" in breach: SubspaceTelemetry.flare(breach["file"], f"MUNINN:{name}", f"BREACH:{breach.get('type','UNKNOWN')}")
                    all_breaches.extend(res)
                else: scan_results[name] = 0
        return all_breaches, scan_results

if __name__ == "__main__":
    import sys
    m = Muninn()
    asyncio.run(m.run_cycle())
