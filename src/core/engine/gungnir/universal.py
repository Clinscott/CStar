import ast
import re
from typing import Any

from src.core.engine.gungnir.schema import (
    GUNGNIR_SCORE_MAX,
    GUNGNIR_SCORE_MIN,
    build_gungnir_matrix,
    matrix_to_dict,
)


SUPPORTED_EXTENSIONS = frozenset({
    ".css",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".py",
    ".qmd",
    ".scss",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
})


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
        ext = self._normalize_extension(ext)

        if ext in ('.py', '.ts', '.js', '.tsx', '.jsx'):
            breaches.extend(self._audit_logic_rules(code, ext))
        elif ext in ('.css', '.scss'):
            breaches.extend(self._audit_style_rules(code, ext))
        elif ext in ('.json', '.yaml', '.yml'):
            breaches.extend(self._audit_data_rules(code, ext))
        elif ext in ('.md', '.qmd'):
            breaches.extend(self._audit_structure_rules(code, ext))

        return breaches

    def score_matrix(self, code: str, ext: str) -> dict[str, Any]:
        breaches = self.audit_logic(code, ext)
        logic = GUNGNIR_SCORE_MAX
        style = GUNGNIR_SCORE_MAX
        intel = GUNGNIR_SCORE_MAX
        evolution = GUNGNIR_SCORE_MAX
        anomaly = GUNGNIR_SCORE_MIN

        severity_penalty = {
            "LOW": 0.5,
            "MEDIUM": 1.5,
            "HIGH": 2.5,
            "CRITICAL": 4.0,
        }

        for breach in breaches:
            penalty = severity_penalty.get(str(breach.get("severity", "")).upper(), 1.0)
            action = str(breach.get("action", "")).upper()
            if "LOGIC" in action or "COUPLING" in action or "PARSE" in action:
                logic = max(GUNGNIR_SCORE_MIN, logic - penalty)
            if "STYLE" in action or "UI" in action:
                style = max(GUNGNIR_SCORE_MIN, style - penalty)
            if "INTEL" in action or "DOCS" in action or "DATA" in action:
                intel = max(GUNGNIR_SCORE_MIN, intel - penalty)
            evolution = max(GUNGNIR_SCORE_MIN, evolution - (penalty * 0.25))
            if str(breach.get("severity", "")).upper() == "CRITICAL":
                anomaly += 1.0

        matrix = build_gungnir_matrix({
            "logic": logic,
            "style": style,
            "intel": intel,
            "gravity": GUNGNIR_SCORE_MIN,
            "vigil": GUNGNIR_SCORE_MAX,
            "evolution": evolution,
            "anomaly": anomaly,
            "sovereignty": max(
                GUNGNIR_SCORE_MIN,
                min(
                    GUNGNIR_SCORE_MAX,
                    (logic + style + intel + evolution) / 4,
                ),
            ),
        })
        return matrix_to_dict(matrix)

    @staticmethod
    def _normalize_extension(ext: str) -> str:
        normalized_ext = ext.lower()
        if normalized_ext not in SUPPORTED_EXTENSIONS:
            supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
            raise ValueError(
                f"Unsupported Gungnir file extension {ext!r}. Supported extensions: {supported}"
            )
        return normalized_ext

    def _audit_logic_rules(self, code: str, ext: str) -> list[dict[str, Any]]:
        breaches = []

        if ext == '.py':
            try:
                tree = ast.parse(code)
                
                # 1. Logic [L] & Stability [T]: Complexity analysis
                import radon.complexity as cc
                results = cc.cc_visit(code)
                avg_cc = sum(r.complexity for r in results) / len(results) if results else 1
                if avg_cc > 15:
                    breaches.append({"severity": "HIGH", "action": f"GUNGNIR_LOGIC_BREACH: High Complexity ({avg_cc:.1f}). Refactor God Methods."})
                
                # 2. Coupling [C]: Import counting
                imports = [node for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))]
                if len(imports) > 10:
                    breaches.append({"severity": "MEDIUM", "action": f"GUNGNIR_COUPLING_BREACH: Over-entangled ({len(imports)} imports). Isolate dependencies."})

                # 3. Intel [I]: Docstring/Comment ratio
                lines = code.split('\n')
                total_lines = len(lines)
                doc_lines = sum(1 for line in lines if line.strip().startswith(('#', '\"\"\"', '\'\'\'')))
                if total_lines > 20 and (doc_lines / total_lines) < 0.15:
                    breaches.append({"severity": "MEDIUM", "action": f"GUNGNIR_INTEL_BREACH: Low documentation ratio ({doc_lines/total_lines:.2f}). Add intents/docstrings."})

                # 4. Balance [B]: Detect top-heavy setup versus execution
                for node in [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:
                    setup_steps = sum(isinstance(stmt, (ast.Assign, ast.AnnAssign, ast.AugAssign)) for stmt in node.body)
                    execution_steps = sum(isinstance(stmt, (ast.Return, ast.Expr, ast.Raise, ast.Yield, ast.YieldFrom)) for stmt in node.body)
                    if execution_steps and setup_steps / execution_steps > 1.7:
                        breaches.append({
                            "severity": "MEDIUM",
                            "action": f"GUNGNIR_LOGIC_BREACH: top-heavy setup detected ({setup_steps/execution_steps:.1f}). Reduce preamble before execution."
                        })
                        break

                # 5. Style [S]: Claustrophobia check
                consecutive = 0
                for line in lines:
                    if line.strip() and not line.strip().startswith('#'):
                        consecutive += 1
                        if consecutive > 12:
                            breaches.append({"severity": "LOW", "action": "GUNGNIR_STYLE_BREACH: Claustrophobic code block (>12 lines)."})
                            break
                    else:
                        consecutive = 0

            except Exception as e:
                breaches.append({"severity": "CRITICAL", "action": f"GUNGNIR_PARSE_ERROR: {e}"})

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
