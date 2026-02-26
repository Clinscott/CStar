import re
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.engine.memory_db import MemoryDB
from src.core.sovereign_hud import SovereignHUD


def bootstrap():
    """
    [ODIN] Initializing Semantic Context.
    Scans the .agent/workflows directory and populates ChromaDB with workflow intents.
    """
    SovereignHUD.box_top("BOOTSTRAP: SEMANTIC BRAIN")
    db = MemoryDB(str(project_root))

    workflow_dir = project_root / ".agent" / "workflows"
    if not workflow_dir.exists():
        SovereignHUD.box_row("ERROR", "Workflows directory not found.", SovereignHUD.RED)
        SovereignHUD.box_bottom()
        return

    count = 0
    # Scan for .md and .qmd files
    for f in list(workflow_dir.glob("*.md")) + list(workflow_dir.glob("*.qmd")):
        intent_id = f.stem
        content = f.read_text(encoding='utf-8')

        # Extract description from frontmatter
        # Pattern: description: "..." or description: ...
        match = re.search(r"^description:\s*['\"]?(.*?)['\"]?$", content, re.MULTILINE)

        if match:
            description = match.group(1).strip()
            # [ALFRED] Synthesize dense Semantic Target string for Hybrid Search
            # Forces trigger name and keywords into the embedding space
            unhyphenated_id = intent_id.replace('-', ' ')
            enriched_doc = f"[COMMAND: {intent_id}] {description}. Keywords: {unhyphenated_id}"

            SovereignHUD.box_row("INDEXING", f"{intent_id} -> {description[:30]}...", SovereignHUD.CYAN)
            db.upsert_skill(intent_id, enriched_doc, {"source": "workflow_bootstrap", "file": str(f.name)})
            count += 1
        else:
            SovereignHUD.box_row("SKIP", f"{intent_id} (No description found)", SovereignHUD.YELLOW)

    SovereignHUD.box_row("COMPLETE", f"Indexed {count} semantic intents.", SovereignHUD.GREEN)
    SovereignHUD.box_bottom()

if __name__ == "__main__":
    bootstrap()
