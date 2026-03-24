"""
[O.D.I.N. / A.L.F.R.E.D. UTILITY]
Command: cstar unblock <file>
Removes the BLOCKED_STUCK status from a file in the Tech Debt Ledger so Muninn can attempt repair again.
"""
import json
import sys
from pathlib import Path
from src.core.sovereign_hud import SovereignHUD

def main():
    if len(sys.argv) < 2:
        SovereignHUD.persona_log("ERROR", "Provide a file path to unblock. Example: cstar unblock src/core/main.py")
        sys.exit(1)
        
    target_file = sys.argv[1].replace("\\", "/")
    
    # Path configuration for the Ledger
    ledger_path = Path(".agents/tech_debt_ledger.json")
    if not ledger_path.exists():
        SovereignHUD.persona_log("WARN", "No Tech Debt Ledger found at .agents/tech_debt_ledger.json")
        sys.exit(0)
        
    try:
        data = json.loads(ledger_path.read_text(encoding="utf-8"))
        targets = data.get("top_targets", [])
        
        found = False
        for target in targets:
            if target.get("file") == target_file:
                if target.get("status") == "BLOCKED_STUCK":
                    target["status"] = "ACTIVE"
                    # Remove the appended system error text
                    justification = target.get("justification", "")
                    if "[SYSTEM ERROR:" in justification:
                        target["justification"] = justification.split("[SYSTEM ERROR:")[0].strip()
                    found = True
                    break
                else:
                    SovereignHUD.persona_log("INFO", f"File '{target_file}' is already {target.get('status')}.")
                    sys.exit(0)
                    
        if found:
            ledger_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            SovereignHUD.persona_log("SUCCESS", f"File '{target_file}' unblocked. Muninn will resume repairs.")
        else:
            SovereignHUD.persona_log("WARN", f"File '{target_file}' not found in the Ledger.")
            
    except Exception as e:
        SovereignHUD.persona_log("ERROR", f"Failed to modify Tech Debt Ledger: {e}")
        sys.exit(1)
        
if __name__ == "__main__":
    main()
