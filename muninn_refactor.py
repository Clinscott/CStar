import sys
from pathlib import Path

content = Path('src/sentinel/muninn.py').read_text(encoding='utf-8')

# Fix Top Level typing and typing attributes
content = content.replace(
    'target_path: Optional[str] = None,\n        client: Optional[Any] = None,',
    'target_path: str | None = None,\n        client: Any | None = None, # noqa: ANN401'
)

# Fix os.path.join
content = content.replace(
    'log_file = os.path.join("/tmp", log_file)',
    'log_file = str(Path("/tmp") / log_file)'
)

# Fix open
content = content.replace(
    'with open(feedback_path, encoding="utf-8") as f:',
    'with feedback_path.open(encoding="utf-8") as f:'
)

# Fix getcwd
content = content.replace(
    'self.root = Path(target_path or os.getcwd()).resolve()',
    'self.root = Path(target_path or Path.cwd()).resolve()')

# Type hinted dictionary
content = content.replace(
    'self._strategist_metrics: dict[str, dict[str, int]] = {}',
    'self._strategist_metrics: dict[str, dict[str, int]] = {}\n        self._discovered_wardens: dict[str, Any] = {}'
)

# sync send type
content = content.replace(
    'def _sync_send(self, prompt: str, context: dict):',
    'def _sync_send(self, prompt: str, context: dict) -> Any:'
)

# get_score type annotation
content = content.replace(
    'def get_score(b):',
    'def get_score(b: dict[str, Any]) -> int:'
)

# Fix python and pytest subprocess paths: (Lines 698)
content = content.replace(
    'cmd = [sys.executable, "-m", "pytest", test_dir, "-v"]',
    'cmd = [sys.executable, "-m", "pytest", test_dir, "-v"]'
)
content = content.replace(
    'result = subprocess.run(cmd, capture_output=True, text=True)',
    'result = subprocess.run(cmd, capture_output=True, text=True, check=False)'
)
content = content.replace(
    'reg_result = subprocess.run(cmd_reg, capture_output=True, text=True)',
    'reg_result = subprocess.run(cmd_reg, capture_output=True, text=True, check=False)'
)
content = content.replace(
    'res = subprocess.run(cmd, capture_output=True, text=True)',
    'res = subprocess.run(cmd, capture_output=True, text=True, check=False)'
)

# Fix Docker subprocess
docker_orig = '''        try:
            check_img = subprocess.run(["docker", "image", "inspect", image_name], capture_output=True)
            if check_img.returncode != 0:
                SovereignHUD.persona_log("FAIL", f"[ORCHESTRATOR] Docker Image '{image_name}' not found. Please build it first.")
                return False
        except Exception:
            SovereignHUD.persona_log("FAIL", "[ORCHESTRATOR] Docker daemon not responsive.")
            return False

        # Build command
        cmd = [
            "docker", "run",'''
docker_new = '''        docker_exe = shutil.which("docker")
        if not docker_exe:
            SovereignHUD.persona_log("CRITICAL", "[ORCHESTRATOR] Docker executable not found in path.")
            return False

        try:
            check_img = subprocess.run([docker_exe, "image", "inspect", image_name], capture_output=True, check=False)
            if check_img.returncode != 0:
                SovereignHUD.persona_log("FAIL", f"[ORCHESTRATOR] Docker Image '{image_name}' not found. Please build it first.")
                return False
        except Exception:
            SovereignHUD.persona_log("FAIL", "[ORCHESTRATOR] Docker daemon not responsive.")
            return False

        # Build command
        cmd = [
            docker_exe, "run",'''
content = content.replace(docker_orig, docker_new)

content = content.replace(
    'subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)',
    'subprocess.run([docker_exe, "rm", "-f", container_name], capture_output=True, check=False)'
)

