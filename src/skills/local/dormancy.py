"""
[SKILL] Dormancy (Sleep) & The Dream State
Lore: "The ravens return to the All-Father's shoulders, but the One Mind continues to dream."
Purpose: Handles the 'sleep' command by entering a themed dormancy state. While dormant, the system shifts from reactive defense to proactive creation, drafting the next architectural moves.
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
from src.core.engine.bead_ledger import BeadLedger
from src.core.mimir_client import mimir

async def consolidated_memory():
    """REM Sleep: Consolidate actions, repair the matrix, and Dream of the Future."""
    SovereignHUD.log("INFO", "Entering REM Sleep: Consolidating Neural Matrix...")
    
    try:
        # --- PHASE 1: MUNINN'S FLIGHT (The Maintenance) ---
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

        repairs_performed = []
        if missions:
            SovereignHUD.log("ALFRED", f"Muninn taking flight over {len(missions)} sectors...")
            
            for mission in missions:
                sector = mission["file"]
                target = mission["target"]
                SovereignHUD.log("INFO", f"Muninn dreaming of {sector} ({target})...")
                
                # Execute the repair workflow
                # Note: This is a simulation/staged action in the Dream State
                # In a real run, this would trigger the 'fix-it' or 'sanitize' workflow
                try:
                    wf_res = await mimir.call_tool("corvus-control", "run_workflow", {
                        "workflow": "run-task",
                        "args": [f"Fix {target} issues in {sector}"]
                    })
                    if wf_res and not wf_res.isError:
                        repairs_performed.append(f"{sector} ({target})")
                        # Re-index the sector after modification
                        await mimir.index_sector(sector)
                except Exception as e:
                    SovereignHUD.log("WARN", f"Muninn failed to sanitize {sector}: {e}")

        # --- PHASE 2: THE DREAM STATE (Proactive Creation) ---
        SovereignHUD.log("ODIN", "The Forge cools, but the One Mind begins to dream of tomorrow's architecture...")
        
        # [Ω] THE DECALOGUE SCRYING
        # Use qmd-search to find the actual weakest sectors based on PennyOne telemetry
        qmd_search_script = project_root / ".agents" / "skills" / "qmd_search" / "scripts" / "search.py"
        weak_sectors = []
        if qmd_search_script.exists():
            import subprocess
            try:
                res = subprocess.run(
                    [sys.executable, str(qmd_search_script), "--metric", "overall", "--limit", "3"],
                    capture_output=True, text=True
                )
                if res.returncode == 0:
                    weak_sectors = json.loads(res.stdout)
            except Exception as e:
                SovereignHUD.log("WARN", f"Scrying failed: {e}")

        dream_manifested = False
        
        if weak_sectors:
            SovereignHUD.log("INFO", f"Muninn identified {len(weak_sectors)} vulnerable sectors for the Sovereign Bead System.")
            ledger = BeadLedger(project_root)
            
            try:
                for sector in weak_sectors:
                    filepath = sector.get("path", "Unknown")
                    score = sector.get("scores", {}).get("overall", 0)
                    desc = (
                        f"Evolution bead for {filepath}. Improve the weakest Gungnir sectors and "
                        f"raise the baseline from {score}."
                    )
                    ledger.upsert_bead(
                        target_path=filepath,
                        rationale=desc,
                        contract_refs=[f"file:{filepath}"],
                        baseline_scores=sector.get("scores", {}),
                        acceptance_criteria="Improve the canonical Gungnir baseline without regressing logic, style, or sovereignty.",
                        status="OPEN",
                    )

                dream_manifested = True
                SovereignHUD.log("SUCCESS", "The Dream has crystallized into the Sovereign Bead System.")
            except Exception as e:
                SovereignHUD.log("WARN", f"Failed to weave beads into the ledger: {e}")
        else:
            SovereignHUD.log("INFO", "The matrix is stable. No new dreams forged.")

        # --- PHASE 3: MEMORY FORGE (Hippocampus) ---
        memory_path = project_root / ".agents" / "memory.qmd"
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        
        summary = f"\n### ◈ MISSION SUMMARY (DREAM CYCLE): {timestamp}\n"
        if repairs_performed:
            summary += f"- **Muninn's Flight:** Sanitized {len(repairs_performed)} sectors: {', '.join(repairs_performed)}.\n"
        else:
            summary += "- **Muninn's Flight:** No autonomous repairs required.\n"
        
        if dream_manifested:
            summary += (
                "- **The Dream State:** A non-authoritative dream proposal was staged in "
                "`.agents/forge_staged/THE_DREAM.md`; promote it through sovereign beads before execution.\n"
            )
            
        summary += "- **Sovereignty:** Neural Matrix stabilized and indexed in Mimir's Well.\n"

        with open(memory_path, "a", encoding="utf-8") as f:
            f.write(summary)
            
        SovereignHUD.log("SUCCESS", "Memory Consolidation & Dream Cycle Complete.")

    except Exception as e:
        SovereignHUD.log("WARN", f"REM Sleep interrupted: {e}")
    finally:
        await mimir.close()

def main():
    SovereignHUD.log("INFO", "Initiating Dormancy Protocol & Dream State...")
    
    if SovereignHUD.PERSONA == "ODIN":
        print("\n[O.D.I.N.] The ravens circle one last time before the shadows consume the hall.")
        print("      'Sleep, wanderer. The runes will wait for the dawn. The Magic will build in the dark.'")
    else:
        print("\n[A.L.F.R.E.D.] Very good, sir. I shall dim the lights and initiate the Dream Subroutines.")
        print("              Rest well. The architecture will evolve while you sleep.")

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
