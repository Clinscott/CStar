"""
[SPOKE] TALIESIN - Textual Articulation and Lore Ingestion Engine
Lore: "The Bard of the Sector."
Purpose: Analyze user style, gather project context, and generate high-fidelity content.
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink
from x_api import XAPI

class TaliesinSpoke:
    def __init__(self, root_path: Path):
        self.root = root_path
        self.lore_dir = root_path / ".lore"
        self.voices_dir = self.lore_dir / "voices"
        self.samples_dir = self.lore_dir / "samples"
        self.optimizer_dir = root_path / ".agents" / "skills" / "taliesin-optimizer"
        self.ledger_path = self.optimizer_dir / "ledger.json"
        self.uplink = AntigravityUplink()
        self.x_api = XAPI()
        
        # Ensure directory structure
        self.lore_dir.mkdir(exist_ok=True)
        self.voices_dir.mkdir(parents=True, exist_ok=True)
        self.samples_dir.mkdir(parents=True, exist_ok=True)
        self.optimizer_dir.mkdir(parents=True, exist_ok=True)
        
        # Load skill-specific ledger (The Ledger of the Bard)
        self.ledger = self._load_ledger()
        self.active_bead = self.ledger.get("active_bead")

    def _load_ledger(self) -> Dict[str, Any]:
        if self.ledger_path.exists():
            try:
                return json.loads(self.ledger_path.read_text(encoding='utf-8'))
            except Exception:
                pass
        return {"project": "Fallows Hallow", "active_bead": None, "history": [], "global_best": {}}

    def _save_ledger(self):
        self.ledger_path.write_text(json.dumps(self.ledger, indent=2), encoding='utf-8')

    async def sync_bead(self):
        """Handshake with the Hall to find or create the active TALIESIN bead."""
        if not self.active_bead:
            SovereignHUD.log("INFO", "No active TALIESIN bead found. Querying the Hall...")
            # We use the hall to find any 'OPEN' beads for taliesin
            prompt = "Search for an OPEN bead related to TALIESIN optimization or story materialization."
            response = await self.uplink.send_payload(prompt, {"persona": "ODIN", "workflow": "HALL_QUERY"})
            
            # If no bead is found, we should conceptually 'CREATE' one, but in this 
            # host-native flow, we'll mark the ledger with a new ephemeral ID until 
            # the Hall provides a canonical one.
            self.active_bead = f"bead_taliesin_{int(time.time())}"
            self.ledger["active_bead"] = self.active_bead
            self._save_ledger()
            SovereignHUD.log("SUCCESS", f"Tracking TALIESIN work under Bead: {self.active_bead}")

    # --- LORE INGESTION ---

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
                return text
            except Exception:
                return ""

        def process_directory(directory: Path):
            if not directory.exists(): return
            for f in directory.iterdir():
                if f.is_dir() and f.name not in ["voices", "archive"]:
                    process_directory(f)
                elif f.suffix.lower() == ".txt":
                    samples.append(f.read_text(encoding='utf-8', errors='ignore'))
                elif f.suffix.lower() == ".md":
                    samples.append(f.read_text(encoding='utf-8', errors='ignore'))
                elif f.suffix.lower() == ".rtf":
                    samples.append(extract_rtf_text(f.read_bytes()))
                elif f.suffix.lower() == ".docx":
                    try:
                        with zipfile.ZipFile(f) as zf:
                            import xml.etree.ElementTree as ET
                            xml_content = zf.read('word/document.xml')
                            tree = ET.fromstring(xml_content)
                            namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                            text = ""
                            for paragraph in tree.findall('.//w:p', namespace):
                                for run in paragraph.findall('.//w:t', namespace):
                                    text += run.text
                                text += "\n"
                            samples.append(text)
                    except Exception:
                        pass

        process_directory(self.lore_dir)

        if not samples:
            SovereignHUD.log("WARN", "Lore Corpus is empty or formats unreadable. Please add writing samples.")
            return False

        # Sort by length and take best samples under context limits
        samples.sort(key=len, reverse=True)
        representative_samples = samples[:5]
        full_corpus = "\n\n---\n\n".join(representative_samples)[:30000]

        # Read existing voice contracts for reference
        existing_contracts = {}
        if self.voices_dir.exists():
            for feature_file in self.voices_dir.rglob("*.feature"):
                rel = feature_file.relative_to(self.voices_dir)
                existing_contracts[str(rel)] = feature_file.read_text(encoding='utf-8')

        # If no existing contracts, create a default UserStyle
        if not existing_contracts:
            existing_contracts["UserStyle.feature"] = "Feature: UserStyle\n  Scenario: Default\n"

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
                
            target_path = self.voices_dir / rel_path
            target_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Backup existing contract
            if target_path.exists():
                backup = target_path.with_suffix('.feature.bak')
                backup.write_text(target_path.read_text(encoding='utf-8'), encoding='utf-8')
                
            target_path.write_text(raw_output, encoding='utf-8')
            updated_count += 1
            SovereignHUD.log("SUCCESS", f"Voice contract updated: {rel_path}")

        SovereignHUD.log(
            "SUCCESS",
            f"Ingestion complete. {updated_count} voice contract(s) updated in .lore/voices/"
        )
        return True

    # --- INTERACTIVE CHANT (THE SEER'S CHAMBER) ---

    async def seer_chamber(self) -> Dict[str, str]:
        """Conversational Q&A to gather the Chant Protocol (Interactive Mode)."""
        SovereignHUD.box_top("🔱 TALIESIN: THE SEER'S CHAMBER")
        
        questions = {
            "mode": "What is the MODE of this weave? (story | blog | social): ",
            "intent": "What is your INTENT? (The core message or goal): ",
            "blocking": "Describe the BLOCKING (Key events, physical movements, or structure): ",
            "anchors": "Are there any ANCHORS? (Specific words/phrases to include): ",
            "bans": "Are there any BANS? (Words/patterns to strictly avoid): "
        }
        
        chant = {}
        for key, question in questions.items():
            print(f"\n[🔱] {question}", end="", flush=True)
            if key == "mode":
                while True:
                    val = sys.stdin.readline().strip().lower()
                    if val in {"story", "blog", "social"}:
                        chant[key] = val
                        break
                    print("[!] Please enter 'story', 'blog', or 'social': ", end="", flush=True)
            else:
                chant[key] = sys.stdin.readline().strip()
                
        return chant

    def parse_chant(self, intent: str) -> Dict[str, str]:
        """Parses the standardized Chant Protocol from the intent string (Non-interactive)."""
        chant = {}
        patterns = {
            "mode": r"\[MODE\]:\s*(story|blog|social)",
            "intent": r"\[INTENT\]:\s*(.*?)(?=\[|$)",
            "blocking": r"\[BLOCKING\]:\s*(.*?)(?=\[|$)",
            "anchors": r"\[ANCHORS\]:\s*(.*?)(?=\[|$)",
            "bans": r"\[BANS\]:\s*(.*?)(?=\[|$)"
        }
        for key, pattern in patterns.items():
            match = re.search(pattern, intent, re.DOTALL | re.IGNORECASE)
            if match:
                chant[key] = match.group(1).strip()
        return chant

    # --- REFINEMENT (THE PHOENIX LOOP) ---

    async def phoenix_loop(self, chant: Dict[str, str], voice_name: str = "UserStyle") -> Optional[str]:
        """Iteratively refine the content until it meets high-fidelity thresholds."""
        voice_path = self.voices_dir / f"{voice_name}.feature"
        
        # Fallback to article.feature or any first feature if UserStyle is missing
        if not voice_path.exists():
            features = list(self.voices_dir.rglob("*.feature"))
            if features:
                voice_path = features[0]
                SovereignHUD.log("INFO", f"UserStyle missing. Using available contract: {voice_path.name}")
            else:
                SovereignHUD.log("WARN", "No voice contracts found. Ingesting style first...")
                await self.ingest_style()
                voice_path = self.voices_dir / "UserStyle.feature"
                if not voice_path.exists():
                    return None

        voice_contract = voice_path.read_text(encoding='utf-8')
        context = await self.gather_context()
        
        # 1. Initial Draft (The Forge)
        SovereignHUD.log("INFO", "Forging V1 Draft...")
        draft = await self._forge_v1(chant, voice_contract, context)
        if not draft: return None

        # 2. Iterative Audit & Recast (The Loop)
        max_iterations = 3
        
        for i in range(max_iterations):
            audit_report = await self._audit_draft(draft, voice_contract)
            
            # Extract score
            score_match = re.search(r"SCORE:\s*(\d+)", audit_report)
            current_score = int(score_match.group(1)) if score_match else 0
            
            SovereignHUD.log("INFO", f"Phoenix Loop Iteration {i+1}: Cohesion = {current_score}%")
            
            # Record Strike in Ledger
            self.ledger["history"].append({
                "iteration": i + 1,
                "bead_id": self.active_bead,
                "score": current_score,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "chant": chant
            })
            self._save_ledger()
            
            if current_score >= 95:
                SovereignHUD.log("SUCCESS", f"Linguistic Cohesion Threshold achieved: {current_score}%")
                
                # Update Global Best if appropriate
                best_score = self.ledger.get("global_best", {}).get("score", 0)
                if current_score > best_score:
                    self.ledger["global_best"] = {
                        "score": current_score,
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                        "draft": draft[:500] + "..."
                    }
                    self._save_ledger()
                break
            
            if i < max_iterations - 1:
                SovereignHUD.log("INFO", "Refining prose based on Audit feedback...")
                draft = await self._recast(draft, audit_report, chant, voice_contract, context)
                if not draft: break
            else:
                SovereignHUD.log("WARN", f"Maximum iterations reached. Final score: {current_score}%")

        return draft

    async def _forge_v1(self, chant: Dict[str, str], voice_contract: str, context: str) -> Optional[str]:
        system_prompt = (
            "You are TALIESIN, the Bard. Generate content that perfectly embodies the following Voice Contract.\n\n"
            "VOICE CONTRACT:\n"
            f"```gherkin\n{voice_contract}\n```\n\n"
            "MANDATE: Prioritize the emotional signature, cadence, and sensory anchors specified."
        )
        
        prompt = (
            f"MODE: {chant.get('mode', 'story').upper()}\n"
            f"INTENT: {chant.get('intent', 'narrative scene')}\n"
            f"BLOCKING: {chant.get('blocking', 'none')}\n"
            f"ANCHORS: {chant.get('anchors', 'none')}\n"
            f"BANS: {chant.get('bans', 'none')}\n\n"
            f"PROJECT CONTEXT:\n{context}\n\n"
            "Generate the high-fidelity draft now. Return ONLY the prose."
        )
        
        response = await self.uplink.send_payload(prompt, {"system_prompt": system_prompt, "persona": "TALIESIN"})
        return response.get("data", {}).get("raw") if response.get("status") == "success" else None

    async def _audit_draft(self, draft: str, voice_contract: str) -> str:
        prompt = (
            "You are the Style Auditor. Compare the AI-generated draft against the Voice Contract.\n\n"
            "VOICE CONTRACT:\n"
            f"```gherkin\n{voice_contract}\n```\n\n"
            "DRAFT:\n"
            f"{draft}\n\n"
            "MANDATE: Identify every generic AI-ism, every broken rule, and every loss of cadence.\n"
            "OUTPUT: A detailed audit report ending with 'SCORE: X/100'."
        )
        response = await self.uplink.send_payload(prompt, {"persona": "ODIN", "workflow": "TALIESIN_AUDIT"})
        return response.get("data", {}).get("raw", "SCORE: 0") if response.get("status") == "success" else "SCORE: 0"

    async def _recast(self, draft: str, audit: str, chant: Dict[str, str], voice_contract: str, context: str) -> Optional[str]:
        prompt = (
            "You are the Master Bard. Recast the following draft to fix the issues identified in the audit.\n\n"
            "VOICE CONTRACT:\n"
            f"```gherkin\n{voice_contract}\n```\n\n"
            "ORIGINAL DRAFT:\n"
            f"{draft}\n\n"
            "AUDIT FEEDBACK:\n"
            f"{audit}\n\n"
            "MANDATE: Fix the rhythm, replace generic words, and ensure anchors are used. Return ONLY the refined prose."
        )
        response = await self.uplink.send_payload(prompt, {"persona": "TALIESIN", "workflow": "TALIESIN_RECAST"})
        return response.get("data", {}).get("raw") if response.get("status") == "success" else None

    # --- UTILITIES ---

    async def gather_context(self) -> str:
        """Pulls latest entries from dev journal and memory."""
        context_parts = []
        
        # 1. Dev Journal
        journal_path = self.root / "docs" / "dev_journal.qmd"
        if journal_path.exists():
            content = journal_path.read_text(encoding='utf-8')
            context_parts.append(f"### DEV JOURNAL SNIPPET:\n{content[-2000:]}")
            
        # 2. Memory
        memory_path = self.root / ".agents" / "memory.qmd"
        if memory_path.exists():
            content = memory_path.read_text(encoding='utf-8')
            context_parts.append(f"### RECENT MEMORIES:\n{content[-2000:]}")
            
        return "\n\n".join(context_parts)

    async def calculate_cohesion(self, generated_text: str, reference_text: str) -> dict:
        """Analyze generated prose against a reference manuscript for linguistic resonance."""
        prompt = (
            "Analyze the following GENERATED TEXT against the REFERENCE MANUSCRIPT.\n"
            "Score cohesion (0-100) across: lexical_accuracy, syntactic_rhythm, narrative_resonance.\n\n"
            f"REFERENCE:\n{reference_text[:15000]}\n\n"
            f"GENERATED:\n{generated_text}\n\n"
            "Output JSON with: lexical_accuracy (dict), syntactic_rhythm (dict), narrative_resonance (dict), overall_score (int), critical_delta (str), forbidden_lexeme_count (int)."
        )
        
        response = await self.uplink.send_payload(prompt, {"persona": "ODIN", "model": "gemini-3.1-flash-lite"})
        if response.get("status") == "success":
            raw = response.get("data", {}).get("raw", "")
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            try:
                return json.loads(raw.strip())
            except Exception:
                return {"error": "Failed to parse cohesion JSON", "raw": raw}
        return {"error": "Uplink failed"}

    async def generate_scene(self, characters: List[str]) -> Optional[str]:
        """Generates an ensemble scene between multiple characters."""
        context = await self.gather_context()
        
        contract_fragments = []
        for char in ["narrator"] + characters:
            path = self.voices_dir / "lore" / "narrator.feature" if char == "narrator" else self.voices_dir / "lore" / "characters" / f"{char.lower()}.feature"
            if path.exists():
                contract_fragments.append(f"### {char.upper()} VOICE:\n{path.read_text(encoding='utf-8')}")

        prompt = (
            "ACT AS: The Master Bard.\n"
            "TASK: Weave an ensemble scene based on context and voice contracts.\n\n"
            f"CONTEXT:\n{context}\n\n"
            "VOICE CONTRACTS:\n"
            f"{'---\n'.join(contract_fragments)}\n\n"
            "MANDATE: Write a 500-800 word scene segment. Ensure distinct dialogue and sensory prose."
        )
        
        response = await self.uplink.send_payload(prompt, {"persona": "TALIESIN"})
        return response.get("data", {}).get("raw") if response.get("status") == "success" else None

    def staging_gate(self, draft: str) -> bool:
        """Dual-mode staging gate: JSON queue for agent orchestration, input() for terminal."""
        if os.environ.get("TALIESIN_AGENT_MODE"):
            return self._staging_gate_agent(draft)
        return self._staging_gate_terminal(draft)

    def _staging_gate_agent(self, draft: str) -> bool:
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
        SovereignHUD.box_top("🔱 TALIESIN STAGING GATE")
        print(f"\n{draft}\n")
        SovereignHUD.box_separator()

        choice = input("Approve post to X? (y/n/edit): ").lower().strip()

        if choice == 'y':
            return self.x_api.post_article(draft)
        elif choice == 'edit':
            print("Enter your corrected version (End with Ctrl+D or blank line):")
            lines = []
            while True:
                try:
                    line = input()
                    if not line: break
                    lines.append(line)
                except EOFError:
                    break
            new_draft = "\n".join(lines)
            return self.x_api.post_article(new_draft)
        else:
            SovereignHUD.log("INFO", "Post discarded.")
            return False
