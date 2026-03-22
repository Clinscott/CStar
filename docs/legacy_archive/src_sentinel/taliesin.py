"""
[SPOKE] TALIESIN - Textual Articulation and Lore Ingestion Engine
Lore: "The Bard of the Sector."
Purpose: Analyze user style, gather project context, and generate X content.
"""

import asyncio
import json
import os
import time
from pathlib import Path

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink
from docs.legacy_archive.src_sentinel.x_api import XAPI

class TaliesinSpoke:
    def __init__(self, root_path: Path):
        self.root = root_path
        self.lore_dir = root_path / ".lore"
        self.style_file = self.lore_dir / "style_template.json"
        self.uplink = AntigravityUplink()
        self.x_api = XAPI()
        
        # Ensure lore directory exists
        self.lore_dir.mkdir(exist_ok=True)
        
        # Load exemplars if they exist (Phase 8: EAS/NDS)
        self.exemplars = {}
        exemplar_path = self.lore_dir / "exemplars.json"
        if exemplar_path.exists():
            try:
                self.exemplars = json.loads(exemplar_path.read_text(encoding='utf-8'))
            except Exception:
                pass

    async def ingest_style(self) -> bool:
        """Scan .lore/ for writing samples and update BDD voice contracts in .lore/voices/."""
        SovereignHUD.log("INFO", "Scanning the Lore Corpus for voice contract refinement...")

        import zipfile
        import re

        samples = []

        def extract_rtf_text(rtf_bytes: bytes) -> str:
            """Rough RTF to text extraction."""
            try:
                rtf_text = rtf_bytes.decode('utf-8', errors='ignore')
                text = re.sub(r'\\[a-zA-Z*]{1,32}(-?\d{1,10})?[ ]?', '', rtf_text)
                text = re.sub(r'\{|\}', '', text)
                text = re.sub(r'[a-fA-F0-9]{30,}', '', text)
                text = re.sub(r'\s+', ' ', text)
                return text.strip()
            except Exception:
                return ""

        def extract_docx_text(docx_path: Path) -> str:
            """Extract text from .docx (DOCX is a ZIP of XML)."""
            try:
                with zipfile.ZipFile(docx_path) as z:
                    xml_content = z.read('word/document.xml').decode('utf-8')
                    text = re.sub(r'<[^>]+>', '', xml_content)
                    return text
            except Exception:
                return ""

        def process_directory(directory: Path):
            voices_dir = directory / "voices"
            for f in directory.rglob("*"):
                if f.is_dir():
                    continue
                # Skip voice contracts and style template
                if voices_dir.exists() and str(f).startswith(str(voices_dir)):
                    continue
                if f.name == "style_template.json" or f.name == "staging_queue.json":
                    continue

                if f.suffix in ['.txt', '.md', '.qmd', '.bak']:
                    try:
                        samples.append(f.read_text(encoding='utf-8', errors='ignore'))
                    except Exception:
                        pass
                elif f.suffix == '.zip':
                    try:
                        with zipfile.ZipFile(f) as z:
                            for name in z.namelist():
                                if 'Files/Data/' in name and name.endswith('.rtf'):
                                    rtf_content = z.read(name)
                                    text = extract_rtf_text(rtf_content)
                                    if len(text) > 100:
                                        samples.append(text)
                    except Exception:
                        pass
                elif f.suffix == '.docx':
                    text = extract_docx_text(f)
                    if text:
                        samples.append(text)

        process_directory(self.lore_dir)

        if not samples:
            SovereignHUD.log("WARN", "Lore Corpus is empty or formats unreadable. Please add writing samples.")
            return False

        # Sort by length and take best samples under context limits
        samples.sort(key=len, reverse=True)
        representative_samples = samples[:5]
        full_corpus = "\n\n---\n\n".join(representative_samples)[:30000]

        # Read existing voice contracts for reference
        voices_dir = self.lore_dir / "voices"
        existing_contracts = {}
        if voices_dir.exists():
            for feature_file in voices_dir.rglob("*.feature"):
                rel = feature_file.relative_to(voices_dir)
                existing_contracts[str(rel)] = feature_file.read_text(encoding='utf-8')

        updated_count = 0
        
        for rel_path, content in existing_contracts.items():
            SovereignHUD.log("INFO", f"Analyzing voice contract: {rel_path}...")
            
            prompt = (
                "You are a narrative voice analyst. Analyze the following manuscript and update the "
                f"BDD Gherkin voice contract for '{rel_path}' to accurately reflect the writing style found in the text.\n\n"
                "Analyze:\n"
                "- Cadence, sentence structure, and rhythm patterns\n"
                "- Vocabulary choices and recurring words\n"
                "- Punctuation patterns and formatting quirks\n"
                "- Character-specific speech patterns and emotional signatures\n\n"
                "EXISTING CONTRACT (use as a structural template, refine based on the manuscript):\n"
                f"```gherkin\n{content}\n```\n\n"
                "MANUSCRIPT EXCERPTS:\n"
                f"{full_corpus}\n\n"
                "MANDATE: Return ONLY the updated Gherkin feature file content. "
                "Do not include any other text or headers. Preserve the existing Given/When/Then "
                "structure but enrich the rules with specific examples, quotes, and patterns drawn directly from the manuscript."
            )
            
            response = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
            
            if response.get("status") != "success":
                SovereignHUD.log("WARN", f"Skipping {rel_path} due to uplink failure.")
                continue
                
            raw_output = response.get("data", {}).get("raw", "")
            if not raw_output:
                continue
                
            # Strip markdown code fences if present
            if raw_output.startswith('```gherkin'):
                raw_output = raw_output[len('```gherkin'):].strip()
            elif raw_output.startswith('```'):
                raw_output = raw_output[3:].strip()
            if raw_output.endswith('```'):
                raw_output = raw_output[:-3].strip()
                
            target_path = voices_dir / rel_path
            
            # Backup existing contract
            if target_path.exists():
                backup = target_path.with_suffix('.feature.bak')
                backup.write_text(target_path.read_text(encoding='utf-8'), encoding='utf-8')
                
            target_path.write_text(raw_output, encoding='utf-8')
            updated_count += 1
            SovereignHUD.log("SUCCESS", f"Voice contract updated: {rel_path}")

        if updated_count == 0:
            SovereignHUD.log("WARN", "No voice contracts were parsed from the analysis.")
            return False

        SovereignHUD.log(
            "SUCCESS",
            f"Ingestion complete. {updated_count} voice contract(s) updated in .lore/voices/"
        )
        return True

    async def gather_context(self) -> str:
        """Pulls latest entries from dev journal and memory."""
        SovereignHUD.log("INFO", "Consulting Mimir's Well for project context...")
        
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

    async def build_candidate_brief(self, request: "ForgeCandidateRequest") -> str:
        """Build a bounded forge brief from a canonical candidate request."""
        project_context = await self.gather_context()
        contracts = ", ".join(request.contract_refs) if request.contract_refs else "none"
        acceptance = request.acceptance_criteria or "Improve the target without regressing the baseline."
        return (
            f"BEAD ID: {request.bead_id}\n"
            f"TARGET PATH: {request.target_path}\n"
            f"RATIONALE: {request.rationale}\n"
            f"CONTRACT REFS: {contracts}\n"
            f"BASELINE SCORES: {json.dumps(request.baseline_scores)}\n"
            f"ACCEPTANCE: {acceptance}\n\n"
            f"{project_context}"
        )

    async def generate_post(self, mode: str = "article", character: str = "narrator") -> str | None:
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
            SovereignHUD.log("WARN", f"Voice contract {contract_path.name} missing. Please ensure it exists.")
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

    async def generate_scene(self, characters: list[str]) -> str | None:
        """Generates a cohesive scene involving the narrator and multiple characters."""
        voices_dir = self.lore_dir / "voices"
        contracts = []
        
        # Always include narrator
        narrator_path = voices_dir / "lore" / "narrator.feature"
        if narrator_path.exists():
            contracts.append(f"NARRATOR:\n{narrator_path.read_text(encoding='utf-8')}")
            
        for char in characters:
            path = voices_dir / "lore" / "characters" / f"{char.lower()}.feature"
            if path.exists():
                contracts.append(f"CHARACTER ({char.upper()}):\n{path.read_text(encoding='utf-8')}")
                
        if not contracts:
            SovereignHUD.log("WARN", "No voice contracts found for scene generation.")
            return None
            
        project_context = await self.gather_context()
        
        # Prepare Exemplars and Negative Directives (EAS/NDS)
        exemplar_str = ""
        if self.exemplars:
            narrator_exemplars = self.exemplars.get("narrator", [])
            char_exemplars = []
            for char in characters:
                char_exemplars.extend(self.exemplars.get(char.lower(), []))
            
            exemplar_str = "\n\n### EXEMPLAR SOURCE (Raw Manuscript Fragments for Style Anchor)\n"
            if narrator_exemplars:
                exemplar_str += "NARRATOR PROSE PATTERNS:\n- " + "\n- ".join(narrator_exemplars) + "\n"
            if char_exemplars:
                exemplar_str += "CHARACTER DIALOGUE/BEHAVIOR PATTERNS:\n- " + "\n- ".join(char_exemplars) + "\n"
            
            forbidden = self.exemplars.get("forbidden", [])
            if forbidden:
                exemplar_str += "\n### NEGATIVE DIRECTIVES (Strictly FORBIDDEN AI-isms/Modernisms)\n"
                exemplar_str += "- NEVER use modern tactical or logistical terminology: " + ", ".join(forbidden) + "\n"
                exemplar_str += "- AVOID modern psychological or sociological framing (e.g., 'collecting himself', 'social cues').\n"
                exemplar_str += "- ARREST Narrative Acceleration: Do not name characters not present in the reference segment.\n"

        prompt = (
            "You are TALIESIN. Generate a narrative scene segment involving the following personas. "
            "You MUST strictly adhere to the linguistic patterns, metaphors, and behaviors in their respective contracts.\n\n"
            "VOICE CONTRACTS:\n" + "\n\n".join(contracts) + "\n\n"
            f"CONTEXT:\n{project_context}\n"
            f"{exemplar_str}\n"
            "MANDATE: Write a 500-800 word scene segment. Ensure character dialogue and narrator prose "
            "are distinct, heavy with sensory detail, and strictly follow the EXEMPLAR style over generic AI storytelling."
        )
        
        # Use direct strike to avoid Mimir cancel scope task bleed
        response = await self.uplink._direct_strike(prompt, {"persona": "TALIESIN"})
        if response.get("status") == "success":
            return response.get("data", {}).get("raw")
        return None

    async def calculate_cohesion(self, generated_text: str, reference_text: str) -> dict:
        """Analyze generated prose against a reference manuscript for linguistic resonance."""
        prompt = (
            "Analyze the following GENERATED TEXT against the REFERENCE MANUSCRIPT. "
            "Score the cohesion across three dimensions (0-100) and provide qualitative feedback.\n\n"
            f"REFERENCE MANUSCRIPT:\n{reference_text[:15000]}\n\n"
            f"GENERATED TEXT:\n{generated_text}\n\n"
            "Output the analysis in JSON format with these keys:\n"
            "- lexical_accuracy: score and specific word-choice feedback\n"
            "- syntactic_rhythm: score and sentence structure/cadence feedback\n"
            "- narrative_resonance: score and voice/tone consistency feedback\n"
            "- overall_score: average of the three\n"
            "- critical_delta: what is the most significant deviation from the source style?\n"
            "- forbidden_lexeme_count: how many forbidden modernisms (e.g., tactical/logistical terms) were found?"
        )
        
        # Use send_payload to leverage Mimir/Synaptic Link (or gemini-2.5-flash fallback)
        response = await self.uplink.send_payload(prompt, {"persona": "ODIN", "model": "gemini-3.1-flash-lite"})
        if response.get("status") == "success":
            raw = response.get("data", {}).get("raw", "")
            # Basic JSON extraction from markdown if necessary
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            try:
                # Remove any leading/trailing whitespace or non-JSON artifacts
                raw = raw.strip()
                return json.loads(raw)
            except Exception:
                return {"error": "Failed to parse cohesion JSON", "raw": raw}
        return {"error": "Uplink failed", "message": response.get("message", "Unknown error")}

    def staging_gate(self, draft: str) -> bool:
        """Dual-mode staging gate: JSON queue for agent orchestration, input() for terminal.

        When TALIESIN_AGENT_MODE is set, the draft is written to .lore/staging_queue.json
        for the Gemini CLI agent to review asynchronously. Otherwise, falls back to the
        original interactive terminal prompt.
        """
        if os.environ.get("TALIESIN_AGENT_MODE"):
            return self._staging_gate_agent(draft)
        return self._staging_gate_terminal(draft)

    def _staging_gate_agent(self, draft: str) -> bool:
        """Agent-mode gate: write draft to JSON staging queue for async review."""
        staging_file = self.lore_dir / "staging_queue.json"
        payload = {
            "draft": draft,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "status": "pending_review",
            "source": "taliesin",
        }
        staging_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        SovereignHUD.log("INFO", f"Draft staged for agent review at {staging_file.name}")
        return True

    def _staging_gate_terminal(self, draft: str) -> bool:
        """Terminal-mode gate: interactive input() review loop."""
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
            SovereignHUD.log("INFO", "Correction saved for reinforcement.")

            return self.x_api.post_article(new_draft)
        else:
            SovereignHUD.log("INFO", "Post discarded.")
            return False

