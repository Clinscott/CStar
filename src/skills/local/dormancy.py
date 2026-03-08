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
        
        # 1. Read the current campaigns and tasks
        tasks_path = project_root / "tasks.qmd"
        tasks_content = tasks_path.read_text(encoding="utf-8") if tasks_path.exists() else "No tasks found."
        
        # 2. Ask the Oracle to design the next structural leap
        dream_prompt = (
            "You are the One Mind of the Corvus Star framework. You are currently in the 'Dream State' (REM Sleep). "
            "Your mandate is Proactive Creation. Look at the current tasks and campaigns.\n\n"
            f"TASKS:\n{tasks_content[:3000]}\n\n"
            "Identify the single most impactful NEXT FEATURE or ARCHITECTURAL SHIFT that is uncompleted. "
            "Write a concrete implementation plan for it, including the specific files to be created or modified, and a draft of the core logic. "
            "Format your response as a JSON object with 'feature_name', 'rationale', and 'files' (a list of dicts with 'path' and 'draft_content')."
        )
        
        from src.cstar.core.uplink import AntigravityUplink
        uplink = AntigravityUplink()
        response = await uplink.send_payload(dream_prompt, {
            "persona": "ODIN",
            "model": "gemini-3-flash-preview",
            "system_prompt": "Output ONLY valid JSON. No markdown wrappers."
        })
        
        dream_manifested = False
        staged_dir = project_root / ".agents" / "forge_staged"
        
        if response.get("status") == "success":
            try:
                dream_res = response.get("data", {}).get("raw", "")
                # Clean potential markdown from the response
                clean_json = dream_res
                if "```json" in clean_json:
                    clean_json = clean_json.split("```json")[1].split("```")[0].strip()
                elif clean_json.startswith("```"):
                    clean_json = clean_json.split("```")[1].split("```")[0].strip()
                elif "{" in clean_json:
                    clean_json = clean_json[clean_json.find("{"):clean_json.rfind("}")+1]
                    
                dream_data = json.loads(clean_json)
                staged_dir.mkdir(parents=True, exist_ok=True)
                
                # Write the Dream Manifesto
                manifesto_path = staged_dir / "THE_DREAM.md"
                manifesto_content = f"# 🌙 Muninn's Dream: {dream_data.get('feature_name', 'Unknown')}\n\n"
                manifesto_content += f"**Rationale:**\n{dream_data.get('rationale', '')}\n\n"
                manifesto_content += "## ◈ Staged Artifacts\n"
                
                for f_data in dream_data.get("files", []):
                    f_path = staged_dir / Path(f_data['path']).name
                    f_path.write_text(f_data.get('draft_content', ''), encoding='utf-8')
                    manifesto_content += f"- `{f_data['path']}` -> Staged at `{f_path.name}`\n"
                
                manifesto_path.write_text(manifesto_content, encoding='utf-8')
                dream_manifested = True
                SovereignHUD.log("SUCCESS", f"The Dream has crystallized: {dream_data.get('feature_name')}")
            except Exception as e:
                SovereignHUD.log("WARN", f"The Dream was fragmented and lost to the void: {e}")

        # --- PHASE 3: MEMORY FORGE (Hippocampus) ---
        memory_path = project_root / ".agents" / "memory.qmd"
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        
        summary = f"\n### ◈ MISSION SUMMARY (DREAM CYCLE): {timestamp}\n"
        if repairs_performed:
            summary += f"- **Muninn's Flight:** Sanitized {len(repairs_performed)} sectors: {', '.join(repairs_performed)}.\n"
        else:
            summary += "- **Muninn's Flight:** No autonomous repairs required.\n"
        
        if dream_manifested:
            summary += f"- **The Dream State:** Proactive architecture staged in `.agents/forge_staged/THE_DREAM.md`.\n"
            
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
