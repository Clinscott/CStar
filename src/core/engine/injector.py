"""
[SPOKE] Sovereign Injector
Lore: "The Eyes of Huginn."
Purpose: Handle JIT skill discovery from skills_db and proactive lexicon expansion.
"""

import re
import logging
from pathlib import Path
from src.core.sovereign_hud import SovereignHUD
from src.core.engine.vector import SovereignVector
from src.tools.brave_search import BraveSearch
from src.tools.gemini_search import GeminiSearch

class SovereignInjector:
    def __init__(self, project_root: Path, thresholds: dict):
        self.project_root = project_root
        self.thresholds = thresholds
        
        # Determine global skills path
        from src.core import utils
        config = utils.load_config(str(self.project_root))
        k_config = config.get("knowledge", {})
        active = k_config.get("active_core", "primary")
        self.skills_db_path = Path(k_config.get("cores", {}).get(active) or 
            config.get("KnowledgeCore") or 
            str(Path(config.get("system", {}).get("framework_root", "")) / "skills_db"))

    def proactive_discovery(self, query: str) -> dict | None:
        """Scans skills_db/ for relevant uninstalled skills."""
        if not self.skills_db_path.exists():
            return None

        SovereignHUD.persona_log("INFO", "SovereignEngine: Local skills insufficient. Scanning skills_db...")
        
        global_vector = SovereignVector(None, None, None)
        global_vector.load_skills_from_dir(str(self.skills_db_path))
        global_vector.build_index()
        
        results = global_vector.search(query)
        if results and results[0]['score'] > self.thresholds["REC"]:
            top = results[0]
            SovereignHUD.persona_log("SUCCESS", f"SovereignEngine: Found potential skill '{top['trigger']}' in database.")
            return {
                "trigger": "AUTO_INSTALL",
                "score": top['score'],
                "is_global": True,
                "extracted_entities": {"skill_name": top['trigger']}
            }
        return None

    def proactive_lexicon_lift(self, query: str, engine: SovereignVector) -> None:
        """Identify unknown terms and trigger a web search to expand the lexicon."""
        words = re.findall(r'\b[a-zA-Z_]{4,}\b', query.lower())
        unknown_terms = [w for w in words if w not in engine.vocab and w not in engine.stopwords]

        if not unknown_terms:
            return

        term = unknown_terms[0]
        SovereignHUD.persona_log("INFO", f"Raven's Eye: Unknown term '{term}'. Seeking definition.")

        gemini = GeminiSearch()
        searcher = gemini if gemini.is_available() else BraveSearch()
        results = searcher.search(f"Technical definition and synonyms for {term}")

        if not results:
            return

        definition = results[0].get('description', '')
        if not definition:
            return

        SovereignHUD.persona_log("INFO", f"Raven's Eye: Ingesting intelligence for '{term}'.")
        engine.add_skill(f"LEXICON:{term}", definition, domain="GENERAL")

        # Persistent Learning
        try:
            t_path = self.project_root / "src" / "data" / "thesaurus.qmd"
            if t_path.exists():
                content = t_path.read_text(encoding='utf-8')
                if f"**{term}**" not in content:
                    new_entry = f"""
- **{term}**: {term}, {definition[:50].replace(',', ' ')}"""
                    t_path.write_text(content + new_entry, encoding='utf-8')
                    SovereignHUD.persona_log("SUCCESS", f"Lexicon Expanded: '{term}' added.")
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Thesaurus update failed: {e}")
