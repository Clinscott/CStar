"""
Code Sentinel - Structural Integrity Scanner.
[Ω] HEIMDALL'S VIGIL / [ALFRED] THE PERIMETER
"""
import argparse
import ast
import json
import os
import subprocess
import sys

# Ensure UTF-8 output for box-drawing characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8')

# Add script directory to path to allow imports from common script directory
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    from ui import HUD
except ImportError:
    # Minimal fallback if ui.py is not reachable or in-path
    class HUD:
        RED = "\033[31m"
        GREEN = "\033[32m"
        YELLOW = "\033[33m"
        CYAN = "\033[36m"
        RESET = "\033[0m"
        BOLD = "\033[1m"
        PERSONA = "ALFRED"
        @staticmethod
        def box_top(t): print(f"--- {t} ---")
        @staticmethod
        def box_row(l, v, c=None, dim_label=False): print(f"{l}: {v}")
        @staticmethod
        def box_separator(): print("-" * 20)
        @staticmethod
        def box_bottom(): print("-" * 20)
        @staticmethod
        def _get_theme(): return {"main": "\033[36m", "dim": "\033[90m"}

TEXT_MAP = {
    "ODIN": {
        "TITLE": "[Ω] HEIMDALL SECURITY SCAN",
        "PASS": "SECTOR SECURE. NO ANOMALIES.",
        "FAIL": "CONTAINMENT BREACH DETECTED.",
        "SCAN_TARGET": "TARGET SECTOR",
        "VIOLATIONS": "ANOMALIES",
        "V_PREFIX": "[!] BREACH",
        "STRUCT_CODE": "STRUCT-001"
    },
    "ALFRED": {
        "TITLE": "[A] THE PERIMETER SCAN",
        "PASS": "The manor is immaculate, sir.",
        "FAIL": "I found some items out of place, sir.",
        "SCAN_TARGET": "SCAN AREA",
        "VIOLATIONS": "FINDINGS",
        "V_PREFIX": "[i] NOTE",
        "STRUCT_CODE": "HOUSEKEEP-01"
    }
}

class HeimdallScanner:
    """AST-based structural enforcer."""

    @staticmethod
    def scan_file(filepath: str) -> list[dict]:
        """Scan for orphaned top-level functions."""
        if not filepath.endswith(".py") or not os.path.isfile(filepath):
            return []

        violations = []
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                lines = f.readlines()
                content = "".join(lines)
            
            tree = ast.parse(content)
        except Exception as e:
            return [{"code": "SYNTAX", "filename": filepath, "location": {"row": 1, "column": 0}, "message": str(e), "severity": "CRITICAL"}]

        persona = HUD.PERSONA if HUD.PERSONA in TEXT_MAP else "ALFRED"
        v_code = TEXT_MAP[persona]["STRUCT_CODE"]

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Skip main entry point and private helpers
                if node.name == "main" or node.name.startswith("_"):
                    continue

                # Skip explicitly ignored functions
                def_line = lines[node.lineno - 1]
                if "@sentinel: ignore" in def_line:
                    continue

                violations.append({
                    "code": v_code,
                    "filename": filepath,
                    "location": {"row": node.lineno, "column": node.col_offset},
                    "message": f"Orphaned Function '{node.name}'. Logic must be encapsulated in Class or Privatized (_).",
                    "severity": "CRITICAL"
                })
        
        return violations

def run_ruff(target: str = ".", fix: bool = False) -> list[dict]:
    """[ALFRED] Execute ruff check with robust error handling and binary detection."""
    cmd = [sys.executable, "-m", "ruff", "check", target, "--output-format=json"]

    # Locate ruff.toml relative to this script
    script_parent = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    config_path = os.path.join(script_parent, "ruff.toml")

    if os.path.exists(config_path):
        cmd.extend(["--config", config_path])

    if fix:
        cmd.append("--fix")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if not result.stdout.strip():
            # If ruff found errors but stderr is the only thing with data, something is wrong
            if result.stderr and "error:" in result.stderr.lower():
                HUD.box_row("RUFF ERROR", result.stderr.splitlines()[0][:50], HUD.RED)
            return []

        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return []
            
    except FileNotFoundError:
        HUD.log("WARN", "Sentinel Briefing", "Ruff binary not found. Style scan skipped.")
        return []
    except subprocess.TimeoutExpired:
        HUD.log("WARN", "Sentinel Briefing", "Ruff scan timed out. Performance bottleneck detected.")
        return []
    except Exception as e:
        HUD.log("FAIL", "Sentinel Error", str(e))
        return []

def format_results(violations: list[dict], target: str, fixed: bool = False) -> None:
    """Display violations with HUD theming."""
    persona = HUD.PERSONA if HUD.PERSONA in TEXT_MAP else "ALFRED"
    text = TEXT_MAP[persona]
    
    HUD.box_top(text["TITLE"])
    HUD.box_row(text["SCAN_TARGET"], target, HUD.CYAN)

    if fixed:
        HUD.box_row("ACTION", "REPAIR ATTEMPTED (--fix)", HUD.YELLOW)

    HUD.box_row(text["VIOLATIONS"], str(len(violations)), HUD.RED if violations else HUD.GREEN)

    if violations:
        HUD.box_separator()
        # Cap at 15 for readability
        for v in violations[:15]:
            filename = os.path.basename(v['filename'])
            row = v['location']['row']
            col = v['location']['column']
            loc = f"{filename}:{row}:{col}"

            # Use color based on severity
            severity = v.get('severity', '')
            color = HUD.RED if ("Error" in severity or "CRITICAL" in severity) else HUD.YELLOW
            
            prefix = text["V_PREFIX"]
            HUD.box_row(f"{prefix} {v['code']}", f"{loc} - {v['message'][:50]}...", color, dim_label=True)

        if len(violations) > 15:
            HUD.box_row("...", f"+ {len(violations) - 15} more findings", dim_label=True)
    else:
        HUD.box_row("STATUS", text["PASS"], HUD.GREEN)

    HUD.box_bottom()

def main():
    parser = argparse.ArgumentParser(description="Corvus Star Code Sentinel (Structural Linter)")
    parser.add_argument("target", nargs="?", default=".", help="Target file or directory to scan")
    parser.add_argument("--fix", action="store_true", help="Attempt to automatically fix violations")
    parser.add_argument("--persona", choices=["ODIN", "ALFRED"], help="Override active persona")

    args = parser.parse_args()

    if args.persona:
        HUD.PERSONA = args.persona
    else:
        # Try to load from config.json
        script_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # .agent
        config_path = os.path.join(script_parent, "config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path) as f:
                    config = json.load(f)
                    HUD.PERSONA = config.get("Persona", "ALFRED").upper()
                    if HUD.PERSONA == "GOD": HUD.PERSONA = "ODIN"
            except:
                pass

    # Run Ruff (Style/Lint)
    violations = run_ruff(args.target, args.fix)
    
    # Run Heimdall (Structure)
    if os.path.isfile(args.target):
        violations.extend(HeimdallScanner.scan_file(args.target))
    elif os.path.isdir(args.target):
        for root, _, files in os.walk(args.target):
            for file in files:
                if file.endswith(".py"):
                    violations.extend(HeimdallScanner.scan_file(os.path.join(root, file)))

    format_results(violations, args.target, args.fix)
    
    if violations:
        sys.exit(1)

if __name__ == "__main__":
    main()
