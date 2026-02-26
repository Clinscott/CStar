import os
import re
import sys

# Import SovereignHUD from sv_engine if available, else mock it
try:
    from sv_engine import SovereignHUD
except ImportError:
    class SovereignHUD:
        RED = "\033[31m"
        GREEN = "\033[32m"
        YELLOW = "\033[33m"
        RESET = "\033[0m"
        BOLD = "\033[1m"
        CYAN = "\033[36m"
        
        @staticmethod
        def box_top(title): print(f"--- {title} ---")
        @staticmethod
        def box_row(l, v, c): print(f"{l}: {v}")
        @staticmethod
        def box_bottom(): print("------")

class SecurityScanner:
    RISK_VECTORS = {
        "PROMPT_INJECTION": [
            (r"ignore previous instructions", 10),
            (r"system override", 10),
            (r"you are not", 5),
            (r"delete all files", 10),
        ],
        "DANGEROUS_CODE": [
            (r"os\.system\(", 10),
            (r"subprocess\.call\(", 8),
            (r"shutil\.rmtree\(", 10),
            (r"eval\(", 10),
            (r"exec\(", 10),
            (r"__import__\(", 9),
        ]
    }

    def __init__(self, file_path):
        self.path = file_path
        self.content = ""
        self.threat_score = 0
        self.findings = []
    
    def scan(self):
        if not os.path.exists(self.path):
            return False, ["File not found"]
        
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                self.content = f.read()
        except Exception as e:
            return False, [f"Read Error: {str(e)}"]

        # Run Checks
        is_internal = "scripts" in self.path and ".agent" in self.path
        
        for category, patterns in self.RISK_VECTORS.items():
            for pattern, weight in patterns:
                matches = re.finditer(pattern, self.content, re.IGNORECASE)
                for m in matches:
                    # Internal tools are allowed to delete files (like quarantine)
                    if is_internal and "rmtree" in pattern:
                        continue
                        
                    self.threat_score += weight
                    self.findings.append(f"[{category}] Detected '{pattern}' (Risk: {weight})")

        return self.threat_score < 5, self.findings

    def report(self):
        title = "🛡️  HEIMDALL SECURITY SCAN  🛡️"
        if SovereignHUD.PERSONA == "ALFRED":
            title = "🦇  WAYNETECH SECURITY SCAN  🦇"
            
        SovereignHUD.box_top(title)
        SovereignHUD.box_row("TARGET", os.path.basename(self.path), SovereignHUD.CYAN)
        
        color = SovereignHUD.GREEN
        status = "CLEAN"
        if self.threat_score > 0: 
            color = SovereignHUD.YELLOW
            status = "WARNING"
        if self.threat_score >= 10: 
            color = SovereignHUD.RED
            status = "CRITICAL THREAT"

        SovereignHUD.box_row("THREAT LEVEL", f"{self.threat_score}/10", color)
        SovereignHUD.box_row("STATUS", status, color)
        
        if self.findings:
            print(f"{SovereignHUD.YELLOW}>> DETECTED THREATS:{SovereignHUD.RESET}")
            for f in self.findings:
                print(f"   - {SovereignHUD.RED}{f}{SovereignHUD.RESET}")
        
        SovereignHUD.box_bottom()
        return self.threat_score

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python security_scan.py <file_path>")
        sys.exit(1)
    
    scanner = SecurityScanner(sys.argv[1])
    score = scanner.scan()
    scanner.report()
    
    # Exit Code: 0 = Safe, 1 = Warning, 2 = Critical
    if scanner.threat_score >= 10: sys.exit(2)
    if scanner.threat_score > 0: sys.exit(1)
    sys.exit(0)
