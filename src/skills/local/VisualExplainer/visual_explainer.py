#!/usr/bin/env python3
"""
[SKILL] VisualExplainer
Lore: "Transforming the raw noise of the terminal into the clarity of the All-Father's vision."
Purpose: Generates rich HTML reports from terminal output, featuring Mermaid diagrams and high-end design.
Inspired by: nicobailon/visual-explainer
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

# [ALFRED] Ensure environment is loaded
try:
    project_root = Path(__file__).resolve().parents[4]
    sys.path.append(str(project_root))
    from src.sentinel._bootstrap import bootstrap
    bootstrap()
except (ImportError, ValueError, IndexError):
    pass

from src.core.sovereign_hud import SovereignHUD

class VisualExplainer:
    def __init__(self):
        self.root = Path(__file__).resolve().parents[4]
        self.template_dir = Path(__file__).resolve().parent / "templates"
        self.output_dir = self.root / "docs" / "visuals"
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_report(self, title: str, content_markdown: str, diagram_mermaid: Optional[str] = None) -> Path:
        """
        Generates a standalone HTML report.
        """
        SovereignHUD.persona_log("INFO", f"Forging visual report: {title}...")

        template_path = self.template_dir / "base.html"
        if not template_path.exists():
            SovereignHUD.persona_log("ERROR", "Base template missing.")
            sys.exit(1)

        template = template_path.read_text(encoding='utf-8')

        # Simple manual template injection to avoid heavy dependencies like Jinja2
        html_content = ""
        
        # 1. Process Markdown (Very basic conversion for now)
        lines = content_markdown.splitlines()
        for line in lines:
            if line.startswith("# "):
                html_content += f"<h2>{line[2:]}</h2>"
            elif line.startswith("## "):
                html_content += f"<h3>{line[3:]}</h3>"
            elif line.startswith("- "):
                html_content += f"<li>{line[2:]}</li>"
            elif line.strip():
                html_content += f"<p>{line}</p>"

        # 2. Inject Diagram
        if diagram_mermaid:
            html_content += f'<div class="card"><h3>Architecture Visualization</h3><div class="mermaid">{diagram_mermaid}</div></div>'

        # 3. Final Assembly
        final_html = template.replace("{{ title }}", title)
        final_html = final_html.replace("{{ timestamp }}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        final_html = final_html.replace("{{ content }}", html_content)

        # 4. Save
        safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '_')).rstrip().replace(' ', '_').lower()
        output_file = self.output_dir / f"{safe_title}.html"
        output_file.write_text(final_html, encoding='utf-8')

        SovereignHUD.persona_log("SUCCESS", f"Visualized: {output_file.relative_to(self.root)}")
        return output_file

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python visual_explainer.py <title> <markdown_content> [mermaid_diagram]")
        sys.exit(1)

    title = sys.argv[1]
    markdown = sys.argv[2]
    mermaid = sys.argv[3] if len(sys.argv) > 3 else None

    explainer = VisualExplainer()
    explainer.generate_report(title, markdown, mermaid)
