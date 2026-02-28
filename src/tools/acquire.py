#!/usr/bin/env python3
"""
[O.D.I.N.] Implementation of the Hunt & Forge Protocol.
Acquires new skills autonomously via Brave Search and Antigravity Uplink.
Deploys results strictly to the zero-trust skills_db/ directory.
"""

import argparse
import asyncio
import re
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink
from src.sentinel.code_sanitizer import perform_quarantine_scan, sanitize_code
from src.tools.brave_search import BraveSearch


def _slugify(text: str) -> str:
    """Converts a descriptive string into a safe filename slug."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

async def hunt_and_forge(query: str, skill_name: str | None = None) -> None:
    """
    Orchestrates the Hunt & Forge sequence.
    1. Hunt: Search Brave for technical context.
    2. Forge: Synthesize code via Antigravity Uplink.
    3. Sanitize: Validate via Bifrost Gate.
    4. Assimilate: Deploy to skills_db/.
    """
    SovereignHUD.PERSONA = "ODIN"
    SovereignHUD.box_top("HUNT & FORGE PROTOCOL")
    SovereignHUD.box_row("INTENT", query, SovereignHUD.BOLD)

    # 1. HUNT Phase
    SovereignHUD.box_row("PHASE 1", "Hunting Intelligence (Brave)...", SovereignHUD.CYAN)
    searcher = BraveSearch()
    results = searcher.search_knowledge(query)

    context_data = ""
    if results:
        SovereignHUD.box_row("STATUS", f"Harvested {len(results)} intelligence points.", SovereignHUD.GREEN)
        context_data = "\n".join([f"Source: {r['url']}\nSnippet: {r['description']}" for r in results[:3]])
    else:
        SovereignHUD.box_row("STATUS", "Hunt returned zero metrics. Proceeding with internal baseline.", SovereignHUD.YELLOW)

    # 2. FORGE Phase
    SovereignHUD.box_row("PHASE 2", "Forging Component (Antigravity)...", SovereignHUD.CYAN)
    uplink = AntigravityUplink()

    prompt = f"""
    Create a standalone Python skill for the Corvus Star (C*) framework.
    Task: {query}

    Technical Context:
    {context_data}

    Requirements:
    - Must be a self-contained Python script.
    - Must handle CLI arguments cleanly using argparse or sys.argv.
    - Must NOT import forbidden modules (os, subprocess, sys, socket, requests, urllib, builtins, importlib).
    - If you MUST use a utility, assume it is NOT available and implement it purely.
    - Follow the Linscott Standard (Clean code, comments, robust error handling).
    - Provide ONLY the Python code. No markdown fences.
    """

    response = await uplink.send_payload(prompt, {"persona": "ODIN", "task": "SKILL_ACQUISITION"})

    if response.get("status") == "error":
        SovereignHUD.box_row("ERROR", response.get("message", "Uplink Failed"), SovereignHUD.RED)
        SovereignHUD.box_bottom()
        return

    # Extract code (handle simulation mode prefix if present)
    new_code = response.get("data", {}).get("code") or response.get("message", "")
    if "[SIMULATION]" in new_code:
        # Generate dummy code for testing if in simulation mode
        new_code = f"import sys\n# [O.D.I.N.] Forged Skill: {query}\nprint('Gungnir Logic Default: ' + ' '.join(sys.argv[1:]))\n"

    # 3. SANITIZE Phase
    SovereignHUD.box_row("PHASE 3", "Bifrost Gate Sanitization...", SovereignHUD.CYAN)

    # Pre-sanitize (Strip fences etc)
    new_code = sanitize_code(new_code)

    # Strict Security Scan
    passed, msg = perform_quarantine_scan(new_code, whitelist=["sys"])
    if not passed:
        SovereignHUD.box_row("BREACH", msg, SovereignHUD.RED)
        SovereignHUD.box_bottom()
        SovereignHUD.persona_log("HEIMDALL", f"Security violation detected in forged code: {msg}")
        return

    SovereignHUD.box_row("STATUS", "Quarantine Scan Passed.", SovereignHUD.GREEN)

    # 4. ASSIMILATE Phase
    SovereignHUD.box_row("PHASE 4", "Assimilating Skill (Zero-Trust)...", SovereignHUD.CYAN)

    target_name = skill_name or _slugify(query[:20])
    target_dir = PROJECT_ROOT / "skills_db" / target_name
    target_file = target_dir / f"{target_name}.py"
    metadata_file = target_dir / "SKILL.qmd"

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        target_file.write_text(new_code, encoding='utf-8')

        # Write metadata
        metadata_content = f"""---
name: {target_name.replace('_', ' ').title()}
description: Autonomously acquired skill for: {query}
---
# {target_name}
Acquired via Hunt & Forge Protocol.
"""
        metadata_file.write_text(metadata_content, encoding='utf-8')

        SovereignHUD.box_row("DEPLOYED", str(target_file.relative_to(PROJECT_ROOT)), SovereignHUD.GREEN)
        SovereignHUD.box_row("STATUS", "Skill assimilated into skills_db (SANDBOXED).", SovereignHUD.GREEN)
    except Exception as e:
        SovereignHUD.box_row("ERROR", f"Assimilation Failed: {e!s}", SovereignHUD.RED)

    SovereignHUD.box_bottom()
    SovereignHUD.persona_log("ODIN", f"Dominion Expanded: Skill '{target_name}' is ready for jailed execution.")

async def main() -> None:
    parser = argparse.ArgumentParser(description="Corvus Star Skill Acquisition Tool")
    parser.add_argument("query", help="What skill do you want to acquire?")
    parser.add_argument("--name", help="Optional name for the skill.")
    args = parser.parse_args()

    await hunt_and_forge(args.query, args.name)

if __name__ == "__main__":
    asyncio.run(main())
