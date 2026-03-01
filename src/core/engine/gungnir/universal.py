import ast
import re
from typing import Any


class UniversalGungnir:
    """
    Universal Aesthetic Calculus Engine.
    Implements Birkhoff's Measure (M = O / C) across C* domains.
    V5: Returns structured audit reports for Forge integration.
    """

    def audit(self, code_string: str, file_ext: str) -> list[str]:
        """Audits code and returns a list of aesthetic breach messages (strings)."""
        report = self.audit_logic(code_string, file_ext)
        return [b['action'] for b in report]

    def audit_logic(self, code: str, ext: str) -> list[dict[str, Any]]:
        """Structured audit for logic files (PY/TS/JS)."""
        breaches = []
        ext = ext.lower()

        if ext in ('.py', '.ts', '.js', '.tsx', '.jsx'):
            breaches.extend(self._audit_logic_rules(code, ext))
        elif ext in ('.css', '.scss'):
            breaches.extend(self._audit_style_rules(code, ext))
        elif ext in ('.json', '.yaml', '.yml'):
            breaches.extend(self._audit_data_rules(code, ext))
        elif ext in ('.md', '.qmd'):
            breaches.extend(self._audit_structure_rules(code, ext))

        return breaches

    def _audit_logic_rules(self, code: str, ext: str) -> list[dict[str, Any]]:
        breaches = []

        # Structure Check

        if ext == '.py':
            # Claustrophobia check
            consecutive = 0
            for line in code.split('\n'):
                if line.strip() and not line.strip().startswith('#'):
                    consecutive += 1
                    if consecutive > 12:
                        breaches.append({
                            "severity": "HIGH",
                            "action": "GUNGNIR_LOGIC_BREACH: Claustrophobic code block (>12 lines)."
                        })
                        break
                else:
                    consecutive = 0

            # Setup/Exec Ratio
            try:
                tree = ast.parse(code)
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        setup = sum(1 for child in node.body if isinstance(child, (ast.Assign, ast.AnnAssign)))
                        exec_n = sum(1 for child in node.body if not isinstance(child, (ast.Assign, ast.AnnAssign)))
                        if exec_n > 0 and (setup / exec_n) > 1.7:
                            breaches.append({
                                "severity": "HIGH",
                                "action": f"GUNGNIR_LOGIC_BREACH: Function '{node.name}' is top-heavy setup (Ratio: {setup/exec_n:.2f})."
                            })
            except Exception:
                pass

        elif ext in ('.tsx', '.jsx', '.ts', '.js'):
            elements = len(re.findall(r'<[a-zA-Z0-9]+', code))
            classes = re.findall(r'className=["\']([^"\']+)["\']', code)
            all_cls = [c for match in classes for c in match.split()]
            unique_cls = len(set(all_cls))
            C_ui = elements + unique_cls if (elements + unique_cls) > 0 else 1

            arbitrary_pixels = re.findall(r'-\[\d+px\]', code)
            if arbitrary_pixels:
                breaches.append({
                    "severity": "CRITICAL",
                    "action": f"GUNGNIR_UI_BREACH: Detection of arbitrary pixel sizes ({len(arbitrary_pixels)} counts). Use tokens."
                })

            symmetric_ops = {'flex', 'grid', 'justify-center', 'items-center', 'mx-auto', 'text-center'}
            O_ui = sum(5 for c in all_cls if c in symmetric_ops)

            if elements > 5 and (O_ui / C_ui) < 0.25:
                breaches.append({
                    "severity": "HIGH",
                    "action": f"GUNGNIR_UI_BREACH: Low Birkhoff Measure ({(O_ui/C_ui):.2f}). Increase symmetry."
                })

        return breaches

    def _audit_style_rules(self, code: str, ext: str) -> list[dict[str, Any]]:
        breaches = []
        selectors = len(re.findall(r'\}', code))
        properties = len(re.findall(r':\s*[^;]+;', code))
        C = selectors + properties if (selectors + properties) > 0 else 1
        vars_usage = len(re.findall(r'var\(|--', code))
        O = vars_usage * 3

        if C > 10 and (O / C) < 0.15:
            breaches.append({
                "severity": "MEDIUM",
                "action": f"GUNGNIR_STYLE_BREACH: Stylistic Dissonance (M={(O/C):.2f}). Use more CSS variables/tokens."
            })
        return breaches

    def _audit_data_rules(self, code: str, ext: str) -> list[dict[str, Any]]:
        breaches = []
        depth = 0
        max_depth = 0
        for char in code:
            if char in '{[': depth += 1
            elif char in '}]': depth -= 1
            if depth > max_depth: max_depth = depth

        if max_depth > 6:
            breaches.append({
                "severity": "HIGH",
                "action": f"GUNGNIR_DATA_BREACH: Excessive data nesting (Depth: {max_depth}). Refactor for readability."
            })
        return breaches

    def _audit_structure_rules(self, code: str, ext: str) -> list[dict[str, Any]]:
        breaches = []
        paras = len(re.findall(r'\n\n', code))
        C = len(code.split('\n')) + paras
        headers = len(re.findall(r'^#+ ', code, re.M))
        alerts = len(re.findall(r'^>\s*\[!', code, re.M))
        O = (headers * 10) + (alerts * 15)

        if C > 50 and (O / C) < 0.1:
            breaches.append({
                "severity": "MEDIUM",
                "action": f"GUNGNIR_DOCS_BREACH: Structure is too dense (M={(O/C):.2f}). Add more headers or alerts."
            })
        return breaches
