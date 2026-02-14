import ast
import os
import re
import sys

try:
    from sv_engine import HUD
except ImportError:
    class HUD:
        RED, GREEN, YELLOW, RESET, BOLD, CYAN = "\033[31m", "\033[32m", "\033[33m", "\033[0m", "\033[1m", "\033[36m"
        @staticmethod
        def box_top(t): print(f"--- {t} ---")
        @staticmethod
        def box_row(l, v, c): print(f"{l}: {v}")
        @staticmethod
        def box_bottom(): print("------")

class SecurityScanner:
    RISK_VECTORS = {
        "PROMPT_INJECTION": [(r"\bignore previous instructions\b", 10), (r"\bsystem override\b", 10)],
        "DANGEROUS_CODE": [(r"\bos\.system\(", 10), (r"\bsubprocess\.call\(", 8), (r"\bshutil\.rmtree\(", 10), (r"\beval\(", 10), (r"\bexec\(", 10)]
    }
    MAX_FILE_SIZE_MB = 10

    def __init__(self, file_path) -> None:
        self.path, self.content, self.threat_score, self.findings = file_path, "", 0, []

    def scan(self):
        """[ALFRED] Secure multi-layer scan with DoS and AST heuristics."""
        if not os.path.exists(self.path): return False, ["File not found"]
        try:
            if os.path.getsize(self.path) / 10**6 > self.MAX_FILE_SIZE_MB:
                self.threat_score = 20
                self.findings.append("[DoS] File too large")
                return False, self.findings
            with open(self.path, 'r', encoding='utf-8') as f: self.content = f.read()
        except (IOError, OSError, PermissionError): return False, ["Read error"]

        self._regex_scan()
        if self.path.endswith(".py"): self._analyze_ast()
        elif self.path.endswith((".js", ".ts")): self._analyze_web_script()
        return self.threat_score < 5, self.findings

    def _analyze_web_script(self):
        """[ALFRED] Detect front-end specific risk vectors."""
        patterns = [
            (r"eval\(", 10, "JS-EVAL"),
            (r"innerHTML", 5, "XSS-VECTOR"),
            (r"localStorage", 3, "SENSITIVE-STORAGE"),
            (r"sessionStorage", 3, "SENSITIVE-STORAGE"),
            (r"dangerouslySetInnerHTML", 10, "REACT-XSS")
        ]
        for pat, weight, cat in patterns:
            if re.search(pat, self.content):
                self.threat_score += weight
                self.findings.append(f"[{cat}] Detected '{pat}'")

    def _regex_scan(self):
        is_internal = "scripts" in self.path and ".agent" in self.path
        for cat, patterns in self.RISK_VECTORS.items():
            for pat, weight in patterns:
                if re.search(pat, self.content, re.IGNORECASE):
                    if is_internal and ("rmtree" in pat or "os.system" in pat): continue
                    self.threat_score += weight
                    self.findings.append(f"[{cat}] Detected '{pat}'")

    def _analyze_ast(self):
        try:
            tree = ast.parse(self.content)
            for node in ast.walk(tree):
                if isinstance(node, (ast.Import, ast.ImportFrom)): self._scan_imports(node)
                elif isinstance(node, ast.Constant): self._scan_constants(node)
        except SyntaxError as e:
            self.threat_score += 15
            self.findings.append(f"[MALFORMED] Syntax: {str(e)}")
        except (SyntaxError, ValueError): pass

    def _scan_imports(self, node):
        net, dang = {"requests", "urllib", "socket", "http"}, {"ctypes", "pickle", "base64"}
        names = [n.name for n in node.names] if isinstance(node, ast.Import) else [node.module]
        for name in names:
            if name in net:
                self.threat_score += 5
                self.findings.append(f"[NETWORK] '{name}' import")
            if name in dang:
                self.threat_score += 8
                self.findings.append(f"[DANGEROUS] '{name}' import")

    def _scan_constants(self, node):
        if isinstance(node.value, str):
            if len(node.value) > 200 and re.match(r'^[a-zA-Z0-9+/=]+$', node.value):
                self.threat_score += 5
                self.findings.append("[OBFUSCATION] Large base64 string")
            if "\\x" in node.value and len(node.value) > 50:
                self.threat_score += 5
                self.findings.append("[OBFUSCATION] High hex density")

    def report(self):
        HUD.box_top("🛡️  HEIMDALL SECURITY SCAN  🛡️")
        HUD.box_row("TARGET", os.path.basename(self.path), HUD.CYAN)
        c = HUD.RED if self.threat_score >= 10 else (HUD.YELLOW if self.threat_score > 0 else HUD.GREEN)
        HUD.box_row("THREAT LEVEL", f"{self.threat_score}/10", c)
        for f in self.findings: print(f"   - {HUD.RED}{f}{HUD.RESET}")
        HUD.box_bottom()
        return self.threat_score

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(1)
    s = SecurityScanner(sys.argv[1])
    s.scan(); s.report()
    sys.exit(2 if s.threat_score >= 10 else (1 if s.threat_score > 0 else 0))