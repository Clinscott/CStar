import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Resolve shared UI from src/core/
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core"))
from ui import HUD

# --- CRUCIBLE CONFIGURATION (THEMES) ---
THEMES = {
    "ODIN": {"TITLE": "Ω CRUCIBLE (WAR ROOM) Ω", "DETECTED": "Anomaly Sector", "PASS": "Subjugated", "FAIL": "Defiant", "COLOR_MAIN": HUD.RED},
    "ALFRED": {"TITLE": "C* THE CRUCIBLE (SYNC)", "DETECTED": "Trace Detected", "PASS": "Ingested", "FAIL": "Rejected", "COLOR_MAIN": HUD.CYAN}
}

def get_theme():
    """Module-level theme retriever for legacy tests."""
    return THEMES.get(HUD.PERSONA, THEMES["ALFRED"])

def log_rejection(filename: str, reason: str):
    """Module-level rejection log."""
    HUD.log_rejection(HUD.PERSONA, reason, filename)

def process_file(file_path: str):
    """Module-level process alias."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base = os.path.dirname(script_dir)
    root = os.path.dirname(base)
    CruciblePipeline(root, base).process(file_path)

class CruciblePipeline:
    """[ALFRED] Secure ingestion pipeline for the Federated Crucible."""
    def __init__(self, root: str, base: str):
        self.root, self.base = root, base
        self.stage = os.path.join(base, "traces", "staging")
        self.proc = os.path.join(base, "traces", "processed")
        self.quar = os.path.join(base, "traces", "quarantine")
        self.db = os.path.join(root, "fishtest_data.json")

    def process(self, file_path: str):
        name = os.path.basename(file_path)
        HUD.box_top("CRUCIBLE SCAN")
        HUD.log("INFO", f"Ingesting {name}")
        
        try:
            if os.path.getsize(file_path) > 5*10**6: raise ValueError("DoS: Oversized")
            os.makedirs(self.stage, exist_ok=True)
            staging_path = shutil.move(file_path, os.path.join(self.stage, name))
            
            # Merge & Ordeal
            backup = self.db + ".bak"
            shutil.copy2(self.db, backup)
            
            m_script = os.path.join(os.path.dirname(__file__), "merge_traces.py")
            res = subprocess.run([sys.executable, m_script, self.stage, self.db], capture_output=True)
            
            if res.returncode == 0:
                HUD.log("PASS", "Trace Ingested")
                if os.path.exists(backup): os.remove(backup)
            else:
                HUD.log("FAIL", "Merge Error")
                shutil.copy2(backup, self.db)
                
        except Exception as e:
            HUD.log("FAIL", f"Pipeline Error: {str(e)[:40]}")
        HUD.box_bottom()

class NetworkWatcher:
    """
    [ALFRED] Persistent monitor for the federated network share.
    Auto-detects incoming JSON traces and routes them to the CruciblePipeline.
    """
    def __init__(self, share_path: str, pipeline: CruciblePipeline):
        self.share = share_path
        self.pipeline = pipeline

    def watch(self):
        print(f"{HUD.CYAN}>> The Crucible is active. Watching: {self.share}...{HUD.RESET}")
        while True:
            try:
                for f in [f for f in os.listdir(self.share) if f.endswith('.json')]:
                    self.pipeline.process(os.path.join(self.share, f))
                time.sleep(3)
            except KeyboardInterrupt: break
            except (IOError, OSError): time.sleep(5)

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base = os.path.dirname(script_dir)
    root = os.path.dirname(base)
    share = os.path.join(root, "mock_project", "network_share")
    
    pipe = CruciblePipeline(root, base)
    NetworkWatcher(share, pipe).watch()
