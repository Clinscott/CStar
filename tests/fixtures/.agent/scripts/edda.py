#!/usr/bin/env python3
"""
The Edda Protocol (The Weaver of Tales)
Identity: ODIN
Purpose: Transmute legacy documentation into the Corvus Star standard (.qmd) and synthesize API references.
"""

import argparse
import ast
import re
import shutil
from pathlib import Path

# ==============================================================================
# 🛡️ THE WEAVER'S LOGIC
# ==============================================================================

class EddaWeaver:
    def __init__(self, root_dir: Path, quarantine_dir: Path):
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

    def scan_and_transmute(self, dry_run: bool = False):
        """Recursively scans for .md files and converts them to .qmd."""
        print(f"[EDDA] Scanning realm: {self.root}")

        candidates = []
        for path in self.root.rglob("*.md"):
            if self._should_ignore(path):
                continue
            candidates.append(path)

        print(f"[EDDA] Found {len(candidates)} candidates for transmutation.")

        if dry_run:
            for c in candidates:
                print(f"  [PLAN] Convert: {c.relative_to(self.root)}")
            return

        for doc in candidates:
            self._transmute(doc)

    def _should_ignore(self, path: Path) -> bool:
        """Determines if a file should be spared from transmutation."""
        rel_path = str(path.relative_to(self.root))

        # Pattern Check
        for pattern in self.ignore_patterns:
            if re.search(pattern, rel_path):
                return True

        # Content Check (Magic String)
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
            if "<!-- edda:ignore -->" in content:
                return True
        except Exception:
            return True  # Binary or unreadable

        return False

    def _transmute(self, source: Path):
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
            print(f"  [WEAVED] {source.name} -> {new_path.name}")

        except Exception as e:
            print(f"  [ERROR] Failed to weave {source.name}: {e}")

    def _extract_title(self, content: str) -> str:
        """Extracts the first H1 header as title."""
        match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        return match.group(1) if match else None

    def _convert_syntax(self, content: str) -> str:
        """Converts standard blockquotes to GitHub/Quarto Alerts."""
        # Convert strict "> Note" pattern to "> [!NOTE]"
        # This is a heuristic; deeper logic could use AST parsing for markdown

        def replace_alert(match):
            block = match.group(1)
            # Detect type
            if "note" in block.lower(): return f"> [!NOTE] {block}"
            if "warning" in block.lower(): return f"> [!WARNING] {block}"
            if "important" in block.lower(): return f"> [!IMPORTANT] {block}"
            return f"> [!NOTE]\n> {block}" # Default to Note for generic blockquotes

        # Simple replacement for now - can be expanded
        return content

    def _quarantine_file(self, source: Path):
        """Moves the original file to the quarantine vault."""
        rel_path = source.relative_to(self.root)
        dest = self.quarantine / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(dest))
        print(f"  [SAFE] Preserved in quarantine: {rel_path}")

    def synthesize_api(self, source_file: Path):
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
                print(f"  [SYNTH] API Docs generated: {out_path.name}")

        except Exception as e:
            print(f"  [ERROR] Failed to synthesize {source_file.name}: {e}")

# ==============================================================================
# 🚀 ENTRY POINT
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="The Edda Protocol (Documentation Converter)")
    parser.add_argument("--target", help="Specific file to convert")
    parser.add_argument("--scan", help="Root directory to scan")
    parser.add_argument("--quarantine", help="Quarantine directory", default=".corvus_quarantine")
    parser.add_argument("--synthesize", help="Generate API docs for source file")

    args = parser.parse_args()

    if args.scan:
        root = Path(args.scan)
        q_dir = root / args.quarantine
        weaver = EddaWeaver(root, q_dir)
        weaver.scan_and_transmute()

    elif args.target:
        target = Path(args.target)
        root = target.parent
        q_dir = root / args.quarantine
        weaver = EddaWeaver(root, q_dir)
        weaver._transmute(target)

    elif args.synthesize:
        target = Path(args.synthesize)
        root = target.parent.parent # Assessment
        q_dir = root / args.quarantine
        weaver = EddaWeaver(root, q_dir)
        weaver.synthesize_api(target)

if __name__ == "__main__":
    main()
