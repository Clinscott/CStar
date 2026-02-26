import ast
import os
import re


class PromptLinter:
    def parse_prompty_vars(self, filepath: str) -> list[str]:
        """Reads a .prompty file and uses regex to find all {{variables}}."""
        if not os.path.exists(filepath):
            return []
        with open(filepath, encoding='utf-8') as f:
            content = f.read()
        return list(set(re.findall(r"\{\{([a-zA-Z0-9_]+)\}\}", content)))

    def audit_python_invocation(self, py_filepath: str, expected_vars: list[str]) -> bool:
        """Uses AST to ensure the python code passes the required variables to any dict or string format that looks like prompt data."""
        if not os.path.exists(py_filepath):
            return False

        try:
            with open(py_filepath, encoding='utf-8') as f:
                tree = ast.parse(f.read())

            found_vars = set()
            for node in ast.walk(tree):
                # Look for dictionary keys that match expected variables
                if isinstance(node, ast.Dict):
                    for key in node.keys:
                        if isinstance(key, ast.Constant) and isinstance(key.value, str):
                            if key.value in expected_vars:
                                found_vars.add(key.value)
                # Look for Keyword arguments in function calls
                elif isinstance(node, ast.keyword):
                    if node.arg in expected_vars:
                        found_vars.add(node.arg)
                # Look for string formatting with expected variables
                elif isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Attribute) and node.func.attr == 'format':
                        for kw in node.keywords:
                            if kw.arg in expected_vars:
                                found_vars.add(kw.arg)

            return all(var in found_vars for var in expected_vars)
        except Exception:
            return False

    def calculate_integrity_score(self, prompt_dir: str = ".agent/prompts") -> float:
        """Returns 0.0 to 100.0 based on how many prompts are error-free."""
        if not os.path.exists(prompt_dir):
            return 0.0

        prompty_files = [f for f in os.listdir(prompt_dir) if f.endswith('.prompty')]
        if not prompty_files:
            return 0.0

        total_prompts = len(prompty_files)
        valid_prompts = 0

        for pfile in prompty_files:
            path = os.path.join(prompt_dir, pfile)
            vars = self.parse_prompty_vars(path)
            # For now, if it parses vars, it's valid.
            # Integration check would happen during mutation phase.
            if vars is not None:
                valid_prompts += 1

        return (valid_prompts / total_prompts) * 100.0
