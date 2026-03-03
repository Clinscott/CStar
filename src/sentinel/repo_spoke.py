"""
[SPOKE] Repo Spoke
Lore: "The Guardian of the Sector."
Purpose: Orchestrate a single repository processing cycle.
"""

import asyncio
import logging
import time
from pathlib import Path
from src.core.sovereign_hud import SovereignHUD
from src.sentinel.git_spoke import GitSpoke

class RepoSpoke:
    def __init__(self, repo_path: Path, persona: str, use_docker: bool = False):
        self.repo_path = repo_path
        self.repo_name = repo_path.name
        self.persona = persona
        self.use_docker = use_docker
        self.git = GitSpoke(repo_path)

    async def process(self, bootstrap_fn: callable) -> bool:
        """Performs a single cleanup cycle on the repo."""
        SovereignHUD.persona_log("INFO", f"Engaging Jurisdiction: {self.repo_name} {' (DOCKER SANDBOX)' if self.use_docker else ''}")
        if not self.repo_path.exists():
            logging.warning(f"[{self.repo_name}] [SKIP] Path not found.")
            return False

        SovereignHUD.persona_log("INFO", f"Auditing {self.repo_name}...")

        # 1. Dirty Check
        if not self.git.is_clean():
            SovereignHUD.persona_log("WARN", f"{self.repo_name}: Dirty tree. Skipping to preserve user state.")
            logging.info(f"[{self.repo_name}] [SKIP] Dirty working tree.")
            return False

        # 2. Isolation
        original_branch = self.git.ensure_branch()

        try:
            # 3. Execution
            SovereignHUD.persona_log("INFO", f"Running Ravens Protocol: {self.repo_name}...")
            bootstrap_fn()
            
            from src.sentinel.muninn import Muninn
            raven = Muninn(str(self.repo_path), use_docker=self.use_docker)
            changed = await raven.run_cycle()

            # 4. Commit (If changed)
            if changed:
                ts = time.strftime("%Y-%m-%d %H:%M")
                commit_msg = (
                    f"🧹 A.L.F.R.E.D.: Tying up loose ends [{ts}]"
                    if self.persona == "ALFRED"
                    else f"🦅 Ravens: Auto-improvement [{ts}]"
                )

                self.git.commit_changes(commit_msg)
                SovereignHUD.persona_log("SUCCESS", f"Changes Committed: {commit_msg}")
                logging.info(f"[{self.repo_name}] [COMMIT] {commit_msg}")
                return True
            else:
                return False

        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"EXECUTION ERROR: {e}")
            logging.error(f"[{self.repo_name}] [EXEC_ERROR] {e}")
            return False
        finally:
            # 5. Cleanup
            self.git.restore_branch(original_branch)
