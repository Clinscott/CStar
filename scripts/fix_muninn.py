import re
import sys
from pathlib import Path


def standardize_muninn(filepath: Path):
    """
    Standardizes the Muninn warden implementation by injecting the RuneCasterWarden v2 logic.
    """
    if not filepath.exists():
        return

    content = filepath.read_text(encoding='utf-8')

    # 1. Replace RuneCasterWarden with the new standardized version
    runecaster_v2 = """class RuneCasterWarden:
    \"\"\"
    [TYPE SAFETY]
    Casts the Runes to verify type annotations across the realm.
    Identifies missing type hints and generic 'Any' usage.
    \"\"\"
    def __init__(self, root: Path):
        self.root = root
        self.breaches = []

    def scan(self):
        # Implementation of type scanning
        from src.tools.debug.runecaster_audit import RuneCasterAudit
        audit = RuneCasterAudit(self.root)
        self.breaches = audit.run()
        return self.breaches
"""

    # Replace from 'class RuneCasterWarden:' until 'class MimirWarden:'
    pattern = re.compile(r"class RuneCasterWarden:.*?class MimirWarden:", re.DOTALL)
    if pattern.search(content):
        content = pattern.sub(runecaster_v2 + "\nclass MimirWarden:", content)

    # 2. Add missing imports
    if "import ast" not in content:
        content = "import ast\n" + content
    if "RUNE_BREACH" not in content:
        content = "RUNE_BREACH = 'breach.rune'\n" + content

    # 3. Standardize 5-space to 4-space (21 spaces -> 20 spaces)
    content = re.sub(r"^(\s{21})if", r"                    if", content, flags=re.MULTILINE)

    filepath.write_text(content, encoding='utf-8')

if __name__ == "__main__":
    if len(sys.argv) > 1:
        standardize_muninn(Path(sys.argv[1]))