async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="TALIESIN: Lore Ingestion & Social Interface Engine")
    parser.add_argument("--ingest", action="store_true", help="Scan .lore/ and update BDD voice contracts")
    parser.add_argument("--mode", choices=["article", "story"], default="article", help="Generation mode")
    parser.add_argument("--character", type=str, default="narrator", help="Specific character to roleplay")
    parser.add_argument("--scene", type=str, help="Comma-separated list of characters for ensemble scene generation")
    parser.add_argument("--score", type=str, help="Path to a draft to score for cohesion")
    parser.add_argument("--reference", type=str, help="Path to reference manuscript for scoring")
    parser.add_argument("--post", action="store_true", help="Generate and enter staging gate")
    
    args = parser.parse_args()
    
    project_root = Path(__file__).resolve().parent.parent.parent
    taliesin = TaliesinSpoke(project_root)
    
    if args.ingest:
        await taliesin.ingest_style()
    elif args.score:
        draft_path = Path(args.score)
        ref_path = Path(args.reference) if args.reference else taliesin.lore_dir / "Fallows Hallow - TALIESIN.txt"
        
        if not draft_path.exists():
            SovereignHUD.log("FAIL", f"Draft file {args.score} not found.")
            return
        if not ref_path.exists():
            SovereignHUD.log("FAIL", "Reference manuscript not found. Use --reference.")
            return
            
        draft = draft_path.read_text(encoding='utf-8')
        reference = ref_path.read_text(encoding='utf-8')
        
        SovereignHUD.log("INFO", f"Calculating cohesion score for {args.score}...")
        result = await taliesin.calculate_cohesion(draft, reference)
        
        SovereignHUD.box_top("Linguistic Cohesion Analysis")
        for key, val in result.items():
            if isinstance(val, dict):
                SovereignHUD.box_row(key.replace('_', ' ').title(), f"{val.get('score', 0)}% - {val.get('feedback', '')[:60]}...")
            else:
                SovereignHUD.box_row(key.replace('_', ' ').title(), val)
        SovereignHUD.box_bottom()
        
    elif args.scene:
        chars = [c.strip() for c in args.scene.split(",")]
        SovereignHUD.log("INFO", f"Generating ensemble scene for: Narrator, {', '.join(chars)}...")
        scene = await taliesin.generate_scene(chars)
        if scene:
            if args.post:
                taliesin.staging_gate(scene)
            else:
                print("\n" + "="*40 + "\nGENERATED SCENE:\n" + "="*40 + "\n")
                await SovereignHUD.stream_text(scene)
        else:
            SovereignHUD.log("FAIL", "Scene generation failed.")
            
    elif args.post or (not args.ingest):
        draft = await taliesin.generate_post(args.mode, args.character)
        if draft:
            taliesin.staging_gate(draft)
        else:
            SovereignHUD.log("FAIL", "Lore generation failed.")

if __name__ == "__main__":
    asyncio.run(main())
