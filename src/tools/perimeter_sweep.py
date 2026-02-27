#!/usr/bin/env python3
"""
[ALFRED] The Perimeter Sweep
Identity: ALFRED
Purpose: Hygiene & Vulnerability Scanning.

Executes battle-tested CLI wrappers (npm audit, pip-audit) to check dependencies.
Sweeps the manor for lingering `.bak`, orphaned `.pid`, and old trace logs.

Outputs a report to .agent/perimeter_report.json.
"""

import argparse
import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Any

# Ensure UTF-8 output for box-drawing characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8')

project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

import contextlib

from src.core.sovereign_hud import SovereignHUD

# Configure Logging
logging.basicConfig(
    filename=str(project_root / "sovereign_activity.log"),
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

class PerimeterSweep:
    """
    Acts as a wrapper for standard security tools and performs hygiene sweeps.
    """

    def __init__(self, target_dir: str = ".", purge: bool = False):
        self.target_dir = Path(target_dir).resolve()
        self.purge = purge
        self.report_path = project_root / ".agent" / "perimeter_report.json"

        # Enforce ALFRED persona for this tool
        SovereignHUD.PERSONA = "ALFRED"

    def _run_pip_audit(self) -> dict[str, Any]:
        """Runs pip-audit to check for Python CVEs."""
        SovereignHUD.persona_log("INFO", "Executing pip-audit for Python dependencies...")
        report = {"status": "success", "vulnerabilities": 0, "details": []}

        try:
            # We use --format=json to parse the output reliably
            cmd = [sys.executable, "-m", "pip_audit", "-f", "json"]
            # To audit a requirements.txt if it exists instead of local environment:
            req_file = self.target_dir / "requirements.txt"
            if req_file.exists():
                 cmd.extend(["-r", str(req_file)])

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.stdout:
                try:
                    data = json.loads(result.stdout)
                    # pip-audit structure: list of dicts with 'name', 'version', 'vulns'
                    for pkg in data.get("dependencies", []):
                        if pkg.get("vulns"):
                            report["vulnerabilities"] += len(pkg["vulns"])
                            for vuln in pkg["vulns"]:
                                report["details"].append({
                                    "package": pkg["name"],
                                    "version": pkg["version"],
                                    "id": vuln.get("id"),
                                    "fix_versions": vuln.get("fix_versions", [])
                                })
                    if report["vulnerabilities"] > 0:
                        report["status"] = "vulnerable"
                except json.JSONDecodeError:
                     report["status"] = "error"
                     report["details"].append("JSON decoding failed for pip-audit")

            if result.returncode != 0 and report["vulnerabilities"] == 0:
                 # pip-audit returns non-zero if vulnerabilities are found,
                 # but could also return non-zero for actual execution errors.
                 pass

        except FileNotFoundError:
            report["status"] = "missing_tool"
            report["details"].append("pip-audit not installed. Run: pip install pip-audit")
        except Exception as e:
            report["status"] = "error"
            report["details"].append(str(e))

        return report

    def _run_npm_audit(self) -> dict[str, Any]:
        """Runs npm audit to check for JS CVEs."""
        SovereignHUD.persona_log("INFO", "Executing npm audit for Node.js dependencies...")
        report = {"status": "success", "vulnerabilities": 0, "details": []}

        if not (self.target_dir / "package.json").exists():
            report["status"] = "skipped"
            report["details"].append("No package.json found.")
            return report

        try:
            cmd = ["npm", "audit", "--json"]
            # Note: Windows requires shell=True for npm, or using npm.cmd
            result = subprocess.run(cmd, cwd=str(self.target_dir), capture_output=True, text=True, shell=(sys.platform == "win32"))

            if result.stdout:
                try:
                    data = json.loads(result.stdout)
                    metadata = data.get("metadata", {}).get("vulnerabilities", {})

                    total = sum(metadata.values()) if isinstance(metadata, dict) else 0
                    report["vulnerabilities"] = total

                    if total > 0:
                        report["status"] = "vulnerable"
                        vulnerabilities = data.get("vulnerabilities", {})
                        for pkg_name, detail in vulnerabilities.items():
                             report["details"].append({
                                 "package": pkg_name,
                                 "severity": detail.get("severity"),
                                 "via": detail.get("via", [])
                             })
                except json.JSONDecodeError:
                     report["status"] = "error"
                     report["details"].append("JSON decoding failed for npm audit")

        except FileNotFoundError:
            report["status"] = "missing_tool"
            report["details"].append("npm not found on system path.")
        except Exception as e:
            report["status"] = "error"
            report["details"].append(str(e))

        return report

    def _manor_cleanup(self) -> dict[str, Any]:
        """Sweeps for temporary, orphaned, or log files."""
        SovereignHUD.persona_log("INFO", "Sweeping the manor for temporary files...")
        report = {"status": "success", "files_found": 0, "purged": False, "details": []}

        targets = []

        # 1. Backups
        for ext in ["*.bak", "*.old", "*.tmp"]:
             targets.extend(self.target_dir.rglob(ext))

        # 2. Orphans
        agent_dir = self.target_dir / ".agent"
        if agent_dir.exists():
            # Check pids
            for pid_file in agent_dir.rglob("*.pid"):
                # Very basic check: just flag them for now if they are older than a day maybe?
                # Or just flag all pids for the user to see. Let's flag them.
                targets.append(pid_file)

        report["files_found"] = len(targets)

        for t in targets:
            report["details"].append(str(t.relative_to(project_root)))
            if self.purge:
                with contextlib.suppress(OSError):
                    t.unlink()

        if self.purge and targets:
            report["purged"] = True

        return report

    def analyze(self) -> dict[str, Any]:
        """Performs the comprehensive security sweep."""
        SovereignHUD.box_top("[A] THE PERIMETER SWEEP")
        SovereignHUD.box_row("SCAN AREA", str(self.target_dir), SovereignHUD.CYAN)
        SovereignHUD.box_row("PURGE MODE", "ACTIVE" if self.purge else "DISABLED", SovereignHUD.YELLOW if self.purge else SovereignHUD.GREEN)
        SovereignHUD.box_separator()

        results = {
            "pip_audit": self._run_pip_audit(),
            "npm_audit": self._run_npm_audit(),
            "cleanup": self._manor_cleanup()
        }

        self._write_report(results)
        self._render_report(results)
        return results

    def _write_report(self, results: dict[str, Any]) -> None:
        """Writes the sweep report to disk."""
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        report_data = {
            "timestamp": SovereignHUD._speak("timestamp", "Now"),
            "results": results
        }
        self.report_path.write_text(json.dumps(report_data, indent=4), encoding='utf-8')

    def _render_report(self, results: dict[str, Any]) -> None:
        """Displays the perimeter status in the SovereignHUD."""
        SovereignHUD.box_separator()
        SovereignHUD.box_row("PERIMETER SECURITY STATUS", "FINDINGS", SovereignHUD.CYAN)
        SovereignHUD.box_separator()

        # PIP Audit
        pip = results["pip_audit"]
        p_color = SovereignHUD.GREEN if pip["vulnerabilities"] == 0 else SovereignHUD.RED
        p_text = "SECURE" if pip["vulnerabilities"] == 0 else f"{pip['vulnerabilities']} CVEs"
        if pip["status"] == "missing_tool": p_text = "MISSING TOOL"
        SovereignHUD.box_row("Python Dependencies", p_text, p_color)

        if pip["vulnerabilities"] > 0:
             for d in pip["details"]:
                 SovereignHUD.box_row(f"  {d['package']}@{d['version']}", f"CVE: {d['id']}", SovereignHUD.RED, dim_label=True)

        # NPM Audit
        npm = results["npm_audit"]
        if npm["status"] != "skipped":
            n_color = SovereignHUD.GREEN if npm["vulnerabilities"] == 0 else SovereignHUD.RED
            n_text = "SECURE" if npm["vulnerabilities"] == 0 else f"{npm['vulnerabilities']} CVEs"
            if npm["status"] == "missing_tool": n_text = "MISSING TOOL"
            SovereignHUD.box_row("Node.js Dependencies", n_text, n_color)

            if npm["vulnerabilities"] > 0:
                 for d in npm["details"][:3]: # Cap output
                     via = d['via'][0] if d.get('via') and isinstance(d['via'], list) else 'Unknown'
                     SovereignHUD.box_row(f"  {d['package']}", f"Sev: {d.get('severity', 'N/A')} ({via})", SovereignHUD.RED, dim_label=True)
                 if len(npm["details"]) > 3:
                     SovereignHUD.box_row("  ...", f"+ {len(npm['details']) - 3} more", dim_label=True)

        # Cleanup
        cln = results["cleanup"]
        c_color = SovereignHUD.GREEN if cln["files_found"] == 0 else SovereignHUD.YELLOW
        c_text = "IMMACULATE" if cln["files_found"] == 0 else f"{cln['files_found']} orphans"
        if cln["purged"]: c_text += " (PURGED)"
        SovereignHUD.box_row("Manor Hygiene", c_text, c_color)

        SovereignHUD.box_separator()
        if (pip["vulnerabilities"] == 0 and
            (npm["status"] == "skipped" or npm["vulnerabilities"] == 0) and
            cln["files_found"] == 0):
            SovereignHUD.box_row("STATUS", "The perimeter is secure, sir.", SovereignHUD.GREEN)
        else:
            SovereignHUD.box_row("STATUS", "Anomalies detected in the perimeter.", SovereignHUD.YELLOW)

        SovereignHUD.box_bottom()


def main() -> int | None:
    parser = argparse.ArgumentParser(description="The Perimeter Sweep - Security & Hygiene")
    parser.add_argument("target", nargs="?", default=".", help="Target directory to scan")
    parser.add_argument("--purge", action="store_true", help="Automatically delete found temporary files")
    args = parser.parse_args()

    sweep = PerimeterSweep(target_dir=args.target, purge=args.purge)
    try:
        sweep.analyze()
        return 0
    except KeyboardInterrupt:
        SovereignHUD.persona_log("WARN", "Sweep aborted by user.")
        return 1
    except Exception as e:
        SovereignHUD.persona_log("ERROR", f"Sweep failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