promote_orig = '''    def _promote_from_container(self, container_name: str, stdout: str) -> bool:
        """Extracts fixed files from the container layer."""
        # Simple extraction: look for [PROMOTION] tags in stdout
        import re
        matches = re.findall(r"\[PROMOTION\]\s+(.*)", stdout)
        if not matches:
            SovereignHUD.persona_log("WARN", "[ORCHESTRATOR] No promotion targets detected.")
            return False

        for target in matches:
            target_clean = target.strip()
            dest = self.root / target_clean
            SovereignHUD.persona_log("INFO", f"[ORCHESTRATOR] Promoting {target_clean} to host...")
            subprocess.run(["docker", "cp", f"{container_name}:/app/{target_clean}", str(dest)], check=True)

        return True'''
promote_new = '''    def _promote_from_container(self, container_name: str, stdout: str) -> bool:
        """Extracts fixed files from the container layer."""
        import re
        docker_exe = shutil.which("docker")
        if not docker_exe:
            return False

        matches = re.findall(r"\[PROMOTION\]\s+(.*)", stdout)
        if not matches:
            SovereignHUD.persona_log("WARN", "[ORCHESTRATOR] No promotion targets detected.")
            return False

        for target in matches:
            target_clean = target.strip()
            dest = self.root / target_clean
            SovereignHUD.persona_log("INFO", f"[ORCHESTRATOR] Promoting {target_clean} to host...")
            subprocess.run([docker_exe, "cp", f"{container_name}:/app/{target_clean}", str(dest)], check=True)

        return True'''
content = content.replace(promote_orig, promote_new)


# Rebuild Hunt
orig_hunt = '''    async def _execute_hunt_async(self):
        """
        Executes the Warden Scan in parallel using Dynamic Discovery.
        """
        import importlib
        import inspect

        wardens = {}

        # 1. Annex is still special (Primary Guardian)
        try:
            wardens["ANNEX"] = HeimdallWarden(self.root)
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Heimdall Initialization Failed: {e}")

        # 2. Dynamic Discovery of Wardens
        warden_dir = Path(__file__).parent / "wardens"
        for warden_file in warden_dir.glob("*.py"):
            if warden_file.name in ("__init__.py", "base.py"):
                continue

            try:
                module_name = f"src.sentinel.wardens.{warden_file.stem}"
                module = importlib.import_module(module_name)

                for name, obj in inspect.getmembers(module):
                    if (inspect.isclass(obj) and
                        issubclass(obj, BaseWarden) and
                        obj is not BaseWarden):

                        # Use uppercase stem as the key (e.g., VALKYRIE)
                        key = warden_file.stem.upper()
                        wardens[key] = obj(self.root)
                        break # One warden per file preferred
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Failed to scry into {warden_file.name}: {e}")

        all_breaches = []
        scan_results = {}

        # 3. Heimdall / Annex Scan
        if "ANNEX" in wardens:
            try:
                wardens["ANNEX"].scan()
                annex_breaches = []
                for b in wardens["ANNEX"].breaches:
                     b['type'] = 'ANNEX_BREACH'
                     b['severity'] = 'CRITICAL'
                     annex_breaches.append(b)
                scan_results["ANNEX"] = len(annex_breaches)
                all_breaches.extend(annex_breaches)
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Heimdall Scan Failed: {e}")

        # 4. Async Parallel Scan
        tasks = []
        names = []

        for name, w in wardens.items():
            if name == "ANNEX": continue
            if hasattr(w, 'scan_async'):
                tasks.append(w.scan_async())
                names.append(name)
            else:
                tasks.append(asyncio.to_thread(w.scan))
                names.append(name)

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for name, res in zip(names, results, strict=False):
                if isinstance(res, Exception):
                    SovereignHUD.persona_log("WARN", f"{name} Failed: {res}")
                    scan_results[name] = 0
                else:
                    scan_results[name] = len(res)
                    all_breaches.extend(res)

        return all_breaches, scan_results'''

