"""
┌────────────────────────────────────────── Ω VAULT ENGINE Ω ──────────────────────────────────────────┐
│ THE FORTRESS OF KEYS: Secure management of the realm's lifeblood.                                     │
│ Developed under Operation Ironclad (Phase 72).                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
"""
import os
import sys
import json
import base64
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Add project root to sys.path
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.core.sovereign_hud import SovereignHUD

class SovereignVault:
    """[ODIN] The master of secrets. Handles encryption, rotation, and shielding."""
    
    def __init__(self):
        self.root = project_root
        self.vault_dir = self.root / ".agent" / "vault"
        self.key_file = self.vault_dir / "master.key"
        self.env_local = self.root / ".env.local"
        
        self.vault_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_master_key()

    def _ensure_master_key(self):
        """Generates a master key if one does not exist."""
        if not self.key_file.exists():
            SovereignHUD.persona_log("INFO", "Master Key missing. Generating new entropy...")
            key = Fernet.generate_key()
            self.key_file.write_bytes(key)
            SovereignHUD.persona_log("SUCCESS", "Master Key forged.")
        self.cipher = Fernet(self.key_file.read_bytes())

    def shield(self):
        """Encrypts .env.local into a vault artifact."""
        if not self.env_local.exists():
            SovereignHUD.persona_log("WARN", ".env.local not found. Nothing to shield.")
            return

        SovereignHUD.box_top("🛡️ SHIELDING REALM SECRETS")
        
        try:
            raw_data = self.env_local.read_text(encoding='utf-8')
            encrypted_data = self.cipher.encrypt(raw_data.encode('utf-8'))
            
            artifact_path = self.vault_dir / "secrets.bin"
            artifact_path.write_bytes(encrypted_data)
            
            SovereignHUD.box_row("ARTIFACT", str(artifact_path.name), SovereignHUD.GREEN)
            SovereignHUD.box_row("STATUS", "ENCRYPTED & STORED", SovereignHUD.CYAN)
            SovereignHUD.box_bottom()
            
            # [ODIN] We keep the raw file for now, but in Ironclad we might purge it.
            SovereignHUD.persona_log("INFO", "Raw .env.local remains for active use. Vault artifact is synced.")
        except Exception as e:
            SovereignHUD.persona_log("FAIL", f"Shielding failed: {e}")

    def rotate(self):
        """Rotates the master key and re-encrypts all secrets."""
        SovereignHUD.persona_log("WARN", "Initiating Master Key Rotation Ceremony...")
        old_cipher = self.cipher
        
        # Generate new key
        new_key = Fernet.generate_key()
        new_cipher = Fernet(new_key)
        
        artifact_path = self.vault_dir / "secrets.bin"
        if artifact_path.exists():
            raw = old_cipher.decrypt(artifact_path.read_bytes())
            new_encrypted = new_cipher.encrypt(raw)
            artifact_path.write_bytes(new_encrypted)
            
        self.key_file.write_bytes(new_key)
        self.cipher = new_cipher
        SovereignHUD.persona_log("SUCCESS", "Rotation Complete. All artifacts re-keyed.")

    def get_secrets_map(self) -> dict[str, str]:
        """Returns a dictionary of key-value pairs from .env.local for redaction purposes."""
        secrets = {}
        if self.env_local.exists():
            content = self.env_local.read_text(encoding='utf-8')
            for line in content.splitlines():
                line = line.strip()
                if line and "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    val = val.strip().strip('"').strip("'")
                    if val and len(val) > 4: # Only redact substantial secrets
                        secrets[key.strip()] = val
        return secrets

def main():
    vault = SovereignVault()
    if len(sys.argv) < 2:
        print("Usage: cstar vault [shield|rotate|status]")
        return

    cmd = sys.argv[1].lower()
    if cmd == "shield":
        vault.shield()
    elif cmd == "rotate":
        vault.rotate()
    elif cmd == "status":
        SovereignHUD.box_top("VAULT STATUS")
        SovereignHUD.box_row("KEY", "EXISTS" if vault.key_file.exists() else "MISSING")
        SovereignHUD.box_row("SECRETS", "SYNCED" if (vault.vault_dir / "secrets.bin").exists() else "EMPTY")
        SovereignHUD.box_bottom()
    else:
        print(f"Unknown vault command: {cmd}")

if __name__ == "__main__":
    main()
