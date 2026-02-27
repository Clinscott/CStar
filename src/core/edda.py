import argparse
import ast
import re
import shutil
from pathlib import Path

from src.core.sovereign_hud import SovereignHUD

# ==============================================================================
# 🛡️ THE WEAVER'S LOGIC
# ==============================================================================

class EddaWeaver:
    def __init__(self, root_dir: Path, quarantine_dir: Path) -> None:
        self.root = root_dir.resolve()
        self.quarantine = quarantine_dir.resolve()
        self.ignore_patterns = [
            r"\.agent[\\/]workflows",  # Preserve workflows
            r"\.corvus_quarantine",    # Ignore quarantine
            r"\.git",                  # Ignore git
            r"node_modules",           # Ignore deps
            r"__pycache__",
            r"\.venv"
        ]

    def scan_and_transmute(self, dry_run: bool = False) -> None:
        """Recursively scans for .md files and converts them to .qmd."""
        SovereignHUD.persona_log("INFO", f"Scanning realm for documentation: {self.root}")

        candidates = []
        for path in self.root.rglob("*.md"):
            if self._should_ignore(path):
                continue
            candidates.append(path)

        SovereignHUD.persona_log("INFO", f"Found {len(candidates)} candidates for transmutation.")

        if dry_run:
            for c in candidates:
                print(f"  [PLAN] Convert: {c.relative_to(self.root)}")
            return

        for doc in candidates:
            self._transmute(doc)

    def _should_ignore(self, path: Path) -> bool:
        """Determines if a file should be spared from transmutation."""
        try:
            rel_path = str(path.relative_to(self.root))
        except ValueError:
            return True

        # Pattern Check
        for pattern in self.ignore_patterns:
            if re.search(pattern, rel_path):
                return True

        # Content Check (Magic String)
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
            if "<!-- edda:ignore -->" in content:
                return True
        except (OSError, PermissionError):
            return True

        return False

    def _transmute(self, source: Path) -> None:
        """Converts a single .md file to .qmd, preserving the original."""
        try:
            content = source.read_text(encoding="utf-8")

            # 1. Harvest Metadata
            title = self._extract_title(content) or source.stem.replace("-", " ").title()

            # 2. Forge Frontmatter
            frontmatter = f"---\ntitle: {title}\nformat: html\n---\n\n"

            # 3. Transmute Content
            new_content = self._convert_syntax(content)
            final_content = frontmatter + new_content

            # 4. Quarantine Original
            self._quarantine_file(source)

            # 5. Write New Scroll
            new_path = source.with_suffix(".qmd")
            new_path.write_text(final_content, encoding="utf-8")
            SovereignHUD.persona_log("SUCCESS", f"Weaved {source.name} -> {new_path.name}")

        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Failed to weave {source.name}: {e}")

    def _extract_title(self, content: str) -> str | None:
        """Extracts the first H1 header as title."""
        match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        return match.group(1).strip() if match else None

    def _convert_syntax(self, content: str) -> str:
        """Converts standard blockquotes to GitHub/Quarto Alerts."""
        def replace_alert(match) -> str:
            body = match.group(1).strip()

            # Detect explicit header types
            header_match = re.match(r"^(Note|Warning|Important|Tip|Caution):\s*(.*)", body, re.IGNORECASE)
            if header_match:
                tag = header_match.group(1).upper()
                rest = header_match.group(2)
                return f"> [!{tag}]\n> {rest}"

            # General detection
            if "note" in body.lower():
                clean_body = re.sub(r"note:\s*", "", body, flags=re.IGNORECASE).strip()
                return f"> [!NOTE]\n> {clean_body}"
            if "warning" in body.lower():
                clean_body = re.sub(r"warning:\s*", "", body, flags=re.IGNORECASE).strip()
                return f"> [!WARNING]\n> {clean_body}"

            return f"> [!NOTE]\n> {body}"

        # Match lines starting with "> "
        return re.sub(r"^>\s*(.+)$", replace_alert, content, flags=re.MULTILINE)

    def _quarantine_file(self, source: Path) -> None:
        """Moves the original file to the quarantine vault."""
        try:
            rel_path = source.relative_to(self.root)
            dest = self.quarantine / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(dest))
        except (OSError, ValueError):
            pass

    def synthesize_api(self, source_file: Path) -> None:
        """Generates API documentation from a Python source file."""
        try:
            tree = ast.parse(source_file.read_text(encoding="utf-8"))
            docs = []

            docs.append(f"# API Reference: {source_file.stem}\n")

            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                    docstring = ast.get_docstring(node)
                    if docstring:
                        icon = "🔹" if isinstance(node, ast.ClassDef) else "🔸"
                        docs.append(f"## {icon} `{node.name}`")
                        docs.append(f"\n{docstring}\n")

            if len(docs) > 1:
                out_dir = self.root / "docs" / "reference"
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / f"{source_file.stem}.qmd"
                out_path.write_text("\n".join(docs), encoding="utf-8")
                SovereignHUD.persona_log("SUCCESS", f"API Docs synthesized: {out_path.name}")

        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Failed to synthesize {source_file.name}: {e}")

def main() -> None:
    """Command-line interface for the Edda Protocol."""
    parser = argparse.ArgumentParser(description="The Edda Protocol")
    parser.add_argument("--target", help="Specific file to convert")
    parser.add_argument("--scan", help="Root directory to scan")
    parser.add_argument("--quarantine", help="Quarantine directory", default=".corvus_quarantine")
    parser.add_argument("--synthesize", help="Generate API docs for source file")

    args = parser.parse_args()

    if args.scan:
        root = Path(args.scan).resolve()
        q_dir = root / args.quarantine
        EddaWeaver(root, q_dir).scan_and_transmute()

    elif args.target:
        target = Path(args.target).resolve()
        root = target.parent
        q_dir = root / args.quarantine
        EddaWeaver(root, q_dir)._transmute(target)

    elif args.synthesize:
        target = Path(args.synthesize).resolve()
        root = target.parent.parent
        q_dir = root / args.quarantine
        EddaWeaver(root, q_dir).synthesize_api(target)

if __name__ == "__main__":
    main()
