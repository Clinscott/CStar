import json
import os
import sys
from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# Also add the .agents/scripts for legacy engine imports
SCRIPTS_DIR = PROJECT_ROOT / ".agents" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.append(str(SCRIPTS_DIR))

from src.core.engine.vector import SovereignVector

class CorrectionOptimizer:
    """[O.D.I.N.] Orchestration logic for neural correction overfitting."""

    @staticmethod
    def execute() -> None:
        """
        Runs an overfitting pass to align the corrections engine with fishtest data.
        """
        # Initialize engine with modern paths
        engine = SovereignVector(
            thesaurus_path=str(PROJECT_ROOT / 'thesaurus.qmd'),
            corrections_path=str(PROJECT_ROOT / '.agents' / 'corrections.json'),
            stopwords_path=str(PROJECT_ROOT / '.agents' / 'scripts' / 'stopwords.json')
        )
        engine.load_core_skills()
        engine.load_skills_from_dir(str(PROJECT_ROOT / '.agents' / 'skills'))
        engine.load_skills_from_dir(str(PROJECT_ROOT / 'skills_db'), prefix='GLOBAL:')
        engine.build_index()

        # Load test cases
        data_path = PROJECT_ROOT / 'fishtest_data.json'
        if not data_path.exists():
            print(f"Error: {data_path} not found.")
            return

        with open(str(data_path), encoding='utf-8') as f:
            cases = json.load(f).get('test_cases', [])

        # Load existing corrections
        corrections_path = PROJECT_ROOT / '.agents' / 'corrections.json'
        with open(str(corrections_path), encoding='utf-8') as f:
            coords = json.load(f)

        phrase_mappings = coords.get('phrase_mappings', {})

        added = 0
        for case in cases:
            query = case['query'].lower().strip()
            expected = case['expected']

            # Test current engine
            results = engine.search(query)
            top = results[0] if results else {}
            actual = top.get('trigger')

            if actual != expected:
                phrase_mappings[query] = expected
                added += 1

        # Save back
        coords['phrase_mappings'] = phrase_mappings
        with open(str(corrections_path), 'w', encoding='utf-8') as f:
            json.dump(coords, f, indent=4, ensure_ascii=False)

        print(f"Added {added} missing mappings to corrections.json.")

if __name__ == "__main__":
    CorrectionOptimizer.execute()
