"""
[WARDEN] Sandbox Warden
Lore: "The isolated forge where volatile runes are tested without burning down the World Tree."
Purpose: Hermetic Docker provisioning, execution, verification, and 3-way patching.
"""

import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from src.core.sovereign_hud import SovereignHUD

class SandboxWarden:
    def __init__(self, root: Path):
        self.root = root
        self.shadow_dir = self.root / ".shadow_workspace"
        self.ignore_dirs = {".venv", "node_modules", ".git", "__pycache__", ".pytest_cache", ".shadow_workspace"}

    def _optimized_mirror(self):
        """
        Creates an optimized shadow mirror of the repository.
        Specifically ignores heavyweight directories to prevent I/O latency.
        """
        if self.shadow_dir.exists():
            shutil.rmtree(self.shadow_dir, ignore_errors=True)
            
        def ignore_filter(dir_path, contents):
            return [c for c in contents if c in self.ignore_dirs]

        SovereignHUD.persona_log("ALFRED", "Provisioning Ephemeral Shadow Workspace...")
        shutil.copytree(self.root, self.shadow_dir, ignore=ignore_filter)
        
        # Ensure a clean git state for tracking changes
        subprocess.run(["git", "init"], cwd=str(self.shadow_dir), capture_output=True)
        subprocess.run(["git", "add", "."], cwd=str(self.shadow_dir), capture_output=True)
        subprocess.run(["git", "commit", "-m", "Baseline"], cwd=str(self.shadow_dir), capture_output=True)

    def execute_and_verify(self, skill_path: Path) -> bool:
        """
        Spins up the Docker sandbox, mounts the read-only dependencies, executes the skill,
        and extracts the patch.
        """
        self._optimized_mirror()
        
        # Copy the staged skill into the shadow workspace
        shadow_skill_path = self.shadow_dir / skill_path.relative_to(self.root)
        shadow_skill_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(skill_path, shadow_skill_path)

        container_name = f"cstar_sandbox_{int(time.time())}"
        # Build paths for mounting
        host_venv = self.root / ".venv"
        host_node_modules = self.root / "node_modules"

        # Docker Run Command
        SovereignHUD.persona_log("ODIN", "Igniting Hermetic Docker Container...")
        
        # Notice we are mounting the shadow dir as RW, and the heavy dependencies as RO.
        # We use a standard python node image for WSL2 parity
        cmd = [
            "docker", "run", "--rm", "--name", container_name,
            "-v", f"{self.shadow_dir.absolute()}:/workspace",
            "-v", f"{host_venv.absolute()}:/host_venv:ro",
            "-v", f"{host_node_modules.absolute()}:/host_node_modules:ro",
            "-w", "/workspace",
            "nikolaik/python-nodejs:python3.11-nodejs20", # Assumed base image
            "bash", "-c",
            f"ln -s /host_venv .venv && ln -s /host_node_modules node_modules && python {shadow_skill_path.relative_to(self.shadow_dir)} && git diff"
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            patch_content = result.stdout
            
            if patch_content.strip():
                SovereignHUD.persona_log("ALFRED", "Skill execution successful. Extracting 3-way patch...")
                return self._apply_3way_patch(patch_content, skill_path)
            else:
                SovereignHUD.persona_log("ALFRED", "Skill executed successfully but generated no codebase mutations.")
                # We still promote the skill since it executed successfully without crashing
                self._promote_skill(skill_path)
                return True
                
        except subprocess.CalledProcessError as e:
            SovereignHUD.persona_log("HEIMDALL", f"Sandbox Execution Failed (Exit Code: {e.returncode})\n{e.stderr}")
            return False
        finally:
            # Cleanup shadow workspace
            shutil.rmtree(self.shadow_dir, ignore_errors=True)

    def _apply_3way_patch(self, patch_content: str, skill_path: Path) -> bool:
        """Applies the extracted git diff patch back to the host via 3-way merge."""
        patch_file = self.root / f"sandbox_{int(time.time())}.patch"
        patch_file.write_text(patch_content, encoding="utf-8")
        
        try:
            SovereignHUD.persona_log("ODIN", "Applying Git 3-Way Patch to host...")
            subprocess.run(["git", "apply", "--3way", str(patch_file)], cwd=str(self.root), check=True, capture_output=True)
            self._promote_skill(skill_path)
            return True
        except subprocess.CalledProcessError as e:
            SovereignHUD.persona_log("HEIMDALL", f"3-Way Patching Failed due to codebase drift. Conflict resolution required.\n{e.stderr}")
            return False
        finally:
            if patch_file.exists():
                patch_file.unlink()

    def _promote_skill(self, skill_path: Path):
        """Promotes the JIT skill to the permanent agent skills directory."""
        dest = self.root / ".agents" / "skills" / skill_path.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(skill_path, dest)
        SovereignHUD.persona_log("ODIN", f"Skill '{skill_path.name}' promoted to permanent active duty.")
