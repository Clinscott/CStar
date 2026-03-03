import sys
import os
from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# Also add the .agent/scripts for legacy engine imports
SCRIPTS_DIR = PROJECT_ROOT / ".agent" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.append(str(SCRIPTS_DIR))

from src.core.engine.vector import SovereignVector

class CJKDiagnostic:
    """[O.D.I.N.] Orchestration logic for CJK (Chinese, Japanese, Korean) intent resonance."""

    @staticmethod
    def execute() -> None:
        """
        Initializes SovereignVector and runs CJK-specific search diagnostics.
        """
        thesaurus = str(PROJECT_ROOT / 'thesaurus.qmd')
        corrections = str(PROJECT_ROOT / '.agent' / 'corrections.json')
        stopwords = str(PROJECT_ROOT / '.agent' / 'scripts' / 'stopwords.json')

        engine = SovereignVector(
            thesaurus,
            corrections,
            stopwords
        )
        engine.load_core_skills()
        engine.build_index()

        def _search_and_print(query):
            r = engine.search(query)
            if r:
                print(f"Query: {query}")
                print(f"  Score: {r[0]['score']:.4f}, Trigger: {r[0]['trigger']}")
                return {"query": query, "score": r[0]['score'], "trigger": r[0]['trigger']}
            else:
                print(f"Query: {query} -> No results")
                return {"query": query, "result": "No results"}

        # CJK Query: "部署" (deploy)
        q1 = "部署"
        _search_and_print(q1)

        # Non-existent CJK term
        q2 = "不存在的词语"
        _search_and_print(q2)

if __name__ == '__main__':
    CJKDiagnostic.execute()
