import argparse
import sys
import subprocess
import hashlib
import json
import sqlite3
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def get_db_connection():
    db_path = PROJECT_ROOT / ".stats" / "pennyone.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    
    # Ensure FTS5 table exists
    conn.execute('''
        CREATE VIRTUAL TABLE IF NOT EXISTS intents_fts USING fts5(
            path,
            intent,
            interaction_protocol,
            tokenize='porter unicode61'
        )
    ''')
    return conn

def update_fts_index(conn, path: str, intent: str, protocol: str):
    conn.execute('DELETE FROM intents_fts WHERE path = ?', (path,))
    conn.execute('INSERT INTO intents_fts (path, intent, interaction_protocol) VALUES (?, ?, ?)', (path, intent, protocol))
    conn.commit()

def run_one_mind(prompt: str) -> str:
    """Invokes the One Mind skill directly via the dispatcher."""
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists(): venv_python = Path(sys.executable)
    
    cmd = [
        str(venv_python), str(cstar_dispatcher), "one-mind",
        "--prompt", prompt,
        "--json"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding='utf-8')
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] One Mind failure: {e.stderr}", file=sys.stderr)
        return ""

def crawl_directory(root_path: Path):
    """Crawls directory ignoring common heavy folders."""
    ignore_dirs = {'.git', 'node_modules', '.venv', 'dist', 'build', '.agents', '.stats'}
    valid_exts = {'.py', '.ts', '.js', '.md', '.qmd'}
    
    for path in root_path.rglob('*'):
        if path.is_file() and path.suffix in valid_exts:
            if not any(part in ignore_dirs for part in path.parts):
                yield path

def main():
    parser = argparse.ArgumentParser(description="Scan: Pure Python Repository Indexer.")
    parser.add_argument("--path", default=".", help="The root path or sector to scan.")
    parser.add_argument("--force", action="store_true", help="Force re-analysis of all files.")
    parser.add_argument("--bead", type=int, help="Bead ID to process and resolve.")
    parser.add_argument("--mock", action="store_true", help="Use mock intent generation.")
    args = parser.parse_args()

    # Extract path from bead if provided
    target_path = args.path
    if args.bead:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT description FROM norn_beads WHERE id = ?", (args.bead,))
        row = cursor.fetchone()
        if row and "SCAN_SECTOR:" in row[0]:
            target_path = row[0].split("SCAN_SECTOR:")[1].strip()
            print(f"[🔱] Huginn: Targeting sector '{target_path}' via Bead {args.bead}...", file=sys.stderr)
        conn.close()

    root_dir = PROJECT_ROOT / target_path
    if not root_dir.exists():
        print(f"[ALFRED]: Sector {target_path} does not exist.", file=sys.stderr)
        return

    # Load Matrix Graph
    graph_path = PROJECT_ROOT / ".stats" / "matrix-graph.json"
    graph_data = {"files": []}
    if not args.force and graph_path.exists():
        try:
            graph_data = json.loads(graph_path.read_text(encoding='utf-8'))
        except Exception:
            pass

    hash_map = {f['path']: f for f in graph_data.get('files', [])}
    db_conn = get_db_connection()
    
    print(f"[ALFRED]: Initializing Python Scan for {target_path}...", file=sys.stderr)
    
    files_to_scan = list(crawl_directory(root_dir))
    scanned_count = 0

    for i, file_path in enumerate(files_to_scan):
        try:
            content = file_path.read_text(encoding='utf-8')
            current_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            rel_path = file_path.relative_to(PROJECT_ROOT).as_posix()
            
            existing = hash_map.get(rel_path)
            if not args.force and existing and existing.get('hash') == current_hash:
                continue

            print(f" ◈ Scanning: {rel_path} ({i+1}/{len(files_to_scan)})", file=sys.stderr)
            
            prompt = f"""
            Analyze the following file and provide its architectural intent and interaction protocol.
            File: {rel_path}
            Content (truncated):
            {content[:1500]}
            
            Output a JSON object exactly like this:
            {{"intent": "description of what it does", "interaction": "how to use it"}}
            """
            
            if args.mock:
                intent_data = {"intent": f"Mock intent for {rel_path}", "interaction": "Standard interaction."}
            else:
                raw_json = run_one_mind(prompt)
                try:
                    clean_json = raw_json[raw_json.find("{"):raw_json.rfind("}")+1]
                    intent_data = json.loads(clean_json)
                except Exception:
                    intent_data = {"intent": "Failed to parse One Mind response.", "interaction": "Unknown"}

            file_record = {
                "path": rel_path,
                "hash": current_hash,
                "intent": intent_data.get("intent", ""),
                "interaction_protocol": intent_data.get("interaction", "")
            }
            
            hash_map[rel_path] = file_record
            update_fts_index(db_conn, rel_path, file_record["intent"], file_record["interaction_protocol"])
            scanned_count += 1
            
        except Exception as e:
            print(f"   [!] Failed to scan {file_path.name}: {e}", file=sys.stderr)

    # Save Matrix Graph
    graph_data["files"] = list(hash_map.values())
    graph_path.parent.mkdir(parents=True, exist_ok=True)
    graph_path.write_text(json.dumps(graph_data, indent=2), encoding='utf-8')
    db_conn.close()

    print(f"[ALFRED]: Scan complete. {scanned_count} sectors updated in the Matrix.", file=sys.stderr)

if __name__ == "__main__":
    main()
