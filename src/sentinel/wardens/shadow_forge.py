#!/usr/bin/env python3
"""
[O.D.I.N.] Shadow Forge Warden
Encapsulates Docker container lifecycle orchestration for the Ravens Protocol.
Implements:
1. Ephemeral Sandbox Deployment (RO Mounts, ENV propagation)
2. Safe Subprocess Execution (Containment of unexpected detachment)
3. Target Promotion (Extracting strictly formatted JSON payloads from the container)
"""

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from src.core.sovereign_hud import SovereignHUD
from src.sentinel.wardens.base import BaseWarden


class ShadowForgeWarden(BaseWarden):
    """Orchestrates the Host-side Shadow Forge lifecycle."""

    def __init__(self, project_root: Path | str):
        super().__init__(project_root)
        self.mock_mode = os.getenv("MOCK_MODE") == "true"
        self.docker_exe = shutil.which("docker")

    def _get_docker_executable(self) -> str | None:
        """Helper to assert docker existence."""
        if not self.docker_exe:
            SovereignHUD.persona_log(
                "CRITICAL", "[ORCHESTRATOR] Docker executable not found in path."
            )
        return self.docker_exe

    def scan(self) -> list[dict[str, Any]]:
        """
        Implementation of BaseWarden abstract method.
        Shadow Forge is an execution sandbox, not a static analyzer, so it returns an empty breach list.
        """
        return []

    def execute_cycle(self) -> bool:
        """Host-side orchestration of the Shadow Forge cycle."""
        docker_exe = self._get_docker_executable()
        if not docker_exe:
            return False

        image_name = "sentinel-sandbox"
        container_name = f"shadow_forge_{int(time.time())}"
        proj_root = str(self.root.resolve())

        # Check if image exists
        try:
            check_img = subprocess.run(  # noqa: S603
                [docker_exe, "image", "inspect", image_name],
                capture_output=True,
                check=False,
            )
            if check_img.returncode != 0:
                SovereignHUD.persona_log(
                    "FAIL",
                    f"[ORCHESTRATOR] Docker Image '{image_name}' not found. Please build it first.",
                )
                return False
        except Exception:
            SovereignHUD.persona_log("FAIL", "[ORCHESTRATOR] Docker daemon not responsive.")
            return False

        # Build command
        cmd = [
            docker_exe,
            "run",
            "--name",
            container_name,
            "-v",
            f"{proj_root}:/app:ro",  # RO Mount
            "-e",
            "SHADOW_FORGE_WORKER=true",
            "-e",
            f"MOCK_MODE={'true' if self.mock_mode else 'false'}",
            "-e",
            f"GOOGLE_API_KEY={os.getenv('GOOGLE_API_KEY', '')}",
            "-e",
            f"MUNINN_API_KEY={os.getenv('MUNINN_API_KEY', '')}",
            "sentinel-sandbox",
            "python",
            "-m",
            "src.sentinel.muninn",
        ]

        try:
            SovereignHUD.persona_log(
                "INFO", f"[ORCHESTRATOR] Starting transient worker {container_name}..."
            )
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)  # noqa: S603

            if result.returncode == 0:
                SovereignHUD.persona_log("SUCCESS", "[ORCHESTRATOR] Shadow Forge Cycle Verified.")
                return self._promote_from_container(container_name, result.stdout)
            else:
                SovereignHUD.persona_log(
                    "FAIL", f"[ORCHESTRATOR] Shadow Forge Failed (Code {result.returncode})"
                )
                SovereignHUD.persona_log("DEBUG", result.stderr)
                return False
        except subprocess.CalledProcessError as e:
            SovereignHUD.persona_log(
                "ERROR", f"[ORCHESTRATOR] Subprocess exploded violently: {e}"
            )
            return False
        except Exception as e:
            SovereignHUD.persona_log(
                "ERROR", f"[ORCHESTRATOR] Unexpected daemon fault: {e}"
            )
            return False
        finally:
            try:
                subprocess.run(  # noqa: S603
                    [docker_exe, "rm", "-f", container_name],
                    capture_output=True,
                    check=False,
                )
            except Exception as cleanup_err:
                 SovereignHUD.persona_log(
                    "WARN",
                    f"[ORCHESTRATOR] Failed to purge container {container_name}: {cleanup_err}"
                )

    def _promote_from_container(self, container_name: str, stdout: str) -> bool:
        """Extracts fixed files from the container layer using strict JSON payloads."""
        docker_exe = self._get_docker_executable()
        if not docker_exe:
            return False

        # Rip JSON payload out of stdout
        json_payload = None
        for line in stdout.splitlines():
            line = line.strip()
            if line.startswith("{") and "MANDATE_SUCCESS" in line:
                try:
                    json_payload = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue

        if not json_payload or json_payload.get("status") != "MANDATE_SUCCESS":
            SovereignHUD.persona_log(
                "WARN", "[ORCHESTRATOR] No valid JSON promotion payload detected."
            )
            return False

        promoted_files = json_payload.get("promoted_files", [])
        if not promoted_files:
            SovereignHUD.persona_log(
                "WARN", "[ORCHESTRATOR] Payload contained no files to promote."
            )
            return False

        success = True
        for target in promoted_files:
            target_clean = target.strip()
            dest = self.root / target_clean
            SovereignHUD.persona_log("INFO", f"[ORCHESTRATOR] Promoting {target_clean} to host...")
            try:
                 subprocess.run(  # noqa: S603
                     [docker_exe, "cp", f"{container_name}:/app/{target_clean}", str(dest)],
                     capture_output=True,
                     check=True
                 )
            except subprocess.CalledProcessError as e:
                 SovereignHUD.persona_log(
                     "ERROR",
                     f"[ORCHESTRATOR] Failed to extract {target_clean}: "
                     f"{e.stderr}"
                 )
                 success = False
            except Exception as e:
                 SovereignHUD.persona_log(
                     "ERROR",
                     f"[ORCHESTRATOR] Promotion Exception for {target_clean}: {e}"
                 )
                 success = False

        return success
