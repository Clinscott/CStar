#!/usr/bin/env python3
"""
[SKILL] CacheBro
Lore: "The Archive remembers what the eye has already seen, sparing the mind from redundancy."
Purpose: Optimizes token usage by caching file contents and returning diffs for subsequent reads.
Inspired by: glommer/cachebro
"""

import hashlib
import json
import difflib
import sys
import os
from pathlib import Path
from typing import Optional

# [ALFRED] Ensure environment is loaded
try:
    project_root = Path(__file__).resolve().parents[4]
    sys.path.append(str(project_root))
    from src.sentinel._bootstrap import bootstrap
    bootstrap()
except (ImportError, ValueError, IndexError):
    pass

from src.core.sovereign_hud import SovereignHUD

class CacheBro:
    def __init__(self):
        self.root = Path(__file__).resolve().parents[4]
        self.cache_file = self.root / ".agent" / "cachebro.json"
        self.cache = self._load_cache()

    def _load_cache(self) -> dict:
        if self.cache_file.exists():
            try:
                return json.loads(self.cache_file.read_text(encoding='utf-8'))
            except json.JSONDecodeError:
                return {}
        return {}

    def _save_cache(self) -> None:
        self.cache_file.write_text(json.dumps(self.cache, indent=2), encoding='utf-8')

    def _get_hash(self, content: str) -> str:
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    def read_file(self, file_path: str) -> str:
        """
        Reads a file. Returns full content if new/changed, else [UNCHANGED].
        If changed, it can optionally return a diff.
        """
        p = Path(file_path)
        if not p.is_absolute():
            p = self.root / file_path
        
        if not p.exists():
            return f"Error: File {file_path} not found."

        content = p.read_text(encoding='utf-8', errors='replace')
        current_hash = self._get_hash(content)
        rel_path = str(p.relative_to(self.root))

        if rel_path in self.cache:
            last_hash = self.cache[rel_path]["hash"]
            if current_hash == last_hash:
                SovereignHUD.persona_log("INFO", f"Cache Hit: {rel_path} [UNCHANGED]")
                return f"[FILE: {rel_path}] [UNCHANGED]"
            else:
                last_content = self.cache[rel_path]["content"]
                diff = difflib.unified_diff(
                    last_content.splitlines(),
                    content.splitlines(),
                    fromfile=f"last/{rel_path}",
                    tofile=f"current/{rel_path}",
                    lineterm=""
                )
                SovereignHUD.persona_log("INFO", f"Cache Update: {rel_path} [DIFF GENERATED]")
                diff_text = "\n".join(diff)
                
                # Update cache
                self.cache[rel_path] = {"hash": current_hash, "content": content}
                self._save_cache()
                
                return f"[FILE: {rel_path}] [CHANGED]\nDIFF:\n{diff_text}"
        
        # New file
        SovereignHUD.persona_log("INFO", f"Cache Miss: {rel_path} [NEW]")
        self.cache[rel_path] = {"hash": current_hash, "content": content}
        self._save_cache()
        return f"[FILE: {rel_path}] [NEW CONTENT]\n{content}"

    def reset(self) -> None:
        self.cache = {}
        self._save_cache()
        SovereignHUD.persona_log("SUCCESS", "CacheBro Archive Purged.")

if __name__ == "__main__":
    bro = CacheBro()
    if len(sys.argv) < 2:
        print("Usage: python cache_bro.py <command> [file_path]")
        print("Commands: read, reset")
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == "read" and len(sys.argv) > 2:
        print(bro.read_file(sys.argv[2]))
    elif cmd == "reset":
        bro.reset()
    else:
        print("Invalid command or missing arguments.")
