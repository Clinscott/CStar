import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "title_slug.py"


class TitleSlugTests(unittest.TestCase):
    def test_slugify_function(self) -> None:
        namespace: dict[str, object] = {}
        code = SCRIPT.read_text(encoding="utf-8")
        exec(compile(code, str(SCRIPT), "exec"), namespace)
        slugify = namespace["slugify"]
        self.assertEqual(slugify("Quarterly Review: Alpha/Beta"), "quarterly-review-alpha-beta")
        self.assertEqual(slugify("  Keep   It   Tight  "), "keep-it-tight")
        self.assertEqual(slugify("R&D roadmap 2026"), "r-d-roadmap-2026")
        self.assertEqual(slugify("!!!"), "untitled")

    def test_cli_outputs_slug(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "Quarterly Review: Alpha/Beta"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.stdout.strip(), "quarterly-review-alpha-beta")


if __name__ == "__main__":
    unittest.main()
