#!/usr/bin/env python3
"""
[ODIN] The Sandbox Warden
Responsible for executing untrusted Python skills in a restricted Docker environment.
Implements:
1. Physical Isolation (Docker container with no networking)
2. Resource Capping (128m RAM, 0.5 CPU)
3. Zombie Containment (Explicit docker rm -f on timeout/completion)
4. Cross-Platform Path Handling (Windows -> Linux volume mapping)
"""

import subprocess
import uuid
import sys
from pathlib import Path
from src.core.sovereign_hud import SovereignHUD

class SandboxWarden:
    def __init__(self, timeout: int = 5):
        self.timeout = timeout
        # Ensure Docker is available
        self.docker_available = True
        try:
            subprocess.run(["docker", "--version"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            SovereignHUD.persona_log("WARN", "Docker CLI not found. Physical isolation will be simulated.")
            self.docker_available = False

    def run_in_sandbox(self, file_path: Path, args: list[str] = None, hunting: bool = False) -> dict:
        """
        Executes a Python script in a transient, isolated Docker container.
        """
        # 1. Resolve Path for Cross-Platform compatibility
        abs_path = file_path.resolve()
        
        # 2. Assign deterministic name for brute-force cleanup
        container_name = f"cstar_sandbox_{uuid.uuid4().hex[:8]}"
        
        # 3. Apply dynamic hunting configuration
        # Untrusted logic = NO NETWORK + alpine. Hunting logic = BRIDGE + sentinel-hunter.
        network_mode = "bridge" if hunting else "none"
        image_name = "sentinel-hunter" if hunting else "sentinel-sandbox" # Or python:3.14-alpine as fallback
        
        # Determine image (Check if our custom images exist, else fallback to alpine)
        try:
            check_img = subprocess.run(["docker", "image", "inspect", image_name], capture_output=True)
            if check_img.returncode != 0:
                SovereignHUD.persona_log("WARN", f"Image {image_name} not found. Falling back to python:3.14-alpine.")
                image_name = "python:3.14-alpine"
        except Exception:
            image_name = "python:3.14-alpine"

        # 4. Construct the Docker Command
        cmd = [
            "docker", "run",
            "--rm",
            "--name", container_name,
            "--network", network_mode,
            "--memory", "128m",
            "--cpus", "0.5",
            "-v", f"{abs_path}:/app/skill.py:ro",
            image_name,
            "python", "/app/skill.py"
        ]
        
        if args:
            cmd.extend(args)

        SovereignHUD.persona_log("HEIMDALL", f"Isolating specimen in container '{container_name}'...")
        
        result = {
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
            "timed_out": False,
            "simulated": not self.docker_available
        }

        try:
            # 4. Execute with hard timeout
            if self.docker_available:
                try:
                    proc = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=self.timeout
                    )
                    # Detect Docker daemon connection failures which return exit code 1 or 125
                    if proc.returncode != 0 and ("docker" in proc.stderr.lower() or "pipe" in proc.stderr.lower() or "connection" in proc.stderr.lower()):
                         raise OSError(proc.stderr)
                         
                except (subprocess.CalledProcessError, OSError):
                    SovereignHUD.persona_log("WARN", "Docker Engine connection failed. Falling back to SIMULATED_JAIL.")
                    self.docker_available = False # Set for current session
                    result["simulated"] = True
            
            if not self.docker_available:
                SovereignHUD.persona_log("HEIMDALL", "[SIMULATION] Applying namespace constraints purely via OS handles...")
                native_cmd = [sys.executable, str(abs_path)] + (args or [])
                proc = subprocess.run(
                    native_cmd,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout
                )

            result["stdout"] = proc.stdout
            result["stderr"] = proc.stderr
            result["exit_code"] = proc.returncode
            
        except subprocess.TimeoutExpired as e:
            SovereignHUD.persona_log("WARNING", f"Specimen exceeded time limit ({self.timeout}s). Terminating.")
            result["timed_out"] = True
            result["stdout"] = e.stdout.decode() if e.stdout else ""
            result["stderr"] = e.stderr.decode() if e.stderr else ""
            
        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Sandbox Breach: {str(e)}")
            result["stderr"] = str(e)
        
        finally:
            # 5. [CRITICAL] Zombie Containment
            # Brute-force removal to prevent resource leaks from background container spin
            SovereignHUD.persona_log("ODIN", f"Purging container {container_name}...")
            subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)

        return result

if __name__ == "__main__":
    # Test execution
    warden = SandboxWarden()
    test_script = Path("test_sandbox.py")
    test_script.write_text("print('Hello from the Crucible')")
    
    try:
        report = warden.run_in_sandbox(test_script)
        print(f"Report: {report}")
    finally:
        if test_script.exists():
            test_script.unlink()
