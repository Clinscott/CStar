"""
[SPOKE] Sovereign Builder
Lore: "The Architect of Neural Pathways."
Purpose: Initialization and assembly of the SovereignVector search engine.
"""

from pathlib import Path
from src.core.engine.instruction_loader import InstructionLoader
from src.core.engine.memory_db import MemoryDB
from src.core.engine.vector import SovereignVector

class SovereignBuilder:
    """
    [Ω] The Architect spoke.
    Responsible for loading core skills, local skills, and building the semantic index.
    """
    def __init__(self, project_root: Path, base_path: Path, thresholds: dict):
        self.project_root = project_root
        self.base_path = base_path
        self.thresholds = thresholds

    def build_vector_engine(self, skills_db_path: Path) -> SovereignVector:
        """Initializes and builds the semantic search index."""
        thesaurus = self.project_root / "src" / "data" / "thesaurus.qmd"
        corrections = self.base_path / "corrections.json"
        stopwords = self.project_root / "src" / "data" / "stopwords.json"

        memory_db = MemoryDB(str(self.base_path))
        instruction_loader = InstructionLoader(str(self.project_root))

        if skills_db_path.exists():
            instruction_loader.add_source(str(skills_db_path))

        vector = SovereignVector(str(thesaurus), str(corrections), str(stopwords))
        vector.memory_db = memory_db
        vector.loader = instruction_loader

        vector.load_core_skills()
        vector.load_skills_from_dir(str(self.project_root / "src" / "skills" / "local"))
        vector.build_index()

        return vector
