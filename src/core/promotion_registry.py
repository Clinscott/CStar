import json
import os
import hashlib
from datetime import datetime
from pathlib import Path

class PromotionRegistry:
    def __init__(self, root_path: str):
        self.root = Path(root_path)
        self.registry_path = self.root / ".agent" / "promotion_registry.json"
        self.registry = self._load_registry()

    def _load_registry(self) -> dict:
        if self.registry_path.exists():
            try:
                with open(self.registry_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return {}
        return {}

    def _save_registry(self) -> None:
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(self.registry, f, indent=2)

    def _get_hash(self, file_path: Path) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        return sha256.hexdigest()

    def register_promotion(self, skill_name: str, files: list[Path], status: str = "VERIFIED"):
        entry = {
            "timestamp": datetime.now().isoformat(),
            "status": status,
            "files": []
        }

        for f in files:
            if f.exists():
                entry["files"].append({
                    "path": str(f.relative_to(self.root)),
                    "hash": self._get_hash(f)
                })

        self.registry[skill_name] = entry
        self._save_registry()

    def is_verified(self, skill_name: str) -> bool:
        return self.registry.get(skill_name, {}).get("status") == "VERIFIED"
