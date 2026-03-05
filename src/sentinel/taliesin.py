"""
[SPOKE] TALIESIN - Textual Articulation and Lore Ingestion Engine
Lore: "The Bard of the Sector."
Purpose: Analyze user style, gather project context, and generate X content.
"""

import asyncio
import json
import os
from pathlib import Path
from typing import Optional, Dict, Any

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink
from src.sentinel.x_api import XAPI

class TaliesinSpoke:
    def __init__(self, root_path: Path):
        self.root = root_path
        self.lore_dir = root_path / ".lore"
        self.style_file = self.lore_dir / "style_template.json"
        self.uplink = AntigravityUplink()
        self.x_api = XAPI()
        
        # Ensure lore directory exists
        self.lore_dir.mkdir(exist_ok=True)

    async def ingest_style(self) -> bool:
        """Scan .lore/ for writing samples and extract style motifs (Supporting ZIP, RTF, DOCX)."""
        SovereignHUD.persona_log("INFO", "Scanning the Lore Corpus (Recursive) for style motifs...")
        
        import zipfile
        import re
        
        samples = []
        
        def extract_rtf_text(rtf_bytes: bytes) -> str:
            """Rough RTF to text extraction."""
            try:
                rtf_text = rtf_bytes.decode('utf-8', errors='ignore')
                # Simple regex to strip RTF control codes
                text = re.sub(r'\\[a-zA-Z*]{1,32}(-?\d{1,10})?[ ]?', '', rtf_text)
                text = re.sub(r'\{|\}', '', text)
                # Strip long hexadecimal/binary dumps (images, OLE objects, etc.)
                text = re.sub(r'[a-fA-F0-9]{30,}', '', text)
                # Clean up multiple spaces left behind
                text = re.sub(r'\s+', ' ', text)
                return text.strip()
            except:
                return ""

        def extract_docx_text(docx_path: Path) -> str:
            """Extract text from .docx (DOCX is a ZIP of XML)."""
            try:
                with zipfile.ZipFile(docx_path) as z:
                    xml_content = z.read('word/document.xml').decode('utf-8')
                    # Strip XML tags
                    text = re.sub(r'<[^>]+>', '', xml_content)
                    return text
            except:
                return ""

        def process_directory(directory: Path):
            for f in directory.rglob("*"):
                if f.is_dir(): continue
                
                # 1. Plain Text / Markdown
                if f.suffix in ['.txt', '.md', '.qmd', '.bak'] and f.name != "style_template.json":
                    try:
                        samples.append(f.read_text(encoding='utf-8', errors='ignore'))
                    except: pass
                
                # 2. Scrivener Backups (ZIP)
                elif f.suffix == '.zip':
                    try:
                        with zipfile.ZipFile(f) as z:
                            for name in z.namelist():
                                if 'Files/Data/' in name and name.endswith('.rtf'):
                                    rtf_content = z.read(name)
                                    text = extract_rtf_text(rtf_content)
                                    if len(text) > 100: # Filter out tiny meta-docs
                                        samples.append(text)
                    except: pass
                
                # 3. Word Documents
                elif f.suffix == '.docx':
                    text = extract_docx_text(f)
                    if text: samples.append(text)

        process_directory(self.lore_dir)
        
        if not samples:
            SovereignHUD.persona_log("WARN", "Lore Corpus is empty or formats unreadable. Please add writing samples.")
            return False

        # Sort by length and take a representative slice to stay under context limits
        samples.sort(key=len, reverse=True)
        representative_samples = samples[:15] # Take the top 15 longest samples
        full_corpus = "\n\n---\n\n".join(representative_samples)[:15000] # Cap at 15k
        
        prompt = (
            "Analyze the following writing samples. Identify the cadence, tone, typical vocabulary, "
            "punctuation patterns, and formatting quirks. Return a JSON object representing this 'Style Template'.\n\n"
            f"SAMPLES:\n{full_corpus}"
        )
        
        response = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
        
        if response.get("status") == "success":
            style_data = response.get("data", {}).get("raw", "{}")
            # Attempt to extract JSON from markdown if needed
            if "```json" in style_data:
                style_data = style_data.split("```json")[1].split("```")[0].strip()
            
            try:
                 # Verify it's valid JSON
                json.loads(style_data)
                self.style_file.write_text(style_data, encoding='utf-8')
                SovereignHUD.persona_log("SUCCESS", "Style Template forged and locked in .lore/")
                return True
            except:
                # Fallback if LLM just returns text
                template = {"description": style_data}
                self.style_file.write_text(json.dumps(template), encoding='utf-8')
                SovereignHUD.persona_log("SUCCESS", "Style Template (Textual) captured in .lore/")
                return True
        
        SovereignHUD.persona_log("ERROR", f"Uplink failed to analyze style: {response.get('message', 'Unknown Error')}")
        return False

    async def gather_context(self) -> str:
        """Pulls latest entries from dev journal and memory."""
        SovereignHUD.persona_log("INFO", "Consulting Mimir's Well for project context...")
        
        context_parts = []
        
        # 1. Dev Journal
        journal_path = self.root / "dev_journal.qmd"
        if journal_path.exists():
            content = journal_path.read_text(encoding='utf-8')
            # Get last 2000 chars (usually the most recent)
            context_parts.append(f"### DEV JOURNAL SNIPPET:\n{content[-2000:]}")
            
        # 2. Memory
        memory_path = self.root / "memory.qmd"
        if memory_path.exists():
            content = memory_path.read_text(encoding='utf-8')
            context_parts.append(f"### RECENT MEMORIES:\n{content[-2000:]}")
            
        return "\n\n".join(context_parts)

    async def generate_post(self, mode: str = "article", character: str = "narrator") -> Optional[str]:
        """Generates an X post based on context and BDD feature contracts."""
        voices_dir = self.lore_dir / "voices"
        
        # Determine the correct feature contract
        if mode == "article":
            contract_path = voices_dir / "article.feature"
        else:
            if character == "narrator":
                contract_path = voices_dir / "lore" / "narrator.feature"
            else:
                contract_path = voices_dir / "lore" / "characters" / f"{character.lower()}.feature"
                
        if not contract_path.exists():
            SovereignHUD.persona_log("WARN", f"Voice contract {contract_path.name} missing. Please ensure it exists.")
            return None
                
        voice_contract = contract_path.read_text(encoding='utf-8')
        project_context = await self.gather_context()
        
        prompt = (
            f"You are TALIESIN, the project's bard. You are operating in '{mode.upper()}' mode. "
            f"You MUST strictly roleplay according to the following Behavior-Driven (BDD) Voice Contract.\n\n"
            f"VOICE CONTRACT:\n```gherkin\n{voice_contract}\n```\n\n"
            f"PROJECT CONTEXT:\n{project_context}\n\n"
            "MANDATE: Output an update or short story (max 280 chars or a short thread) based on the context. "
            "You MUST exhibit the syntax, physical mannerisms, and internal monologue dictated by the Given/When/Then rules in the contract."
        )
        
        response = await self.uplink.send_payload(prompt, {"persona": "TALIESIN"})
        
        if response.get("status") == "success":
            return response.get("data", {}).get("raw")
        
        return None

    def staging_gate(self, draft: str) -> bool:
        """Terminal prompt interaction for review."""
        SovereignHUD.box_top("🔱 TALIESIN STAGING GATE")
        print(f"\n{draft}\n")
        SovereignHUD.box_separator()
        
        choice = input("Approve post to X? (y/n/edit): ").lower().strip()
        
        if choice == 'y':
            return self.x_api.post_article(draft)
        elif choice == 'edit':
            # Simple terminal edit simulation
            print("Enter/Paste your corrected version (End with Ctrl+D or a blank line):")
            lines = []
            while True:
                try:
                    line = input()
                    if not line: break
                    lines.append(line)
                except EOFError:
                    break
            new_draft = "\n".join(lines)
            
            # Save for reinforcement
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            reinforcement_file = self.lore_dir / f"reinforcement_{timestamp}.md"
            reinforcement_file.write_text(new_draft, encoding='utf-8')
            SovereignHUD.persona_log("INFO", "Correction saved for reinforcement.")
            
            return self.x_api.post_article(new_draft)
        else:
            SovereignHUD.persona_log("INFO", "Post discarded.")
            return False

async def main():
    import argparse
    import time
    
    parser = argparse.ArgumentParser(description="TALIESIN: Lore Ingestion & Social Interface Engine")
    parser.add_argument("--ingest", action="store_true", help="Scan .lore/ and extract style motifs (deprecated for BDD)")
    parser.add_argument("--mode", choices=["article", "story"], default="article", help="Generation mode")
    parser.add_argument("--character", type=str, default="narrator", help="Specific character to roleplay in story mode (e.g. Roan, Nicci)")
    parser.add_argument("--post", action="store_true", help="Generate and enter staging gate")
    
    args = parser.parse_args()
    
    project_root = Path(__file__).resolve().parent.parent.parent
    taliesin = TaliesinSpoke(project_root)
    
    if args.ingest:
        await taliesin.ingest_style()
    elif args.post or (not args.ingest):
        draft = await taliesin.generate_post(args.mode, args.character)
        if draft:
            taliesin.staging_gate(draft)
        else:
            SovereignHUD.persona_log("FAIL", "Lore generation failed.")

if __name__ == "__main__":
    import time
    asyncio.run(main())
