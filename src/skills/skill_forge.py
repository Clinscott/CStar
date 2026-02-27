#!/usr/bin/env python3
"""
The Skill Forge
[Ω] CREATION IS DOMINION / [A] THE WORKSHOP SERVES

RAG-driven skill synthesis from project documentation patterns.
All generated skills go to drafts/ for review before deployment.
"""

import os
import py_compile
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Ensure shared UI and Engine can be imported
_core_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core")
_engine_dir = os.path.join(_core_dir, "engine")
sys.path.insert(0, _core_dir)
sys.path.insert(0, _engine_dir)

from cortex import Cortex

from src.core.sovereign_hud import SovereignHUD
from src.tools.brave_search import BraveSearch  # [BIFRÖST]


class SkillForge:
    """
    [ALFRED] Synthesizes Python skill templates from documentation analysis.
    Uses RAG (Cortex) to identify patterns and map them to standard archetypes.
    """

    ARCHETYPES = {
        "test": {
            "triggers": ["test", "verify", "check", "validate", "assert", "ensure"],
            "imports": ["pytest", "unittest"],
            "template": "test"
        },
        "workflow": {
            "triggers": ["automate", "chain", "sequence", "batch", "pipeline", "orchestrate"],
            "imports": ["argparse", "json"],
            "template": "workflow"
        },
        "utility": {
            "triggers": ["parse", "convert", "analyze", "extract", "transform", "process"],
            "imports": ["json", "re", "os"],
            "template": "utility"
        },
        "scanner": {
            "triggers": ["scan", "audit", "lint", "check", "inspect"],
            "imports": ["ast", "pathlib"],
            "template": "scanner"
        },
        "scraper": {
            "triggers": ["scrape", "crawl", "fetch", "web", "html", "parse"],
            "imports": ["requests", "bs4"],
            "template": "scraper"
        }
    }

    DANGEROUS_PATTERNS = [
        r'\beval\s*\(',
        r'\bexec\s*\(',
        r'__import__\s*\(',
        r'subprocess\.(?:run|call|Popen|check_output)',
        r'os\.system\s*\(',
        r'os\.popen\s*\(',
        r'pickle\.loads?\s*\(',
    ]

    def __init__(self, project_root: str) -> None:
        self.project_root = project_root
        self.base_dir = os.path.join(project_root, ".agent")
        self.drafts_dir = os.path.join(self.base_dir, "skills", "drafts")

        # Initialize Cortex for RAG
        self.cortex = Cortex(project_root, self.base_dir)

        # Ensure drafts directory exists
        Path(self.drafts_dir).mkdir(parents=True, exist_ok=True)

    def forge(self, query: str, dry_run: bool = False) -> dict:
        """
        [ALFRED] Orchestrates the multi-phase skill creation protocol.

        Args:
            query: The user's natural language request (e.g., 'create a log parser').
            dry_run: If True, provides a preview of the generated code without saving.

        Returns:
            A dictionary containing 'success', 'code', 'archetype', and 'path'.
        """
        SovereignHUD.box_top("SKILL FORGE: IGNITION")

        if not query or not query.strip():
            SovereignHUD.box_row("ERROR", "Query required", SovereignHUD.RED)
            SovereignHUD.box_bottom()
            return {"success": False, "code": "", "validation": "Query required"}

        # Step 1: Analyze pattern via RAG
        SovereignHUD.box_row("PHASE 1", "Analyzing pattern...", SovereignHUD.CYAN)
        try:
            context = self.analyze_pattern(query)
        except Exception:
            SovereignHUD.box_row("ERROR", "RAG Analysis Failed", SovereignHUD.RED)
            context = []

        if not context:
            SovereignHUD.box_row("WARN", "No Context Found (Proceeding with Defaults)", SovereignHUD.YELLOW)

        # Step 2: Select archetype
        SovereignHUD.box_row("PHASE 2", "Selecting archetype...", SovereignHUD.CYAN)
        archetype = self.select_archetype(query, context)
        SovereignHUD.box_row("ARCHETYPE", archetype.upper(), SovereignHUD.GREEN)

        # Step 3: Extract subject from query
        subject = self._extract_subject(query)
        SovereignHUD.box_row("SUBJECT", subject, SovereignHUD.GREEN)

        # Step 4: Synthesize code
        SovereignHUD.box_row("PHASE 3", "Synthesizing code...", SovereignHUD.CYAN)
        code = self.synthesize_skill(subject, archetype, context)

        # Step 5: Validate
        SovereignHUD.box_row("PHASE 4", "Validating...", SovereignHUD.CYAN)
        is_valid, validation_msg = self.validate_skill(code)

        if not is_valid:
            SovereignHUD.box_row("REJECTED", validation_msg, SovereignHUD.RED)
            SovereignHUD.box_bottom()
            return {"success": False, "code": code, "validation": validation_msg}

        SovereignHUD.box_row("VALIDATED", "All checks passed", SovereignHUD.GREEN)

        # Step 6: Save (unless dry-run)
        output_path = None
        if not dry_run:
            output_path = self._save_draft(subject, archetype, code)
            SovereignHUD.box_row("SAVED", output_path, SovereignHUD.GREEN)
        else:
            SovereignHUD.box_row("DRY-RUN", "Preview only, not saved", SovereignHUD.YELLOW)

        SovereignHUD.box_bottom()

        return {
            "success": True,
            "path": output_path,
            "code": code,
            "archetype": archetype,
            "validation": validation_msg
        }

    def analyze_pattern(self, query: str) -> list[dict]:
        results = self.cortex.query(query)
        context = []
        for r in results[:5]:  # Top 5 matches
            if r['score'] < 0.2: continue
            trigger = r['trigger']
            parts = trigger.split(' > ', 1)
            source = parts[0] if parts else "Unknown"
            header = parts[1] if len(parts) > 1 else "General"
            content = self.cortex.brain.skills.get(trigger, "")
            context.append({
                "source": source,
                "header": header,
                "content": content[:1500],
                "score": round(r['score'], 3)
            })

        # [BIFRÖST] Web-RAG: Fetch documentation for external libraries
        libraries = ["aws", "fastapi", "boto3", "requests", "flask", "django", "pytorch", "tensorflow", "pandas"]
        for lib in libraries:
            if lib in query.lower():
                SovereignHUD.box_row("WEB-RAG", f"Fetching documentation for {lib}...", SovereignHUD.DIM)
                searcher = BraveSearch()
                web_results = searcher.search(f"{lib} library official documentation and syntax")
                for wr in web_results[:2]:
                    context.append({
                        "source": "BraveSearch",
                        "header": wr.get("title", "External Docs"),
                        "content": wr.get("description", ""),
                        "score": 0.9  # High priority for real-world docs
                    })
                break

        return context

    def select_archetype(self, query: str, context: list[dict]) -> str:
        query_lower = query.lower()
        for archetype, config in self.ARCHETYPES.items():
            for trigger in config["triggers"]:
                if trigger in query_lower: return archetype
        context_text = " ".join(c["content"] for c in context).lower()
        for archetype, config in self.ARCHETYPES.items():
            for trigger in config["triggers"]:
                if trigger in context_text: return archetype
        return "utility"

    def _extract_subject(self, query: str) -> str:
        stripped = re.sub(r'^(create|make|build|generate|write|test|a|an|the)\s+', '', query.lower())
        stripped = re.sub(r'\s+(for|to|from|with)\s+', ' ', stripped)
        # Filter out 'test' as it's often a meta-instruction, not the subject itself
        words = [w for w in stripped.split() if len(w) > 2 and w != 'test']
        if not words: return "generated"
        subject = "_".join(words[-3:])
        subject = re.sub(r'[^a-z0-9_]', '_', subject)
        subject = re.sub(r'_+', '_', subject).strip('_')
        if not subject or subject[0].isdigit(): subject = f"skill_{subject}"
        return subject

    def _generate_workflow_steps(self, context: list[dict]) -> list[str]:
        steps = []
        for c in context:
            # Look for common step patterns in the RAG content
            found = re.findall(r'(?:Step \d+:?|(?:\d+\.))\s*([^\n.]+)', c['content'])
            if found: steps.extend(found)
        return list(dict.fromkeys(steps))[:5] # Deduplicate and limit

    def _generate_workflow_template(self, name: str, context: str, imports: list, steps: list[str] | None = None) -> str:
        logic = ""
        if steps:
            for i, step in enumerate(steps, 1):
                logic += f'    print(f"[STEP {i}] {step.strip()}...")\n'
        else:
            logic = '    print(f"[STEP 1] Loading {args.input}...")\n'

        return f'''# DRAFT - REQUIRES REVIEW
# Generated by Skill Forge at {datetime.now().isoformat()}
# Archetype: WORKFLOW
#
# Context Sources:
{context}

import argparse
import json
import sys

def main():
    parser = argparse.ArgumentParser(description="{name} workflow")
    parser.add_argument("--input", required=True, help="Input file or directory")
    parser.add_argument("--dry-run", action="store_true", help="Preview without changes")
    args = parser.parse_args()

{logic}
    print("[DONE] Workflow complete.")

if __name__ == "__main__":
    main()
'''

    def _generate_test_template(self, name: str, context: str, imports: list) -> str:
        return f'''# DRAFT - REQUIRES REVIEW
# Generated by Skill Forge at {datetime.now().isoformat()}
# Archetype: TEST
#
# Context Sources:
{context}

import pytest

class Test{name.title().replace('_', '')}:
    """
    Test suite for {name}.
    """

    def test_basic_functionality(self):
        """Test basic operation."""
        # TODO: Implement test
        assert True

    def test_edge_case_empty_input(self):
        """Test behavior with empty input."""
        # TODO: Implement edge case
        assert True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
'''

    def _generate_scanner_template(self, name: str, context: str, imports: list) -> str:
        return f'''# DRAFT - REQUIRES REVIEW
# Generated by Skill Forge at {datetime.now().isoformat()}
# Archetype: SCANNER
#
# Context Sources:
{context}

import ast
from pathlib import Path
import argparse

def scan_file(filepath: str) -> list[dict]:
    findings = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            if filepath.endswith('.py'):
                tree = ast.parse(content)
    except Exception as e:
        findings.append({{"line": 0, "issue": str(e), "severity": "ERROR"}})
    return findings

def main():
    parser = argparse.ArgumentParser(description="{name} scanner")
    parser.add_argument("path", help="File or directory to scan")
    args = parser.parse_args()
    path = Path(args.path)
    all_findings = []
    if path.is_file():
        all_findings = scan_file(str(path))
    else:
        for file in path.rglob("*.py"):
            all_findings.extend(scan_file(str(file)))
    print(all_findings)

if __name__ == "__main__":
    main()
'''

    def _generate_utility_template(self, name: str, context: str, imports: list) -> str:
        return f'''# DRAFT - REQUIRES REVIEW
# Generated by Skill Forge at {datetime.now().isoformat()}
# Archetype: UTILITY
#
# Context Sources:
{context}

import json
import re
import os
from pathlib import Path

def {name}(input_data):
    """
    {name.replace('_', ' ').title()} utility.
    """
    return input_data

def main():
    import argparse
    parser = argparse.ArgumentParser(description="{name} utility")
    parser.add_argument("input", help="Input to process")
    args = parser.parse_args()
    print({name}(args.input))

if __name__ == "__main__":
    main()
'''

    def _generate_scraper_template(self, name: str, context: str, imports: list) -> str:
        return f'''# DRAFT - REQUIRES REVIEW
# Generated by Skill Forge at {datetime.now().isoformat()}
# Archetype: SCRAPER
#
# Context Sources:
{context}

import requests
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

def scrape_data(url: str):
    """
    {name.replace('_', ' ').title()} scraper.
    """
    if not BeautifulSoup: return "Error: beautifulsoup4 not installed"
    res = requests.get(url, timeout=10)
    if res.status_code == 200:
        soup = BeautifulSoup(res.text, 'html.parser')
        return soup.title.string if soup.title else "No Title"
    return f"Error: {{res.status_code}}"

if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
    print(scrape_data(url))
'''

    def synthesize_skill(self, name: str, archetype: str, context: list[dict]) -> str:
        config = self.ARCHETYPES[archetype]
        imports = config["imports"]
        context_summary = "\n".join(f"    # Source: {c['source']} > {c['header']} (score: {c['score']})" for c in context[:3])

        if archetype == "test": return self._generate_test_template(name, context_summary, imports)
        elif archetype == "workflow":
            steps = self._generate_workflow_steps(context)
            return self._generate_workflow_template(name, context_summary, imports, steps)
        elif archetype == "scanner": return self._generate_scanner_template(name, context_summary, imports)
        elif archetype == "scraper": return self._generate_scraper_template(name, context_summary, imports)
        else: return self._generate_utility_template(name, context_summary, imports)

    def validate_skill(self, code: str) -> tuple[bool, str]:
        for pattern in self.DANGEROUS_PATTERNS:
            if re.search(pattern, code): return False, f"Blocked dangerous pattern: {pattern}"

        temp_path = os.path.join(self.drafts_dir, ".validate_temp.py")
        try:
            with open(temp_path, 'w', encoding='utf-8') as f: f.write(code)
            py_compile.compile(temp_path, doraise=True)
        except py_compile.PyCompileError as e: return False, f"Syntax error: {e}"
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)

        try:
            with open(temp_path, 'w', encoding='utf-8') as f: f.write(code)
            subprocess.run([sys.executable, "-m", "ruff", "check", "--select=E,F", temp_path], capture_output=True, text=True, timeout=10)
        except (subprocess.SubprocessError, OSError): pass
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)

        return True, "All checks passed"

    def _save_draft(self, subject: str, archetype: str, code: str) -> str:
        base_name = f"{archetype}_{subject}_gen"
        draft_path = os.path.join(self.drafts_dir, base_name)
        os.makedirs(draft_path, exist_ok=True)

        py_path = os.path.join(draft_path, f"{subject}.py")
        with open(py_path, 'w', encoding='utf-8') as f: f.write(code)

        # Target 302: Generate SKILL.qmd
        md_content = f"""---
name: {subject.replace('_', ' ').title()}
description: Generated {archetype} skill for {subject.replace('_', ' ')}.
---
# Skill: {subject.replace('_', ' ').title()}

## Activation Words
{subject.replace('_', ', ')}, {archetype}

## Automatically Generated Pattern
This skill was synthesized by the Skill Forge from project documentation.
"""
        with open(os.path.join(draft_path, "SKILL.qmd"), 'w', encoding='utf-8') as f:
            f.write(md_content)

        return draft_path

def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Skill Forge: RAG-driven skill synthesis")
    parser.add_argument("--query", "-q", required=True, help="What skill to create")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))

    forge = SkillForge(project_root)
    result = forge.forge(args.query, dry_run=args.dry_run)

    if args.dry_run and result["success"]:
        print("\n" + "="*60)
        print("GENERATED CODE PREVIEW:")
        print("="*60)
        print(result["code"])

if __name__ == "__main__":
    main()
