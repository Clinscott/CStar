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

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.sprt import evaluate_candidate
from src.cstar.core.uplink import AntigravityUplink
from src.core.payload import IntentPayload
from src.sentinel._bootstrap import bootstrap
from src.core.engine.atomic_gpt import AnomalyWarden, WardenCircuitBreaker

# Initialize Environment
bootstrap()

class Forge:
    """
    The Autonomous Forge (Daemon-Hosted).
    V5: Thread-Safe TDD Engine using Gungnir SPRT Calculus.
    """
    def __init__(self):
        # 1. Pull the heavy-workload Daemon Key
        daemon_key = os.getenv("GOOGLE_API_DAEMON_KEY") or os.getenv("GOOGLE_API_KEY")

        # 2. Inject it into the uplink
        self.uplink = AntigravityUplink(api_key=daemon_key)
        self.max_retries = 3
        self.project_root = project_root
        
        # 3. Initialize Warden
        try:
            self.warden = AnomalyWarden()
        except Exception:
            self.warden = None

    def __repr__(self):
        return f"<Forge(root='{self.project_root}', retries={self.max_retries})>"

    async def execute(self, payload: IntentPayload, target_file: str):
        """
        Runs the forging loop as an async generator.
        Yields: {"type": "ui"|"result", ...}
        """
        try:
            task = payload.intent_raw
            target_path = Path(target_file).resolve()

            if not target_path.exists():
                yield {"type": "ui", "persona": "ODIN", "msg": f"Target file {target_path.name} does not exist. Creating new."}
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.touch()

            # Initial Context
            context = {
                "task": task,
                "filename": target_path.name,
                "content": target_path.read_text(encoding='utf-8'),
                "persona": "ODIN"
            }

            yield {"type": "ui", "persona": "ODIN", "msg": f"Forging '{task}' on {target_path.name}..."}

            # Main Forge Loop (ODIN)
            for attempt in range(1, self.max_retries + 1):
                session_id = str(uuid.uuid4())
                session_start_time = time.time()
                yield {"type": "ui", "persona": "ODIN", "msg": f"Attempt {attempt}/{self.max_retries}: [SID: {session_id[:8]}] Communing with the void..."}

                # 1. ODIN Uplink (Generate Component with Gungnir Calculus)
                response = await self._generate_with_calculus(task, context, target_path.suffix)

                if response.get("status") == "error":
                    yield {"type": "ui", "persona": "ALFRED", "msg": f"Uplink severed: {response.get('message')}"}
                    yield {"type": "result", "status": "error", "message": "Uplink Failed"}
                    return

                if "warnings" in response:
                    yield {"type": "ui", "persona": "ODIN", "msg": "Gungnir Calculus detected dissonance. Self-correction applied."}

                new_code = response.get("data", {}).get("code")
                if not new_code:
                    yield {"type": "ui", "persona": "ODIN", "msg": "The void returned silence. Retrying..."}
                    context["error"] = "No code received from ODIN."
                    continue

                # 2. Thread-Safe Backup & Apply
                # Amended: use file.py.[uuid].bak to preserve extension
                backup_path = target_path.with_name(f"{target_path.name}.{session_id}.bak")
                shutil.copy(target_path, backup_path)
                target_path.write_text(new_code, encoding='utf-8')

                # 3. Blinding ALFRED (Interface Extraction)
                try:
                    # Extract signatures and docstrings to prevent shared hallucinations
                    tree = ast.parse(new_code)
                    interfaces = []
                    for node in tree.body:
                        if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
                            # Simple extraction: name and docstring (if exists)
                            doc = ast.get_docstring(node) or "No documentation."
                            interfaces.append(f"{node.__class__.__name__}: {node.name}\nDoc: {doc}")
                    blind_prompt = "\n".join(interfaces) if interfaces else new_code
                except Exception:
                    blind_prompt = new_code # Fallback

                # 4. ALFRED Loop (Adversarial Verification - 2 Strike Policy)
                alfred_strikes = 0
                alfred_success = False
                alfred_context = {
                    "persona": "ALFRED",
                    "target_interface": blind_prompt,
                    "task": task,
                    "session_id": session_id,
                    "error": None
                }

                # Fixed Gungnir JSON naming in prompt
                GUNGNIR_FILE = f"gungnir_{session_id}.json"
                SYSTEM_DIRECTIVE = (
                    f"You are ALFRED, an adversarial verification entity. "
                    f"Write parameterized unit tests (min 25 fuzzing iterations) to break the interface. "
                    f"Detect the target language and use industry-standard linting and testing frameworks. "
                    f"Embed logic to output a flat integer array (0=pass, 1=fail) to '{GUNGNIR_FILE}'. "
                    f"Output ONLY strict JSON: 'lint_command', 'test_command', 'test_filename', and 'test_code'."
                )

                while alfred_strikes < 2:
                    yield {"type": "ui", "persona": "ALFRED", "msg": f"Constructing constraints (Strike {alfred_strikes}/2)..."}

                    # Uplink to ALFRED
                    alfred_resp = await self.uplink.send_payload(f"SYSTEM DIRECTIVE: {SYSTEM_DIRECTIVE}", alfred_context)

                    try:
                        data = alfred_resp.get("data", {})
                        if isinstance(data, str):
                            data = json.loads(data)

                        test_fn = data.get("test_filename")
                        test_code = data.get("test_code")
                        lint_cmd = data.get("lint_command")
                        test_cmd = data.get("test_command")

                        if not (test_fn and test_code and lint_cmd and test_cmd):
                            raise ValueError("Incomplete verification payload.")

                        # Write Test file
                        test_path = self.project_root / test_fn
                        test_path.parent.mkdir(parents=True, exist_ok=True)
                        test_path.write_text(test_code, encoding='utf-8')

                        # 4.1 Lint Gate
                        yield {"type": "ui", "persona": "ALFRED", "msg": f"Linting Verification: {lint_cmd}"}
                        lp = await asyncio.create_subprocess_shell(
                            lint_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=str(self.project_root)
                        )
                        stdout, stderr = await lp.communicate()

                        if lp.returncode != 0:
                            alfred_strikes += 1
                            alfred_context["error"] = f"Linter Error:\n{stderr.decode()[:500]}"
                            yield {"type": "ui", "persona": "ALFRED", "msg": f"Lint Gate Breach. Strike {alfred_strikes}."}
                            continue

                        # 4.2 Execution Gate (15s Timeout)
                        yield {"type": "ui", "persona": "ALFRED", "msg": f"Executing Verifier: {test_cmd}"}
                        try:
                            ep = await asyncio.create_subprocess_shell(
                                test_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=str(self.project_root)
                            )
                            test_stdout, test_stderr = await asyncio.wait_for(ep.communicate(), timeout=15.0)

                            # Save logs to feed back to ODIN in case of logic rejection
                            verification_logs = (test_stdout.decode() + "\n" + test_stderr.decode()).strip()
                        except asyncio.TimeoutError:
                            alfred_strikes += 1
                            alfred_context["error"] = "Test Execution Timeout."
                            yield {"type": "ui", "persona": "ALFRED", "msg": f"Verification Timeout. Strike {alfred_strikes}."}
                            with contextlib.suppress(Exception):
                                ep.kill()
                            continue

                        # 4.3 Artifact Check
                        gungnir_path = self.project_root / GUNGNIR_FILE
                        if not gungnir_path.exists():
                            alfred_strikes += 1
                            alfred_context["error"] = "Gungnir artifact missing (Process crash?)"
                            yield {"type": "ui", "persona": "ALFRED", "msg": f"Missing Artifact. Strike {alfred_strikes}."}
                            continue

                        alfred_success = True
                        break

                    except Exception as e:
                        alfred_strikes += 1
                        alfred_context["error"] = str(e)
                        yield {"type": "ui", "persona": "ALFRED", "msg": f"Structure Fault. Strike {alfred_strikes}."}
                        continue

                if not alfred_success:
                    yield {"type": "ui", "persona": "ODIN", "msg": "ALFRED failed to provide valid constraints. Rolling back."}
                    shutil.copy(backup_path, target_path)
                    backup_path.unlink()
                    yield {"type": "result", "status": "error", "message": "Verification Infrastructure Failure"}
                    return

                # 5. Gungnir SPRT Calculus (Accept/Reject Gate)
                try:
                    observations = json.loads(gungnir_path.read_text())
                    gungnir_path.unlink() # Immediate cleanup

                    # Native Gungnir Math
                    sprt = evaluate_candidate(observations)
                    decision = sprt.get("Decision", "Error")
                    llr = float(sprt.get("FinalLLR", 0.0))

                except Exception as e:
                    yield {"type": "ui", "persona": "ODIN", "msg": f"Gungnir Internal Error: {e}"}
                    decision, llr = "Error", 0.0

                if decision == "Accept":
                    yield {"type": "ui", "persona": "ODIN", "msg": f"Gungnir Verdict: ACCEPT (LLR: {llr:.2f}). Stable."}
                    backup_path.unlink()
                    gc.collect()
                    yield {"type": "result", "status": "success", "message": "Forge Complete", "llr": llr}
                    return
                else:
                    # Logical Failure: Penalize ODIN
                    yield {"type": "ui", "persona": "ODIN", "msg": f"Gungnir Verdict: {decision.upper()} (LLR: {llr:.2f}). Logic Breach."}
                    shutil.copy(backup_path, target_path) # Rollback
                    backup_path.unlink()

                    # Inject traceback for ODIN so it isn't guessing blindly
                    context["error"] = f"Logic Verification Failed (LLR: {llr}).\nTest Logs:\n{verification_logs[-2000:]}"
                    context["previous_attempt"] = new_code
                    gc.collect()

                    # [CANARY] Intra-loop pulse
                    self._pulse_warden(session_start_time, attempt, 1 if decision != "Accept" else 0)

        except WardenCircuitBreaker as e:
            yield {"type": "ui", "persona": "ALFRED", "msg": f"WARDEN CIRCUIT BREAKER: {str(e)}"}
            yield {"type": "ui", "persona": "ODIN", "msg": "Safety protocol engaged. Rolling back changes."}
            
            # Rollback logic if backup exists
            if 'backup_path' in locals() and backup_path.exists():
                shutil.copy(backup_path, target_path)
                backup_path.unlink()
            
            yield {"type": "result", "status": "error", "message": f"Circuit Breaker Toggled: {str(e)}"}
            return

        except Exception as e:
            yield {"type": "ui", "persona": "ALFRED", "msg": f"Forge Exception: {str(e)}"}
            yield {"type": "result", "status": "error", "message": str(e)}
            return

    def _verify_gungnir_calculus(self, code_string: str, file_ext: str) -> list[str]:
        """Runs the mathematical aesthetic checks on generated code before outputting."""
        breaches = []

        # 1. UI/UX Frontend Checks (.tsx / .jsx)
        if file_ext in ('.tsx', '.jsx'):
            elements = len(re.findall(r'<[a-zA-Z0-9]+', code_string))
            classes = re.findall(r'className=["\']([^"\']+)["\']', code_string)
            all_cls = [c for match in classes for c in match.split()]
            unique_cls = len(set(all_cls))

            C = elements + unique_cls if (elements + unique_cls) > 0 else 1

            # Order calculation
            class_counts = {c: all_cls.count(c) for c in set(all_cls)}
            O = sum(count for count in class_counts.values() if count > 2)

            symmetric_ops = {'flex', 'grid', 'justify-center', 'items-center', 'mx-auto', 'text-center'}
            O += sum(5 for c in all_cls if c in symmetric_ops)

            if elements > 5 and (O / C) < 0.3:
                breaches.append(f"GUNGNIR_UI_BREACH: Birkhoff Measure M={(O/C):.2f} is too low. Increase symmetry (O) and reduce raw classes (C).")

            if len(re.findall(r'-\[[0-9]+px\]', code_string)) > 3:
                breaches.append("GUNGNIR_UI_BREACH: Too many arbitrary pixel sizes. Use native Tailwind Fibonacci scales.")

        # 2. Backend Structural Checks (.py)
        elif file_ext == '.py':
            # Whitespace Rhythm Enforcement
            lines = code_string.split('\n')
            consecutive = 0
            for line in lines:
                if line.strip() and not line.strip().startswith('#'):
                    consecutive += 1
                    if consecutive > 12:
                        breaches.append("GUNGNIR_BACKEND_BREACH: Claustrophobic code block (>12 lines). Inject vertical whitespace.")
                        break
                else:
                    consecutive = 0

            # Ratio Check (Setup vs Execution)
            try:
                tree = ast.parse(code_string)
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        setup = sum(1 for child in node.body if isinstance(child, (ast.Assign, ast.AnnAssign, ast.Assert)))
                        exec_nodes = sum(1 for child in node.body if isinstance(child, (ast.For, ast.While, ast.Return, ast.Expr, ast.If)))
                        if exec_nodes > 0 and (setup / exec_nodes) > 1.7:
                            breaches.append(f"GUNGNIR_BACKEND_BREACH: Function '{node.name}' is top-heavy setup (Ratio: {setup/exec_nodes:.2f}). Extract helper functions.")
            except (SyntaxError, Exception):
                pass # Defer to standard linters/validators

        return breaches

    def _extract_code_blocks(self, text: str) -> str:
        """Helper to extract code content from markdown triple backticks."""
        pattern = r"```(?:\w+)?\n(.*?)\n```"
        matches = re.findall(pattern, text, re.DOTALL)
        if matches:
            return matches[0].strip()
        return text.strip()

    async def _generate_with_calculus(self, task: str, context: dict, file_ext: str):
        """Internal generator wrapper with Gungnir Calculus retry logic."""
        current_task_prompt = f"FORGE: {task}"

        for _attempt in range(2): # max_retries = 1 (total 2 attempts) as suggested
            response = await self.uplink.send_payload(current_task_prompt, context)
            if response.get("status") == "error":
                return response

            raw_data = response.get("data", {})
            if isinstance(raw_data, str):
                new_code = self._extract_code_blocks(raw_data)
            else:
                new_code = raw_data.get("code")

            if not new_code:
                return {"status": "error", "message": "No code received from ODIN."}

            breaches = self._verify_gungnir_calculus(new_code, file_ext)
            if not breaches:
                return {"status": "success", "data": {"code": new_code}}

            # Log breach internally for UI
            # (Note: This is a bit tricky inside this helper, but we'll return it)
            warning_msg = "Your previous generation failed the Gungnir Aesthetic Calculus."
            context["error"] = f"\n\nSYSTEM WARNING: {warning_msg} Fix the following constraints:\n" + "\n".join(breaches)
            context["previous_attempt"] = new_code
            current_task_prompt = f"REPAIR FORGE: {task}. Resolve aesthetic breaches."

        # Return whatever we have on final attempt if still breaches
        return {"status": "success", "data": {"code": new_code}, "warnings": breaches}

    def _pulse_warden(self, start_time, attempt, errors):
        """Intra-loop sensory pulse."""
        if not self.warden:
            return
            
        latency = (time.time() - start_time) * 1000
        features = [latency, 100.0, float(attempt), float(errors)] # Rough token estimate
        
        # Inference
        prob = self.warden.forward(features)
        
        # Train on success, but strictly watch for anomalies
        if self.warden.burn_in_cycles == 0:
            if prob > 0.92:
                # [CIRCUIT BREAKER] Hard halt on critical drift
                raise WardenCircuitBreaker(f"Critical Drift Detected ({prob:.2f}). Metrics: {latency:.1f}ms, Attempt {attempt}, Errors {errors}")
            
            if errors == 0:
                self.warden.train_step(features, 0.0)
        else:
            # Burn-in: Train on all iterations to learn environment baseline
            self.warden.train_step(features, 0.0)
