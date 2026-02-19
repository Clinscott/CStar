import os
import sys
import json
import uuid
import ast
import shutil
import asyncio
import gc
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.uplink import AntigravityUplink

class Forge:
    """
    The Autonomous Forge (Daemon-Hosted).
    V5: Thread-Safe TDD Engine using Gungnir SPRT Calculus.
    """
    def __init__(self):
        self.uplink = AntigravityUplink()
        self.max_retries = 3
        self.project_root = project_root

    def __repr__(self):
        return f"<Forge(root='{self.project_root}', retries={self.max_retries})>"

    async def execute(self, task: str, target_file: str):
        """
        Runs the forging loop as an async generator.
        Yields: {"type": "ui"|"result", ...}
        """
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
            yield {"type": "ui", "persona": "ODIN", "msg": f"Attempt {attempt}/{self.max_retries}: [SID: {session_id[:8]}] Communing with the void..."}
            
            # 1. ODIN Uplink (Generate Component)
            response = await self.uplink.send_payload(f"FORGE: {task}", context)
            
            if response.get("status") == "error":
                yield {"type": "ui", "persona": "ALFRED", "msg": f"Uplink severed: {response.get('message')}"}
                yield {"type": "result", "status": "error", "message": "Uplink Failed"}
                return
                
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
                        try: ep.kill() 
                        except: pass
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
                
                obs_str = ",".join(map(str, observations))
                ps_script = self.project_root / "src/core/engine/gungnir/Invoke-GungnirSPRT.ps1"
                
                # OS-Agnostic Execution
                ps_exec = "powershell" if os.name == "nt" else "pwsh"
                ps_command = f"& {{ . '{str(ps_script)}'; Invoke-GungnirSPRT -Observations {obs_str} | ConvertTo-Json -Compress }}"
                
                proc = await asyncio.create_subprocess_exec(
                    ps_exec, "-NoProfile", "-Command", ps_command,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await proc.communicate()
                
                if proc.returncode != 0:
                    raise RuntimeError(f"Gungnir Engine Fault: {stderr.decode()}")

                sprt = json.loads(stdout.decode())
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

        yield {"type": "ui", "persona": "ODIN", "msg": "Maximum retries exhausted. The Forge sleeps."}
        yield {"type": "result", "status": "failure", "message": "Max Retries Exceeded"}
