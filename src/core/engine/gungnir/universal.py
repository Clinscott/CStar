import ast
import re


class UniversalGungnir:
    """
    Universal Aesthetic Calculus Engine.
    Implements Birkhoff's Measure (M = O / C) across C* domains.
    """

    @staticmethod
    def audit(code_string: str, file_ext: str) -> list[str]:
        """Audits code and returns a list of aesthetic breaches."""
        ext = file_ext.lower()
        if ext in ('.py', '.ts', '.js', '.tsx', '.jsx'):
            return UniversalGungnir._audit_logic(code_string, ext)
        elif ext in ('.css', '.scss'):
            return UniversalGungnir._audit_style(code_string, ext)
        elif ext in ('.json', '.yaml', '.yml'):
            return UniversalGungnir._audit_data(code_string, ext)
        elif ext in ('.md', '.qmd'):
            return UniversalGungnir._audit_structure(code_string, ext)
        return []

    @staticmethod
    def _audit_logic(code: str, ext: str) -> list[str]:
        breaches = []

        # 1. Complexity (C)
        lines = [l for l in code.split('\n') if l.strip()]
        C = len(lines)
        if C == 0: C = 1

        # 2. Order (O)
        O = 0
        # Symmetry: Proper indentation & docstrings/comments
        comments = len(re.findall(r'(#|//|/\*|""")', code))
        O += min(comments * 5, C // 2) # Reward documentation up to a limit

        # Structure Check
        if ext == '.py':
            # Claustrophobia check
            consecutive = 0
            for line in code.split('\n'):
                if line.strip() and not line.strip().startswith('#'):
                    consecutive += 1
                    if consecutive > 12:
                        breaches.append("GUNGNIR_LOGIC_BREACH: Claustrophobic code block (>12 lines).")
                        break
                else: consecutive = 0

            # Setup/Exec Ratio
            try:
                tree = ast.parse(code)
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        # Setup: Assignments at the top of the function
                        setup = sum(1 for child in node.body if isinstance(child, (ast.Assign, ast.AnnAssign)))
                        exec_n = sum(1 for child in node.body if not isinstance(child, (ast.Assign, ast.AnnAssign)))
                        # [Ω] The Linscott Standard: Setup ratio > 1.7 triggers a breach.
                        if exec_n > 0 and (setup / exec_n) > 1.7:
                            breaches.append(f"GUNGNIR_LOGIC_BREACH: Function '{node.name}' is top-heavy setup (Ratio: {setup/exec_n:.2f}).")
            except: pass

        elif ext in ('.tsx', '.jsx', '.ts', '.js'):
            # Birkhoff for React/UI Elements
            elements = len(re.findall(r'<[a-zA-Z0-9]+', code))
            classes = re.findall(r'className=["\']([^"\']+)["\']', code)
            all_cls = [c for match in classes for c in match.split()]
            unique_cls = len(set(all_cls))
            C_ui = elements + unique_cls if (elements + unique_cls) > 0 else 1

            # Arbitrary Pixel Check (Tailwind anti-pattern)
            arbitrary_pixels = re.findall(r'-\[\d+px\]', code)
            if arbitrary_pixels:
                breaches.append(f"GUNGNIR_UI_BREACH: Detection of arbitrary pixel sizes ({len(arbitrary_pixels)} counts). Use tokens.")

            # Reward symmetry in classes
            symmetric_ops = {'flex', 'grid', 'justify-center', 'items-center', 'mx-auto', 'text-center'}
            O_ui = sum(5 for c in all_cls if c in symmetric_ops)

            if elements > 5 and (O_ui / C_ui) < 0.25:
                breaches.append(f"GUNGNIR_UI_BREACH: Low Birkhoff Measure ({(O_ui/C_ui):.2f}). Increase symmetry.")

        return breaches

    @staticmethod
    def _audit_style(code: str, ext: str) -> list[str]:
        breaches = []
        # C = Selective Complexity + Property count
        selectors = len(re.findall(r'\}', code))
        properties = len(re.findall(r':\s*[^;]+;', code))
        C = selectors + properties if (selectors + properties) > 0 else 1

        # O = Variable usage + Grouping
        vars_usage = len(re.findall(r'var\(|--', code))
        O = vars_usage * 3

        if C > 10 and (O / C) < 0.15:
            breaches.append(f"GUNGNIR_STYLE_BREACH: Stylistic Dissonance (M={(O/C):.2f}). Use more CSS variables/tokens.")

        return breaches

    @staticmethod
    def _audit_data(code: str, ext: str) -> list[str]:
        breaches = []
        # C = Nesting depth + Key count
        depth = 0
        max_depth = 0
        for char in code:
            if char in '{[': depth += 1
            elif char in '}]': depth -= 1
            if depth > max_depth: max_depth = depth

        if max_depth > 6:
            breaches.append(f"GUNGNIR_DATA_BREACH: Excessive data nesting (Depth: {max_depth}). Refactor for readability.")

        return breaches

    @staticmethod
    def _audit_structure(code: str, ext: str) -> list[str]:
        breaches = []
        # C = Raw length + Para count
        paras = len(re.findall(r'\n\n', code))
        C = len(code.split('\n')) + paras

        # O = Header hierarchy + Callouts
        headers = len(re.findall(r'^#+ ', code, re.M))
        alerts = len(re.findall(r'^>\s*\[!', code, re.M))
        O = (headers * 10) + (alerts * 15)

        if C > 50 and (O / C) < 0.1:
            breaches.append(f"GUNGNIR_DOCS_BREACH: Structure is too dense (M={(O/C):.2f}). Add more headers or alerts.")

        return breaches
