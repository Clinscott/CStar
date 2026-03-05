"""
[SKILL] Dormancy (Sleep)
Lore: "The ravens return to the All-Father's shoulders."
Purpose: Handles the 'sleep' command by entering a themed dormancy state.
"""

import sys
import time
import asyncio
import json
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[3]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.core.sovereign_hud import SovereignHUD
from src.core.mimir_client import mimir

async def consolidated_memory():
    """REM Sleep: Consolidate actions and trigger Muninn's Flight."""
    SovereignHUD.persona_log("INFO", "Entering REM Sleep: Consolidating Neural Matrix...")
    
    try:
        # 1. Retrieve Technical Debt (The Brain's Stressors)
        debt_res = await mimir.call_tool("pennyone", "get_technical_debt")
        missions = []
        if debt_res and not debt_res.isError:
            lines = debt_res.content[0].text.split('\n')
            for line in lines:
                if '| Target:' in line:
                    parts = line.split('| Target: ')
                    file_part = parts[0].split('**')[1]
                    target_part = parts[1].split(':')[0]
                    missions.append({"file": file_part, "target": target_part})

        # 2. Muninn's Flight (Dreams of Repair)
        repairs_performed = []
        if missions:
            SovereignHUD.persona_log("ALFRED", f"Muninn taking flight over {len(missions)} sectors...")
            
            for mission in missions[:3]: # Limit to top 3 for safety
                sector = mission["file"]
                target = mission["target"]
                SovereignHUD.persona_log("INFO", f"Muninn dreaming of {sector} ({target})...")
                
                # Customize task based on target attribute
                task = f"Improve {target} for {sector}"
                if target == "STYLE": task = f"Sanitize and normalize style tokens in {sector}"
                elif target == "INTEL": task = f"Enhance intent and documentation lore for {sector}"
                elif target == "LOGIC": task = f"Refactor logic to reduce complexity in {sector}"
                elif target == "STABILITY": task = f"Decompose and stabilize complex structures in {sector}"
                
                # Trigger workflow
                fix_res = await mimir.call_tool("corvus-control", "run_workflow", {
                    "workflow": "run-task",
                    "args": [task, sector]
                })
                
                if fix_res and not fix_res.isError:
                    repairs_performed.append(f"{sector} ({target})")
                    # Incremental index update after fix
                    await mimir.index_sector(sector)

        # 3. Memory Forge (Hippocampus)
        memory_path = project_root / ".agent" / "memory.qmd"
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        
        summary = f"\n### ◈ MISSION SUMMARY: {timestamp}\n"
        if repairs_performed:
            summary += f"- **Muninn's Flight:** Sanitized {len(repairs_performed)} sectors: {', '.join(repairs_performed)}.\n"
        else:
            summary += "- **Neural State:** No autonomous repairs required during this cycle.\n"
        
        summary += "- **Sovereignty:** Neural Matrix stabilized and indexed in Mimir's Well.\n"

        with open(memory_path, "a", encoding="utf-8") as f:
            f.write(summary)
            
        SovereignHUD.persona_log("SUCCESS", "Memory Consolidation Complete.")

    except Exception as e:
        SovereignHUD.persona_log("WARN", f"REM Sleep interrupted: {e}")
    finally:
        await mimir.close()

def main():
    SovereignHUD.persona_log("INFO", "Initiating Dormancy Protocol...")
    
    if SovereignHUD.PERSONA == "ODIN":
        print("\n[O.D.I.N.] The ravens circle one last time before the shadows consume the hall.")
        print("      'Sleep, wanderer. The runes will wait for the dawn.'")
    else:
        print("\n[A.L.F.R.E.D.] Very good, sir. I shall dim the lights and stand by.")
        print("              Rest well. The archive remains under my watch.")

    # REM Sleep Phase
    asyncio.run(consolidated_memory())

    # A brief pause to simulate "going to sleep"
    for _i in range(3):
        time.sleep(0.5)
        sys.stdout.write(".")
        sys.stdout.flush()
    
    print("\n[DORMANCY ACTIVE]")
    sys.exit(0)

if __name__ == "__main__":
    main()
