import ast
import asyncio
import contextlib
import gc
import json
import os
import re
import shutil
import sys
import time
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.core.engine.atomic_gpt import AnomalyWarden, WardenCircuitBreaker
from src.core.engine.gungnir.universal import UniversalGungnir
from src.core.payload import IntentPayload
from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.sprt import evaluate_candidate
from src.cstar.core.uplink import AntigravityUplink
from src.sentinel._bootstrap import bootstrap
from src.tools.brave_search import BraveSearch

# Initialize Environment
bootstrap()


class Forge:
    """
    The Autonomous Forge (Daemon-Hosted).
    V5: Thread-Safe TDD Engine using Gungnir SPRT Calculus.
    """

    def __init__(self) -> None:
        # 1. Pull the heavy-workload Daemon Key
        daemon_key = os.getenv("GOOGLE_API_DAEMON_KEY") or os.getenv("GOOGLE_API_KEY")

        # 2. Inject it into the uplink
        self.uplink = AntigravityUplink(api_key=daemon_key)
        self.max_retries = 3
        self.project_root = project_root
        self.searcher = BraveSearch()

        # 3. Initialize Warden
        try:
            self.warden = AnomalyWarden()
        except Exception:
            self.warden = None

    def __repr__(self) -> str:
        return f"<Forge(root='{self.project_root}', retries={self.max_retries})>"

    async def execute(self, payload: IntentPayload, target_file: str) -> AsyncGenerator[dict, None]:
        """
        Runs the forging loop as an async generator.
        """
        session_id = str(uuid.uuid4())
        session_start_time = time.time()
        task = payload.intent_raw
        context = payload.to_dict()

        target_path = Path(target_file)
        if not target_path.is_absolute():
            target_path = self.project_root / target_path

        try:
            if not target_path.exists():
                msg = f"Target file {target_path.name} does not exist. Creating new."
                yield {"type": "ui", "persona": "ODIN", "msg": msg}
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.touch()

            backup_path = target_path.with_suffix(f".{session_id}.bak")
            shutil.copy(target_path, backup_path)

            context.update({
                "target_file": str(target_path),
                "file_content": target_path.read_text(encoding='utf-8'),
                "session_id": session_id
            })

            yield {"type": "ui", "persona": "ODIN", "msg": f"Forging '{task}' on {target_path.name}..."}

            # Main Forge Loop (ODIN)
            for attempt in range(1, self.max_retries + 1):
                # [CANARY] Pre-attempt sensory pulse
                self._pulse_warden(session_start_time, attempt, 0)

                msg = f"Attempt {attempt}/{self.max_retries}: [SID: {session_id[:8]}] Comming..."
                yield {"type": "ui", "persona": "ODIN", "msg": msg}

                # 1. Generate (Gungnir Calculus)
                response = await self._generate_with_calculus(task, context, target_path.suffix)

                if response.get("status") == "error":
                    msg = f"Uplink severed: {response.get('message')}"
                    yield {"type": "ui", "persona": "ALFRED", "msg": msg}
                    yield {"type": "result", "status": "error", "message": "Uplink Failed"}
                    return

                if "warnings" in response:
                    msg = "Gungnir Calculus detected dissonance. Self-correction applied."
                    yield {"type": "ui", "persona": "ODIN", "msg": msg}

                new_code = response.get("data", {}).get("code")
                if not new_code:
                    yield {"type": "ui", "persona": "ODIN", "msg": "The void returned silence."}
                    context["error"] = "No code received from ODIN."
                    continue

                # 2. Physical Deployment
                target_path.write_text(new_code, encoding='utf-8')

                # 3. Secure Verification (ALFRED)
                yield {"type": "ui", "persona": "ALFRED", "msg": "Commencing Adversarial Verification..."}

                alfred_strikes = 0
                alfred_success = False
                verification_logs = ""

                alfred_context = {
                    "task": task,
                    "target_file": str(target_path),
                    "code": new_code,
                    "session_id": session_id
                }

                # Fixed Gungnir JSON naming in prompt
                gungnir_file = f"gungnir_{session_id}.json"
                system_directive = (
                    "You are ALFRED, an adversarial verification entity. "
                    "Write parameterized unit tests (min 25 fuzzing iterations) to break. "
                    "Detect language and use industry-standard linting/testing. "
                    f"Embed logic to output integer array (0=pass, 1=fail) to '{gungnir_file}'. "
                    "Output ONLY strict JSON: 'lint_command', 'test_command', 'test_filename'."
                )

                while alfred_strikes < 2:
                    msg = f"Constructing constraints (Strike {alfred_strikes}/2)..."
                    yield {"type": "ui", "persona": "ALFRED", "msg": msg}

                    # Uplink to ALFRED
                    alf_query = f"SYSTEM DIRECTIVE: {system_directive}"
                    alfred_resp = await self.uplink.send_payload(alf_query, alfred_context)

                    try:
                        data = alfred_resp.get("data", {})
                        raw_json = data.get("raw")
                        
                        if raw_json:
                            # Extract JSON block if present
                            if "```json" in raw_json:
                                raw_json = raw_json.split("```json")[1].split("```")[0].strip()
                            v_spec = json.loads(raw_json)
                        else:
                            # Fallback: check if fields are directly in data (for tests/mock compatibility)
                            v_spec = data

                        lint_cmd = v_spec.get("lint_command")
                        test_cmd = v_spec.get("test_command")
                        test_file = v_spec.get("test_filename")
                        test_code = v_spec.get("test_code")

                        if not all([lint_cmd, test_cmd, test_file, test_code]):
                            raise ValueError("Incomplete verification spec")

                        # Write verifier to disk
                        v_path = target_path.parent / test_file
                        v_path.write_text(test_code, encoding='utf-8')

                        # 4.1 Lint Gate
                        yield {"type": "ui", "persona": "ALFRED", "msg": f"Linting: {lint_cmd}"}
                        lp = await asyncio.create_subprocess_shell(
                            lint_cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                            cwd=str(self.project_root)
                        )
                        stdout, stderr = await lp.communicate()

                        if lp.returncode != 0:
                            alfred_strikes += 1
                            alfred_context["error"] = f"Linter Error:\n{stderr.decode()[:500]}"
                            yield {"type": "ui", "persona": "ALFRED", "msg": "Lint Gate Breach."}
                            continue

                        # 4.2 Execution Gate (15s Timeout)
                        yield {"type": "ui", "persona": "ALFRED", "msg": f"Executing: {test_cmd}"}
                        try:
                            ep = await asyncio.create_subprocess_shell(
                                test_cmd,
                                stdout=asyncio.subprocess.PIPE,
                                stderr=asyncio.subprocess.PIPE,
                                cwd=str(self.project_root)
                            )
                            t_out, t_err = await asyncio.wait_for(ep.communicate(), timeout=15.0)
                            verification_logs = (t_out.decode() + "\n" + t_err.decode()).strip()
                        except asyncio.TimeoutError:
                            alfred_strikes += 1
                            alfred_context["error"] = "Test Execution Timeout."
                            yield {"type": "ui", "persona": "ALFRED", "msg": "Timeout Breach."}
                            with contextlib.suppress(Exception):
                                ep.kill()
                            continue

                        # 4.3 Calculus Gate (SPRT)
                        g_path = self.project_root / gungnir_file
                        if not g_path.exists():
                            alfred_strikes += 1
                            alfred_context["error"] = "Gungnir artifact missing"
                            yield {"type": "ui", "persona": "ALFRED", "msg": "Missing Artifact."}
                            continue

                        alfred_success = True
                        break

                    except Exception as e:
                        alfred_strikes += 1
                        alfred_context["error"] = str(e)
                        yield {"type": "ui", "persona": "ALFRED", "msg": "Structure Fault."}
                        continue

                if not alfred_success:
                    yield {"type": "ui", "persona": "ODIN", "msg": "ALFRED failed. Rolling back."}
                    shutil.copy(backup_path, target_path)
                    backup_path.unlink()
                    yield {"type": "result", "status": "error", "message": "Infra Failure"}
                    return

                # Adjudicate via SPRT
                g_path = self.project_root / gungnir_file
                decision, llr = evaluate_candidate(str(g_path))
                with contextlib.suppress(Exception):
                    g_path.unlink()

                if decision == "Accept":
                    msg = f"Gungnir Verdict: ACCEPT (LLR: {llr:.2f}). Stable."
                    yield {"type": "ui", "persona": "ODIN", "msg": msg}
                    backup_path.unlink()
                    gc.collect()
                    yield {"type": "result", "status": "success", "message": "Forge Complete"}
                    return
                else:
                    # Logical Failure: Penalize ODIN
                    msg = f"Gungnir Verdict: {decision.upper()} (LLR: {llr:.2f}). Logic Breach."
                    yield {"type": "ui", "persona": "ODIN", "msg": msg}
                    shutil.copy(backup_path, target_path)  # Rollback
                    backup_path.unlink()

                    # Inject traceback for ODIN so it isn't guessing blindly
                    context["error"] = f"Logic Failed (LLR: {llr}).\n{verification_logs[-2000:]}"
                    context["previous_attempt"] = new_code
                    gc.collect()

                    # [CANARY] Intra-loop pulse
                    self._pulse_warden(session_start_time, attempt, 1 if decision != "Accept" else 0)

        except WardenCircuitBreaker as e:
            yield {"type": "ui", "persona": "ALFRED", "msg": f"WARDEN CIRCUIT BREAKER: {e!s}"}
            yield {"type": "ui", "persona": "ODIN", "msg": "Safety protocol engaged. Rollback."}

            if 'backup_path' in locals() and backup_path.exists():
                shutil.copy(backup_path, target_path)
                backup_path.unlink()

            yield {"type": "result", "status": "error", "message": f"Circuit Breaker Toggled: {e!s}"}
            return

    async def _generate_with_calculus(self, task: str, context: dict, file_ext: str) -> dict:
        """Internal generator wrapper with Gungnir Calculus retry logic."""
        current_task_prompt = f"FORGE: {task}"

        # [BIFRÖST] Augment context with web search if task is complex
        if len(task.split()) > 4:
            msg = f"Forge: Augmenting context with web research for '{task}'..."
            SovereignHUD.persona_log("INFO", msg)
            results = self.searcher.search(f"Documentation and examples for: {task}")
            if results:
                web_context = "\n".join([f"- {r['title']}: {r['description']}" for r in results[:2]])
                context["web_research"] = web_context

        for _attempt in range(2):  # max_retries = 1 (total 2 attempts)
            response = await self.uplink.send_payload(current_task_prompt, context)
            if response.get("status") == "error":
                return response

            new_code = response.get("data", {}).get("code")
            if not new_code:
                return response

            # Run Gungnir Aesthetic Calculus
            gungnir = UniversalGungnir()
            report = gungnir.audit_logic(new_code, file_ext)
            breaches = [b['action'] for b in report if b['severity'] in ["HIGH", "CRITICAL"]]

            if not breaches:
                return response

            # Self-Correction Cycle
            warning_msg = "Your previous generation failed the Gungnir Aesthetic Calculus."
            context["error"] = f"\n\nSYSTEM WARNING: {warning_msg}\n" + "\n".join(breaches)
            context["previous_attempt"] = new_code
            current_task_prompt = f"REPAIR FORGE: {task}. Resolve aesthetic breaches."

        return response

    def _pulse_warden(self, start_time: float, attempt: int, errors: int) -> None:
        """Intra-loop sensory pulse."""
        if not self.warden:
            return

        latency = (time.time() - start_time) * 1000
        features = [float(latency), float(attempt), 1.0, float(errors)]

        try:
            prob = self.warden.forward(features)
            if prob > 0.8:
                msg = f"Forge Drift Detected ({prob:.2f}). Metrics: {latency:.1f}ms"
                SovereignHUD.persona_log("CRITICAL", msg)
                self.warden.train_step(features, 0.0)
                
                # RESTORE CIRCUIT BREAKER RAISING
                if getattr(self.warden, 'burn_in_cycles', 0) == 0:
                    raise WardenCircuitBreaker(f"Critical Drift Probability: {prob:.2f}")
        except WardenCircuitBreaker:
            raise
        except Exception:
            pass
