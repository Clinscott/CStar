"""
[WARDEN] Security Warden
Lore: "The lock on the Archive door."
Purpose: Identifies exposed secrets, unencrypted environment files, and outdated API keys.
"""

import os
import re
from pathlib import Path
from typing import Any

from src.core.engine.wardens.base import BaseWarden
from src.core.sovereign_hud import SovereignHUD

class SecurityWarden(BaseWarden):
    """
    [Ω] The Sentinel of Secrets.
    Scours the Archive for security breaches and unshielded environment files.
    """

    def scan(self) -> list[dict[str, Any]]:
        breaches = []
        SovereignHUD.log("INFO", "SecurityWarden: Initiating perimeter sweep...")

        # 1. Scour for raw .env.local (Should be vaulted)
        breaches.extend(self._scour_raw_env())

        # 2. Scour for hardcoded API keys
        breaches.extend(self._scour_hardcoded_keys())

        return breaches

    def _scour_raw_env(self) -> list[dict[str, Any]]:
        """Identifies raw environment files that should be encrypted."""
        breaches = []
        env_files = [".env", ".env.local", ".env.test"]
        
        for root, dirs, files in os.walk(self.root):
            # Prune ignored
            dirs[:] = [d for d in dirs if not self._should_ignore(Path(root) / d)]
            
            for f in files:
                if f in env_files:
                    path = Path(root) / f
                    breaches.append({
                        "type": "EXPOSED_ENV",
                        "file": str(path.relative_to(self.root)),
                        "action": "VAULT: Encrypt this file using 'src/tools/vault.py' and purge the raw version.",
                        "severity": "HIGH"
                    })
        return breaches

    def _scour_hardcoded_keys(self) -> list[dict[str, Any]]:
        """Identifies potential hardcoded API keys in source code."""
        breaches = []
        # Basic patterns for common API keys
        patterns = {
            "GOOGLE_KEY": re.compile(r'AIza[0-9A-Za-z\\-_]{35}'),
            "GENERIC_KEY": re.compile(r'key\s*=\s*["\'][0-9a-zA-Z]{32,45}["\']', re.I)
        }

        for root, dirs, files in os.walk(self.root / "src"):
            dirs[:] = [d for d in dirs if not self._should_ignore(Path(root) / d)]
            for f in files:
                if not f.endswith((".py", ".ts", ".tsx", ".js")): continue
                path = Path(root) / f
                try:
                    content = path.read_text(encoding='utf-8')
                    for name, p in patterns.items():
                        matches = list(p.finditer(content))
                        for m in matches:
                            line_no = content.count('\n', 0, m.start()) + 1
                            breaches.append({
                                "type": "HARDCODED_SECRET",
                                "file": str(path.relative_to(self.root)),
                                "action": f"REDACT: Remove hardcoded {name} and move to Vault.",
                                "severity": "CRITICAL",
                                "line": line_no
                            })
                except Exception: continue
        return breaches