new_hunt = '''    def _init_heimdall(self) -> dict[str, Any]:
        """Initializes the special Heimdall Annex Warden."""
        wardens = {}
        try:
            wardens["ANNEX"] = HeimdallWarden(self.root)
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Heimdall Initialization Failed: {e}")
        return wardens

    def _discover_wardens(self) -> dict[str, Any]:
        """Dynamically discovers and caches Wardens from the filesystem."""
        if self._discovered_wardens:
            return self._discovered_wardens

        import importlib
        import inspect

        discovered = {}
        warden_dir = Path(__file__).parent / "wardens"
        for warden_file in warden_dir.glob("*.py"):
            if warden_file.name in ("__init__.py", "base.py"):
                continue

            try:
                module_name = f"src.sentinel.wardens.{warden_file.stem}"
                module = importlib.import_module(module_name)

                for _name, obj in inspect.getmembers(module):
                    if (inspect.isclass(obj) and
                        issubclass(obj, BaseWarden) and
                        obj is not BaseWarden):

                        key = warden_file.stem.upper()
                        discovered[key] = obj(self.root)
                        break
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Failed to scry into {warden_file.name}: {e}")
        
        self._discovered_wardens = discovered
        return discovered

    async def _dispatch_warden_scans(self, wardens: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, int]]:
        """Executes previously discovered Wardens in parallel."""
        all_breaches = []
        scan_results: dict[str, int] = {}

        if "ANNEX" in wardens:
            try:
                wardens["ANNEX"].scan()
                annex_breaches = []
                for b in wardens["ANNEX"].breaches:
                     b['type'] = 'ANNEX_BREACH'
                     b['severity'] = 'CRITICAL'
                     annex_breaches.append(b)
                scan_results["ANNEX"] = len(annex_breaches)
                all_breaches.extend(annex_breaches)
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Heimdall Scan Failed: {e}")

        tasks = []
        names = []

        for name, w in wardens.items():
            if name == "ANNEX": continue
            if hasattr(w, 'scan_async'):
                tasks.append(w.scan_async())
                names.append(name)
            else:
                tasks.append(asyncio.to_thread(w.scan))
                names.append(name)

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for name, res in zip(names, results, strict=False):
                if isinstance(res, Exception):
                    SovereignHUD.persona_log("WARN", f"{name} Failed: {res}")
                    scan_results[name] = 0
                else:
                    if isinstance(res, list):
                        scan_results[name] = len(res)
                        all_breaches.extend(res)
                    else:
                        scan_results[name] = 0

        return all_breaches, scan_results

    async def _execute_hunt_async(self) -> tuple[list[dict[str, Any]], dict[str, int]]:
        """Executes the Warden Scan in parallel."""
        wardens = {}
        wardens.update(self._init_heimdall())
        wardens.update(self._discover_wardens())
        return await self._dispatch_warden_scans(wardens)'''

content = content.replace(orig_hunt, new_hunt)

orig_distill = '''    def _distill_knowledge(self, target: dict | None = None, success: bool = False) -> None:
        """
        Extracts learnings from the ledger and generates cortex_directives.md.
        Acts as the subconscious of the framework.
        """
        ledger_path = self.root / ".agent" / "ledger.json"
        if not ledger_path.exists():
            return

        try:
            with open(ledger_path) as f:
                data = json.load(f)
        except Exception:
            return

        history = data.get("flight_history", [])
        if not history:
            return

        # 1. Identify Cursed Files (High Risk)
        # > 2 evaluations AND >= 50% Reject rate
        file_stats = {}
        for entry in history:
            t_file = entry.get("target")
            if not t_file:
                continue
            if t_file not in file_stats:
                file_stats[t_file] = {"total": 0, "rejects": 0}

            file_stats[t_file]["total"] += 1
            if entry.get("decision") == "Reject":
                file_stats[t_file]["rejects"] += 1

        cursed_files = []
        for fname, stats in file_stats.items():
            if stats["total"] > 2:
                failure_rate = stats["rejects"] / stats["total"]
                if failure_rate >= 0.5:
                    cursed_files.append(f"{fname} (Failure Rate: {failure_rate:.0%})")

        # 2. Identify Blessed Precedents (High Success)
        # Top 3 most recent "Accept" decisions
        accepted = [h for h in history if h.get("decision") == "Accept"]
        # Sort by timestamp descending
        accepted.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        blessed_precedents = []
        for entry in accepted[:3]:
            tgt = entry.get("target", "Unknown")
            score = entry.get("alignment_score", 0)
            blessed_precedents.append(f"{tgt} (Score: {score})")

        # 3. Generate Cortex Directives
        gphs = data.get("global_project_health_score", 0.0)

        directives_path = self.root / ".agent" / "cortex_directives.md"

        md_content = f"""# Global Project Health Score: {gphs:.2f}

## ☠️ Cursed Files (High Risk)
"""
        if cursed_files:
            for c in cursed_files:
                md_content += f"- {c}\\n"
        else:
            md_content += "- None detected.\\n"

        md_content += "\\n## 🛡️ Blessed Precedents (Mimic Pattern)\\n"

        if blessed_precedents:
            for b in blessed_precedents:
                md_content += f"- {b}\\n"
        else:
            md_content += "- None available.\\n"

        directives_path.write_text(md_content, encoding='utf-8')

        print(f"ODIN: 'The ledger has been read. The Runes of Wisdom are carved at {directives_path}.'")'''

