"""
[SPOKE] Vector Config
Lore: "The base rules of the Bifröst."
Purpose: Handle file loading, JSON parsing, and asset hydration for the Vector engine.
"""

import json
from pathlib import Path
from src.core.sovereign_hud import SovereignHUD

class VectorConfig:
    def __init__(self, project_root: Path):
        self.project_root = project_root

    def load_json(self, path: Path) -> dict:
        if not path.exists():
            return {}
        try:
            with path.open(encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Config load failure [{path.name}]: {e}")
            return {}

    def load_stopwords(self, path: Path) -> set[str]:
        data = self.load_json(path)
        if isinstance(data, list):
            return set(data)
        return set(data.get("stopwords", []))

    def load_thesaurus(self, path: Path) -> dict[str, set[str]]:
        thesaurus = {}
        if not path.exists():
            return {}
        try:
            content = path.read_text(encoding="utf-8")
            # Basic qmd parsing: - **key**: syn1, syn2
            import re
            matches = re.findall(r'- \*\*(.*?)\*\*: (.*)', content)
            for key, syns in matches:
                thesaurus[key.lower()] = {s.strip().lower() for s in syns.split(",")}
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Thesaurus parse failure: {e}")
        return thesaurus
