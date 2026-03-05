import asyncio
import json
import os
from pathlib import Path
from typing import Dict, Any, List

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink

class RecreateChapterPipeline:
    def __init__(self, root_path: Path):
        self.root = root_path
        self.lore_dir = root_path / ".lore"
        self.world_dir = self.lore_dir / "world"
        self.voices_dir = self.lore_dir / "voices" / "lore"
        self.state_file = self.lore_dir / "fallows_hallow_state.json"
        self.uplink = AntigravityUplink()
        
    def load_world_bible(self) -> str:
        bible_content = []
        if self.world_dir.exists():
            for f in self.world_dir.glob("*.md"):
                bible_content.append(f.read_text(encoding='utf-8'))
        return "\n\n".join(bible_content)

    def load_state(self) -> Dict[str, Any]:
        if self.state_file.exists():
            return json.loads(self.state_file.read_text(encoding='utf-8'))
        return {}

    def save_state(self, state: Dict[str, Any]):
        self.state_file.write_text(json.dumps(state, indent=2), encoding='utf-8')

    def load_character_contract(self, character_name: str) -> str:
        contract_path = self.voices_dir / "characters" / f"{character_name.lower()}.feature"
        if contract_path.exists():
            return contract_path.read_text(encoding='utf-8')
        return ""

    async def step_1_director(self, scenario: str, details: str, conclusion: str, state: Dict[str, Any]) -> str:
        """The Director outlines the physical blocking and turn order."""
        SovereignHUD.persona_log("INFO", "[DIRECTOR] Blocking the scene...")
        prompt = (
            "You are the Stage Director. Outline the physical blocking for the following scene. "
            "Do NOT write prose. Write a sequence of events outlining who moves where, who speaks, and what happens.\n\n"
            f"SCENARIO: {scenario}\n"
            f"DETAILS: {details}\n"
            f"CONCLUSION: {conclusion}\n"
            f"CURRENT STATE: {json.dumps(state, indent=2)}\n\n"
            "OUTPUT FORMAT: A numbered list of blocking instructions."
        )
        response = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
        return response.get("data", {}).get("raw", "") if response.get("status") == "success" else ""

    async def step_2_characters(self, blocking: str, characters_involved: List[str]) -> Dict[str, str]:
        """Ask each character how they react based on their Gherkin contract."""
        SovereignHUD.persona_log("INFO", "[ACTORS] Generating independent character reactions...")
        reactions = {}
        for char in characters_involved:
            contract = self.load_character_contract(char)
            if not contract: continue
            
            prompt = (
                f"You are roleplaying {char}. Use your Gherkin contract to determine your reaction to the current scene blocking.\n\n"
                f"YOUR CONTRACT:\n{contract}\n\n"
                f"SCENE BLOCKING:\n{blocking}\n\n"
                "MANDATE: Output ONLY your internal thoughts, physical action, and specific dialogue based strictly on your Given/When/Then rules."
            )
            response = await self.uplink.send_payload(prompt, {"persona": char})
            if response.get("status") == "success":
                reactions[char] = response["data"]["raw"]
        return reactions

    async def step_3_narrator(self, scenario: str, blocking: str, reactions: Dict[str, str], world_bible: str) -> str:
        """The Narrator weaves the blocking and independent reactions into mythic prose."""
        SovereignHUD.persona_log("INFO", "[NARRATOR] Weaving prose...")
        narrator_contract = (self.voices_dir / "narrator.feature").read_text(encoding='utf-8')
        
        reaction_text = "\n\n".join([f"[{char} REACTION]:\n{txt}" for char, txt in reactions.items()])
        
        prompt = (
            "You are the Narrator of Fallows Hallow. Weave the following blocking and character reactions into cohesive prose.\n\n"
            f"NARRATOR CONTRACT:\n{narrator_contract}\n\n"
            f"SCENE SCENARIO:\n{scenario}\n\n"
            f"DIRECTOR BLOCKING:\n{blocking}\n\n"
            f"CHARACTER REACTIONS (STRICTLY ADHERE TO THESE):\n{reaction_text}\n\n"
            f"WORLD BIBLE (PHYSICS/LORE):\n{world_bible}\n\n"
            "MANDATE: Output the final prose for this scene. Ensure the tone is ancient and heavy."
        )
        response = await self.uplink.send_payload(prompt, {"persona": "TALIESIN"})
        return response.get("data", {}).get("raw", "") if response.get("status") == "success" else ""

    async def step_4_auditor(self, prose: str, characters_involved: List[str]) -> bool:
        """The Auditor checks if the prose violated any character contracts."""
        SovereignHUD.persona_log("INFO", "[AUDITOR] Checking cohesion...")
        contracts = "\n".join([self.load_character_contract(c) for c in characters_involved])
        
        prompt = (
            "You are the Cohesion Auditor. Read the generated prose and the Character BDD Contracts. "
            "Did the prose violate any Given/When/Then rules for the characters involved?\n\n"
            f"PROSE:\n{prose}\n\n"
            f"CONTRACTS:\n{contracts}\n\n"
            "MANDATE: Output 'PASS' if valid. Output 'FAIL: [Reason]' if a contract was violated."
        )
        response = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
        if response.get("status") == "success":
            result = response["data"]["raw"].strip()
            if result.startswith("PASS"):
                SovereignHUD.persona_log("SUCCESS", "Cohesion Audit Passed.")
                return True
            else:
                SovereignHUD.persona_log("WARN", f"Cohesion Audit Failed: {result}")
                return False
        return False

    async def step_5_update_state(self, prose: str, state: Dict[str, Any]) -> Dict[str, Any]:
        """Update the JSON state tracker based on the events in the prose."""
        SovereignHUD.persona_log("INFO", "[MATRIX] Updating Synaptic State...")
        prompt = (
            "You are the State Tracker. Update the following JSON state based on the events in the chapter prose. "
            "Track physical health, emotional state, inventory, and location.\n\n"
            f"CURRENT STATE:\n{json.dumps(state, indent=2)}\n\n"
            f"CHAPTER PROSE:\n{prose}\n\n"
            "MANDATE: Output ONLY the updated raw JSON object."
        )
        response = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
        if response.get("status") == "success":
            raw = response["data"]["raw"]
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            try:
                 return json.loads(raw)
            except: pass
        return state

    async def run_pipeline(self, scenario: str, details: str, conclusion: str, characters_involved: List[str]):
        SovereignHUD.box_top("🎭 AUTONOMIC NARRATIVE ENGINE")
        
        world_bible = self.load_world_bible()
        state = self.load_state()
        
        # 1. Director
        blocking = await self.step_1_director(scenario, details, conclusion, state)
        if not blocking: return
        
        max_retries = 3
        for attempt in range(max_retries):
            # 2. Characters
            reactions = await self.step_2_characters(blocking, characters_involved)
            
            # 3. Narrator
            prose = await self.step_3_narrator(scenario, blocking, reactions, world_bible)
            if not prose: return
            
            # 4. Auditor
            passed = await self.step_4_auditor(prose, characters_involved)
            if passed:
                SovereignHUD.box_separator()
                print(f"\n{prose}\n")
                SovereignHUD.box_separator()
                
                # 5. State Update
                new_state = await self.step_5_update_state(prose, state)
                self.save_state(new_state)
                
                # Save Chapter
                chapter_num = new_state.get("chapter", 0) + 1
                new_state["chapter"] = chapter_num
                self.save_state(new_state)
                
                out_file = self.lore_dir / f"chapter_{chapter_num}.md"
                out_file.write_text(prose, encoding='utf-8')
                SovereignHUD.persona_log("SUCCESS", f"Chapter {chapter_num} forged and saved to .lore/")
                return
            else:
                SovereignHUD.persona_log("WARN", f"Retrying generation (Attempt {attempt+1}/{max_retries}) due to cohesion failure...")
        
        SovereignHUD.persona_log("FAIL", "Failed to generate a cohesive scene within retry limits.")

async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fallows Hallow Chapter Recreation")
    parser.add_argument("--scenario", type=str, required=True, help="Opening scenario overview")
    parser.add_argument("--details", type=str, required=True, help="Narrative details to hit")
    parser.add_argument("--conclusion", type=str, required=True, help="Required conclusion")
    parser.add_argument("--chars", type=str, required=True, help="Comma separated characters (e.g. Roan,John,Nicci)")
    
    args = parser.parse_args()
    
    project_root = Path(__file__).resolve().parent.parent.parent
    pipeline = RecreateChapterPipeline(project_root)
    
    chars = [c.strip() for c in args.chars.split(",")]
    await pipeline.run_pipeline(args.scenario, args.details, args.conclusion, chars)

if __name__ == "__main__":
    asyncio.run(main())
