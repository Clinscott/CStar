#!/usr/bin/env python3
"""
[ODIN] Implementation of the Hunt & Forge Protocol.
Acquires new skills autonomously via Brave Search and Antigravity Uplink.
Deploys results strictly to the zero-trust skills_db/ directory.
"""

import os
import sys
import asyncio
import json
import re
import argparse
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.ui import HUD
from src.tools.brave_search import BraveSearch
from src.cstar.core.uplink import AntigravityUplink
from src.sentinel.code_sanitizer import sanitize_code, perform_quarantine_scan

def _slugify(text: str) -> str:
    """Converts a descriptive string into a safe filename slug."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

async def hunt_and_forge(query: str, skill_name: str = None):
    """
    Orchestrates the Hunt & Forge sequence.
    1. Hunt: Search Brave for technical context.
    2. Forge: Synthesize code via Antigravity Uplink.
    3. Sanitize: Validate via Bifrost Gate.
    4. Assimilate: Deploy to skills_db/.
    """
    HUD.PERSONA = "ODIN"
    HUD.box_top("HUNT & FORGE PROTOCOL")
    HUD.box_row("INTENT", query, HUD.BOLD)

    # 1. HUNT Phase
    HUD.box_row("PHASE 1", "Hunting Intelligence (Brave)...", HUD.CYAN)
    searcher = BraveSearch()
    results = searcher.search_knowledge(query)
    
    context_data = ""
    if results:
        HUD.box_row("STATUS", f"Harvested {len(results)} intelligence points.", HUD.GREEN)
        context_data = "\n".join([f"Source: {r['url']}\nSnippet: {r['description']}" for r in results[:3]])
    else:
        HUD.box_row("STATUS", "Hunt returned zero metrics. Proceeding with internal baseline.", HUD.YELLOW)

    # 2. FORGE Phase
    HUD.box_row("PHASE 2", "Forging Component (Antigravity)...", HUD.CYAN)
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
        HUD.box_row("ERROR", response.get("message", "Uplink Failed"), HUD.RED)
        HUD.box_bottom()
        return

    # Extract code (handle simulation mode prefix if present)
    new_code = response.get("data", {}).get("code") or response.get("message", "")
    if "[SIMULATION]" in new_code:
        # Generate dummy code for testing if in simulation mode
        new_code = f"import sys\n# [ODIN] Forged Skill: {query}\nprint('Gungnir Logic Default: ' + ' '.join(sys.argv[1:]))\n"
    
    # 3. SANITIZE Phase
    HUD.box_row("PHASE 3", "Bifrost Gate Sanitization...", HUD.CYAN)
    
    # Pre-sanitize (Strip fences etc)
    new_code = sanitize_code(new_code)
    
    # Strict Security Scan
    passed, msg = perform_quarantine_scan(new_code, whitelist=["sys"])
    if not passed:
        HUD.box_row("BREACH", msg, HUD.RED)
        HUD.box_bottom()
        HUD.persona_log("HEIMDALL", f"Security violation detected in forged code: {msg}")
        return
    
    HUD.box_row("STATUS", "Quarantine Scan Passed.", HUD.GREEN)

    # 4. ASSIMILATE Phase
    HUD.box_row("PHASE 4", "Assimilating Skill (Zero-Trust)...", HUD.CYAN)
    
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
        
        HUD.box_row("DEPLOYED", str(target_file.relative_to(PROJECT_ROOT)), HUD.GREEN)
        HUD.box_row("STATUS", "Skill assimilated into skills_db (SANDBOXED).", HUD.GREEN)
    except Exception as e:
        HUD.box_row("ERROR", f"Assimilation Failed: {str(e)}", HUD.RED)

    HUD.box_bottom()
    HUD.persona_log("ODIN", f"Dominion Expanded: Skill '{target_name}' is ready for jailed execution.")

async def main():
    parser = argparse.ArgumentParser(description="Corvus Star Skill Acquisition Tool")
    parser.add_argument("query", help="What skill do you want to acquire?")
    parser.add_argument("--name", help="Optional name for the skill.")
    args = parser.parse_args()

    await hunt_and_forge(args.query, args.name)

if __name__ == "__main__":
    asyncio.run(main())