new_distill = '''    def _parse_ledger(self) -> dict[str, Any]:
        """Reads the ledger safely, emitting alerts on corruption."""
        ledger_path = self.root / ".agent" / "ledger.json"
        if not ledger_path.exists():
            return {}

        try:
            with ledger_path.open(encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            SovereignHUD.persona_log("CRITICAL", f"Ledger corruption detected: {e}. Yielding empty memory state.")
            return {}

    def _identify_cursed_files(self, history: list[dict[str, Any]]) -> list[str]:
        """Identifies files with high failure rates."""
        file_stats: dict[str, dict[str, int]] = {}
        for entry in history:
            t_file = entry.get("target")
            if not t_file:
                continue
            if t_file not in file_stats:
                file_stats[t_file] = {"total": 0, "rejects": 0}

            file_stats[t_file]["total"] += 1
            if entry.get("decision") == "Reject":
                file_stats[t_file]["rejects"] += 1

        cursed_files = []
        for fname, stats in file_stats.items():
            if stats["total"] > 2:
                failure_rate = stats["rejects"] / stats["total"]
                if failure_rate >= 0.5:
                    cursed_files.append(f"{fname} (Failure Rate: {failure_rate:.0%})")
        return cursed_files

    def _identify_blessed_precedents(self, history: list[dict[str, Any]]) -> list[str]:
        """Identifies recent successful code integrations."""
        accepted = [h for h in history if h.get("decision") == "Accept"]
        accepted.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        blessed_precedents = []
        for entry in accepted[:3]:
            tgt = entry.get("target", "Unknown")
            score = entry.get("alignment_score", 0)
            blessed_precedents.append(f"{tgt} (Score: {score})")
        return blessed_precedents

    def _write_directives(self, cursed_files: list[str], blessed_precedents: list[str], gphs: float) -> None:
        """Formats and writes the directives markdown."""
        directives_path = self.root / ".agent" / "cortex_directives.md"

        md_content = f"# Global Project Health Score: {gphs:.2f}\\n\\n## ☠️ Cursed Files (High Risk)\\n"
        if cursed_files:
            for c in cursed_files:
                md_content += f"- {c}\\n"
        else:
            md_content += "- None detected.\\n"

        md_content += "\\n## 🛡️ Blessed Precedents (Mimic Pattern)\\n"
        if blessed_precedents:
            for b in blessed_precedents:
                md_content += f"- {b}\\n"
        else:
            md_content += "- None available.\\n"

        directives_path.write_text(md_content, encoding='utf-8')
        print(f"ODIN: 'The ledger has been read. The Runes of Wisdom are carved at {directives_path}.'")

    def _distill_knowledge(self, target: dict[str, Any] | None = None, success: bool = False) -> None:
        """Acts as the subconscious of the framework."""
        data = self._parse_ledger()
        history = data.get("flight_history", [])
        if not history:
            return

        cursed_files = self._identify_cursed_files(history)
        blessed_precedents = self._identify_blessed_precedents(history)
        gphs = data.get("global_project_health_score", 0.0)

        self._write_directives(cursed_files, blessed_precedents, gphs)'''

content = content.replace(orig_distill, new_distill)

Path('src/sentinel/muninn.py').write_text(content, encoding='utf-8')
print("Successfully wrote Refactor.")
