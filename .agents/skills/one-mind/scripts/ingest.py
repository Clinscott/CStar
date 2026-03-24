import sqlite3
import json
import sys
import hashlib
import time
from pathlib import Path

# --- BOOTSTRAP ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
DB_PATH = PROJECT_ROOT / ".stats" / "pennyone.db"

def ingest_file(file_path_str, intent, interaction):
    file_path = Path(file_path_str).resolve()
    if not file_path.exists():
        print(f"[ERROR] File not found: {file_path}")
        return

    rel_path = str(file_path) # Hall uses absolute paths in the 'path' column based on previous checks
    
    # Calculate hash
    content = file_path.read_text(encoding='utf-8')
    content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
    
    repo_id = "repo:/home/morderith/Corvus/CStar"
    scan_id = f"agent-ingest:{int(time.time())}"
    
    conn = sqlite3.connect(str(DB_PATH))
    try:
        # Check if record exists
        existing = conn.execute("SELECT id FROM hall_files WHERE path = ?", (rel_path,)).fetchone()
        
        if existing:
            conn.execute("""
                UPDATE hall_files SET 
                    intent_summary = ?, 
                    interaction_summary = ?, 
                    content_hash = ?,
                    scan_id = ?
                WHERE path = ?
            """, (intent, interaction, content_hash, scan_id, rel_path))
            print(f"[ALFRED]: Updated intelligence for {file_path.name}")
        else:
            conn.execute("""
                INSERT INTO hall_files (
                    repo_id, scan_id, path, content_hash, language, 
                    gungnir_score, intent_summary, interaction_summary, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                repo_id, scan_id, rel_path, content_hash, file_path.suffix,
                0.0, intent, interaction, int(time.time() * 1000)
            ))
            print(f"[ALFRED]: Ingested new intelligence for {file_path.name}")
            
        conn.commit()
    finally:
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python3 ingest.py <file_path> <intent> <interaction>")
        sys.exit(1)
        
    ingest_file(sys.argv[1], sys.argv[2], sys.argv[3])
