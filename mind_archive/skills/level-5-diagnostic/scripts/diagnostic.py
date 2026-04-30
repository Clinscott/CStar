"""
[LEVEL 5 DIAGNOSTIC: THE OMNI-AUDIT]
Identity: ALFRED / O.D.I.N.
Purpose: Deep structural sweep. Outputs report-only findings for reviewed bead work.
"""
import sys
import os
import time
import json
import re
from pathlib import Path
from collections import defaultdict
import subprocess

PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD

class Level5Diagnostic:
    def __init__(self, root: Path):
        self.root = root
        self.stats = {
            "scanned": 0,
            "legacy_drift": 0,
            "linscott_breaches": 0,
            "complexity_warnings": 0,
            "integrity_breaches": 0,
            "refactor_integrity": 0,
        }
        self.findings = []

        self.active_skills = set()
        skills_dir = self.root / ".agents" / "skills"
        if skills_dir.exists():
            for d in skills_dir.iterdir():
                if d.is_dir() and not d.name.startswith("."):
                    self.active_skills.add(d.name.lower())

    def _add_finding(self, pillar: str, file: str, issue: str) -> None:
        self.findings.append({
            "pillar": pillar,
            "file": file,
            "issues": [issue],
        })

    def _categorize_pillar(self, path: Path) -> str:
        rel_str = str(path.relative_to(self.root)).replace("\\", "/")
        if "src/node" in rel_str or rel_str == "cstar.ts":
            return "Kernel (Node.js)"
        if "src/tools/pennyone" in rel_str or "hall_schema" in rel_str:
            return "Memory (PennyOne)"
        if ".agents/skills/" in rel_str:
            return "Woven Skills"
        if "src/core/engine/wardens" in rel_str:
            return "Enforcers (Wardens)"
        if "src/sentinel/" in rel_str and "wardens" not in rel_str:
            return "Legacy Daemons (Sentinels)"
        if "tests/" in rel_str:
            return "Tests (Linscott/Empire)"
        if "src/core/engine" in rel_str:
            return "Core Engine (Python)"
        return "General Subsystems"

    def _has_test(self, path: Path) -> bool:
        stem = path.stem
        if path.name.startswith("test_") or path.name.endswith(".test.ts"):
            return True

        test_names = [f"test_{stem}.py", f"test_{stem}.test.ts", f"test_{stem}_empire.py", f"test_{stem}.ts", f"{stem}.test.ts"]
        tests_dir = self.root / "tests"
        if not tests_dir.exists():
            return False

        for t_name in test_names:
            if list(tests_dir.rglob(t_name)):
                return True
        return False

    def _check_runtime_integrity(self):
        SovereignHUD.persona_log("INFO", "Checking Runtime & Integrity Pulse...")
        integrity_findings = []

        # 1. Check for os.toml path drift
        os_toml = self.root / ".agents" / "extension" / "commands" / "tools" / "os.toml"
        if os_toml.exists():
            content = os_toml.read_text(encoding="utf-8")
            if "../../../bin/cstar.js" in content:
                integrity_findings.append({
                    "pillar": "Runtime & Integrity Pulse",
                    "file": str(os_toml.relative_to(self.root)),
                    "issues": ["Extension Path Drift: Tool commands point outside extension root (../../../bin/cstar.js)."]
                })
            if "${extensionPath}/bin/cstar.js" in content and not (self.root / ".agents" / "extension" / "bin" / "cstar.js").exists():
                integrity_findings.append({
                    "pillar": "Runtime & Integrity Pulse",
                    "file": str(os_toml.relative_to(self.root)),
                    "issues": ["Extension Path Drift: Tool commands point at ${extensionPath}/bin/cstar.js, but .agents/extension/bin/cstar.js does not exist in the source tree."]
                })

        # 2. Check for Skill Conflicts (e.g. chant-planner)
        global_skills = Path.home() / ".gemini" / "skills"
        local_skills = self.root / ".agents" / "extension" / "skills"
        if global_skills.exists() and local_skills.exists():
            g_skills = {d.name for d in global_skills.iterdir() if d.is_dir()}
            l_skills = {d.name for d in local_skills.iterdir() if d.is_dir()}
            conflicts = g_skills.intersection(l_skills)
            if conflicts:
                integrity_findings.append({
                    "pillar": "Runtime & Integrity Pulse",
                    "file": "Skill Registry",
                    "issues": [f"Skill Conflict: {s} is defined in both global and extension paths." for s in conflicts]
                })

        # 3. Check for Hook Collisions and Execution Integrity (Settings)
        # Note: We prioritize project or known hook locations
        candidate_settings = list(self.root.rglob("settings.json"))
        global_settings = Path.home() / ".gemini" / "settings.json"
        if global_settings.exists():
            candidate_settings.append(global_settings)

        for settings_path in candidate_settings:
            # Check both project-relative and absolute home-relative paths
            try:
                content = settings_path.read_text(encoding="utf-8")
                if not content.strip():
                    continue
                settings = json.loads(content)
                hooks = settings.get("hooks", {})
                for event_name, event_hooks in hooks.items():
                    if not isinstance(event_hooks, list):
                        continue

                    # Handle potential nesting if settings.json uses matchers
                    all_hooks = []
                    for h_entry in event_hooks:
                        if isinstance(h_entry, dict) and "hooks" in h_entry:
                            all_hooks.extend(h_entry["hooks"])
                        else:
                            all_hooks.append(h_entry)

                    for h in all_hooks:
                        h_name = h.get("name")
                        h_cmd = h.get("command")

                        if h_name == "corvus-session-start":
                            # Verify command path
                            if h_cmd and "python3" in h_cmd:
                                # Extract path after python3
                                cmd_parts = h_cmd.split()
                                script_path_str = ""
                                for i, part in enumerate(cmd_parts):
                                    if part == "python3" and i + 1 < len(cmd_parts):
                                        script_path_str = cmd_parts[i+1]
                                        break

                                if not script_path_str:
                                    script_path_str = h_cmd.split("python3")[-1].strip()

                                script_path = Path(os.path.expanduser(script_path_str))
                                if not script_path.exists():
                                    integrity_findings.append({
                                        "pillar": "Runtime & Integrity Pulse",
                                        "file": str(settings_path),
                                        "issues": [f"Hook Failure: {h_name} script not found at {script_path}"]
                                    })
                                else:
                                    # Dry run check (with empty payload)
                                    try:
                                        proc = subprocess.run(
                                            ["python3", str(script_path)],
                                            input=b'{}',
                                            capture_output=True,
                                            timeout=5
                                        )
                                        if proc.returncode != 0:
                                            integrity_findings.append({
                                                "pillar": "Runtime & Integrity Pulse",
                                                "file": str(settings_path),
                                                "issues": [f"Hook Runtime Error: {h_name} exited with code {proc.returncode}. Stderr: {proc.stderr.decode().strip()}"]
                                            })
                                    except subprocess.TimeoutExpired:
                                        integrity_findings.append({
                                            "pillar": "Runtime & Integrity Pulse",
                                            "file": str(settings_path),
                                            "issues": [f"Hook Timeout: {h_name} took longer than 5s to respond to empty payload."]
                                        })
                                    except Exception as e:
                                        integrity_findings.append({
                                            "pillar": "Runtime & Integrity Pulse",
                                            "file": str(settings_path),
                                            "issues": [f"Hook Execution Failed: {h_name} could not be executed: {str(e)}"]
                                        })
            except Exception:
                continue

        self.findings.extend(integrity_findings)
        if integrity_findings:
            self.stats["integrity_breaches"] = len(integrity_findings)
        else:
            self.stats["integrity_breaches"] = 0

    def _check_refactor_integrity(self):
        SovereignHUD.persona_log("INFO", "Checking Refactor Integrity Pulse...")
        start = len(self.findings)

        checks = [
            (
                "Host-Native Chant Boundary",
                self.root / "cstar.ts",
                r"\.command\('chant",
                "Stale CLI Boundary: cstar.ts still declares a public `chant` command although chant is expected to be host-native.",
            ),
            (
                "Host-Native Chant Boundary",
                self.root / ".agents" / "skill_registry.json",
                r'"cli"\s*:\s*"cstar chant"',
                "Registry Drift: chant still advertises `cstar chant` as a CLI surface.",
            ),
            (
                "Host-Native Chant Boundary",
                self.root / ".agents" / "skills" / "chant" / "SKILL.md",
                r"cstar chant",
                "Skill Contract Drift: chant documentation still presents `cstar chant` as public authority or usage.",
            ),
            (
                "Host-Native Chant Boundary",
                self.root / ".agents" / "skills" / "chant" / "scripts" / "chant.py",
                r"cstar\.ts|Transitional chant adapter",
                "Shell Adapter Drift: chant.py still shells back into the runtime-owned cstar.ts chant path.",
            ),
            (
                "Host-Native Chant Boundary",
                self.root / "src" / "packaging" / "distributions.ts",
                r"cstar chant",
                "Packaging Drift: generated host/distribution instructions still mention `cstar chant`.",
            ),
        ]

        for pillar, path, pattern, issue in checks:
            if not path.exists():
                continue
            content = path.read_text(encoding="utf-8", errors="ignore")
            if re.search(pattern, content):
                self._add_finding(pillar, str(path.relative_to(self.root)), issue)

        bypass_patterns = ("autobot_orchestrator.py", "run_hermes")
        for path in (self.root / "src").rglob("*.ts"):
            content = path.read_text(encoding="utf-8", errors="ignore")
            if any(pattern in content for pattern in bypass_patterns):
                self._add_finding(
                    "Host Routing Boundary",
                    str(path.relative_to(self.root)),
                    "Provider Bypass: TypeScript runtime code invokes AutoBot/Hermes directly instead of routing through requestHostText/host_session or a registered adapter.",
                )

        agent_browser_test = self.root / "tests" / "unit" / "test_agent_browser.test.ts"
        if agent_browser_test.exists():
            content = agent_browser_test.read_text(encoding="utf-8", errors="ignore")
            issues = []
            has_integration_gate = (
                "CSTAR_AGENT_BROWSER_INTEGRATION" in content
                and "CSTAR_AGENT_BROWSER_BINARY_PATH" in content
                and ("it.skip" in content or "runBrowserIntegration" in content)
            )
            hard_coded_exec = re.search(
                r"exec(?:File)?Sync\(\s*['\"]\/home\/morderith\/Corvus\/agent-browser",
                content,
            )
            if hard_coded_exec:
                issues.append("Non-Hermetic Test: hard-coded external agent-browser binary path.")
            if "https://example.com" in content and not has_integration_gate:
                issues.append("Non-Hermetic Test: network navigation appears inside a unit test.")
            if issues:
                self.findings.append({
                    "pillar": "Test Boundary",
                    "file": str(agent_browser_test.relative_to(self.root)),
                    "issues": issues,
                })

        focused_test_patterns = {
            "Engrave Coverage": ("engrave", "src/node/core/runtime/weaves/engrave.ts"),
            "War Room Coverage": ("blackboard", "src/node/core/blackboard_manager.ts"),
        }
        test_files = [str(path.relative_to(self.root)).lower() for path in (self.root / "tests").rglob("*") if path.is_file()]
        for pillar, (needle, target) in focused_test_patterns.items():
            if not any(needle in path for path in test_files):
                self._add_finding(
                    pillar,
                    target,
                    f"Missing Focused Test: no test file name under tests/ contains `{needle}` for this new refactor surface.",
                )

        semantic_test = self.root / "tests" / "empire_tests" / "test_pennyone_phase3_semantic.ts"
        if semantic_test.exists():
            content = semantic_test.read_text(encoding="utf-8", errors="ignore")
            if "fs.writeFileSync(fileA, 'import { SharedLogic } from  './integration_test_b.js';" in content:
                self._add_finding(
                    "PennyOne Semantic Coverage",
                    str(semantic_test.relative_to(self.root)),
                    "Broken Test Syntax: nested single quotes make the semantic empire test fail to transform before assertions run.",
                )

        self.stats["refactor_integrity"] = len(self.findings) - start

    def resolve_findings(self):
        SovereignHUD.persona_log(
            "WARN",
            "--resolve is deprecated. Level 5 Diagnostic is report-only and will not mutate hooks, manifests, or settings.",
        )

    def _write_report(self, out_json: Path, out_md: Path):
        by_pillar = defaultdict(list)
        for finding in self.findings:
            by_pillar[finding.get("pillar", "Unknown")].append(finding)

        lines = [
            "# Level 5 Diagnostic Report",
            "",
            f"- Root: `{self.root}`",
            f"- Files scanned: {self.stats['scanned']}",
            f"- Legacy drift findings: {self.stats['legacy_drift']}",
            f"- Linscott breaches: {self.stats['linscott_breaches']}",
            f"- Complexity warnings: {self.stats['complexity_warnings']}",
            f"- Integrity breaches: {self.stats.get('integrity_breaches', 0)}",
            f"- Refactor integrity findings: {self.stats.get('refactor_integrity', 0)}",
            "",
            "## Findings",
            "",
        ]

        if not self.findings:
            lines.append("No findings detected.")
        else:
            for pillar in sorted(by_pillar):
                entries = by_pillar[pillar]
                lines.extend([f"### {pillar}", ""])
                for entry in entries:
                    lines.append(f"- `{entry.get('file', '<unknown>')}`")
                    for issue in entry.get("issues", []):
                        lines.append(f"  - {issue}")
                lines.append("")

        out_json.write_text(json.dumps(self.findings, indent=2), encoding="utf-8")
        out_md.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    def run(self, resolve=False):
        SovereignHUD.persona_log("INFO", "LEVEL 5 DIAGNOSTIC: Scanning the Estate (Core Only)...")

        # Aggressive exclusion of non-core folders
        excludes = [
            ".venv", "node_modules", ".git", "__pycache__", "dist", "build",
            "coverage", ".quarto", "skills_db", "docs", "bin", "site_libs",
            "quarto-html", "gogcli", "logs", ".stats", ".tmp", "docs/legacy_archive"
        ]

        # Only scan these core functional areas
        core_prefixes = ["src/", ".agents/skills/", "scripts/"]

        for ext in ["*.py", "*.ts", "*.js"]:
            for path in self.root.rglob(ext):
                rel_parts = path.relative_to(self.root).parts
                rel_str = str(path.relative_to(self.root)).replace("\\", "/")

                # Filter by exclusion list
                if any(ex in rel_parts for ex in excludes):
                    continue

                # Only include root files (like cstar.ts) or files in core prefixes
                is_core = any(rel_str.startswith(p) for p in core_prefixes) or len(rel_parts) == 1
                if not is_core:
                    continue

                self.stats["scanned"] += 1
                pillar = self._categorize_pillar(path)
                file_findings = []

                try:
                    content = path.read_text(encoding="utf-8")
                except Exception:
                    continue

                lines = len(content.splitlines())
                if lines > 400:
                    file_findings.append(f"File weight critical ({lines} lines).")
                    self.stats["complexity_warnings"] += 1

                if pillar == "Legacy Daemons (Sentinels)":
                    base_name = path.stem.lower()
                    mapped_skill = "ravens" if base_name in ["muninn", "main_loop"] else base_name
                    if mapped_skill in self.active_skills:
                        file_findings.append(f"Legacy Drift: Daemon overlaps with `.agents/skills/{mapped_skill}`.")
                        self.stats["legacy_drift"] += 1

                if pillar != "Tests (Linscott/Empire)" and not path.name.startswith("test_") and not path.name.endswith(".d.ts"):
                    if not self._has_test(path):
                        file_findings.append("Linscott Breach: Missing 1:1 unit test.")
                        self.stats["linscott_breaches"] += 1

                for term in ["Hermes", "Python Dispatcher Monolith", "Phase 1"]:
                    if re.search(r'\b' + re.escape(term) + r'\b', content, re.IGNORECASE):
                        file_findings.append(f"Textual Rot: Mentions outdated concept '{term}'.")

                if file_findings:
                    self.findings.append({
                        "pillar": pillar,
                        "file": str(path.relative_to(self.root)),
                        "issues": file_findings
                    })

        # Run Runtime Integrity Pulse
        self._check_runtime_integrity()
        self._check_refactor_integrity()

        if resolve:
            self.resolve_findings()

        SovereignHUD.box_top("LEVEL 5 SCAN COMPLETE")
        SovereignHUD.box_row("Files Scanned", str(self.stats["scanned"]))
        SovereignHUD.box_row("Legacy Drift", str(self.stats["legacy_drift"]), SovereignHUD.RED if self.stats["legacy_drift"] > 0 else SovereignHUD.GREEN)
        SovereignHUD.box_row("Linscott Breaches", str(self.stats["linscott_breaches"]), SovereignHUD.RED if self.stats["linscott_breaches"] > 0 else SovereignHUD.GREEN)
        SovereignHUD.box_row("Integrity Pulse", str(self.stats.get("integrity_breaches", 0)), SovereignHUD.RED if self.stats.get("integrity_breaches", 0) > 0 else SovereignHUD.GREEN)
        SovereignHUD.box_row("Refactor Integrity", str(self.stats.get("refactor_integrity", 0)), SovereignHUD.RED if self.stats.get("refactor_integrity", 0) > 0 else SovereignHUD.GREEN)
        SovereignHUD.box_bottom()

        out_path = self.root / "LEVEL_5_DIAGNOSTIC_FINDINGS.json"
        report_path = self.root / "LEVEL_5_DIAGNOSTIC_REPORT.md"
        self._write_report(out_path, report_path)
        SovereignHUD.persona_log("SUCCESS", f"Findings exported to {out_path.name} and {report_path.name}")
        SovereignHUD.persona_log(
            "INFO",
            "Review findings and create Hall beads through the active host-native workflow. No shell chant handoff emitted.",
        )

def main():
    resolve = "--resolve" in sys.argv
    diag = Level5Diagnostic(PROJECT_ROOT)
    diag.run(resolve=resolve)

if __name__ == "__main__":
    main()
