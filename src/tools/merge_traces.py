import json
import os
import shutil
import sys
from pathlib import Path

# Import Shared UI
try:
    from src.core.sovereign_hud import SovereignHUD
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core"))
    from src.core.sovereign_hud import SovereignHUD

def _load_dataset(target_path):
    """Safely load the existing test dataset."""
    if not target_path.exists():
        return {"test_cases": []}
    try:
        with open(target_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        SovereignHUD.log("WARN", f"Dataset load failed: {str(e)[:30]}")
        return {"test_cases": []}

def _save_dataset(dataset, target_path):
    """Atomic save of the test dataset."""
    temp_target = str(target_path) + ".tmp"
    try:
        with open(temp_target, 'w', encoding='utf-8') as f:
            json.dump(dataset, f, indent=2)
        os.replace(temp_target, str(target_path))
        return True
    except (IOError, PermissionError) as e:
        SovereignHUD.log("FAIL", "Database Save Failed", str(e)[:30])
        if os.path.exists(temp_target): os.remove(temp_target)
        return False

def _process_single_trace(trace, existing_queries, dataset):
    """Integrate a single trace object into the dataset."""
    if not isinstance(trace, dict): return 0, 0
    query, match = trace.get('query'), trace.get('match')
    if not query or not match or not isinstance(query, str) or not isinstance(match, str):
        return 0, 0

    new_case = {
        "query": query, "expected": match, "min_score": 0.85,
        "tags": sorted(list(set(["federated", "real-user"] + [trace.get('persona', 'unknown')])))
    }
    if trace.get('is_global'): new_case['expected_global'] = True

    if query in existing_queries:
        existing = existing_queries[query]
        existing['expected'] = match
        existing['tags'] = sorted(list(set(existing.get('tags', []) + new_case['tags'])))
        if 'expected_global' in new_case: existing['expected_global'] = True
        return 0, 1
    else:
        dataset['test_cases'].append(new_case)
        existing_queries[query] = new_case
        return 1, 0

def _process_trace_file(trace_file, existing_queries, dataset, failed_dir):
    """Load and process a single trace JSON file."""
    try:
        if trace_file.stat().st_size > 5 * 1024 * 1024:
            raise ValueError("Size limit exceeded")
        with open(trace_file, 'r', encoding='utf-8') as f:
            content = json.load(f)
        
        n_added, n_updated = 0, 0
        for t in (content if isinstance(content, list) else [content]):
            a, u = _process_single_trace(t, existing_queries, dataset)
            n_added += a; n_updated += u
        return True, n_added, n_updated
    except Exception as e:
        SovereignHUD.log("WARN", f"Skip {trace_file.name}: {str(e)[:20]}")
        shutil.move(str(trace_file), str(failed_dir / trace_file.name))
        return False, 0, 0

def merge_traces(source_dir, target_file="fishtest_data.json"):
    """[ALFRED] Refactored trace merger with O(1) lookups and atomic persistence."""
    source_path, target_path = Path(source_dir), Path(target_file)
    processed_dir, failed_dir = source_path / "processed", source_path / "failed"
    processed_dir.mkdir(exist_ok=True); failed_dir.mkdir(exist_ok=True)

    dataset = _load_dataset(target_path)
    existing_queries = {c['query']: c for c in dataset.get('test_cases', [])}
    
    total_new, total_upd, files_ok = 0, 0, 0
    for trace_file in source_path.glob("*.json"):
        ok, n, u = _process_trace_file(trace_file, existing_queries, dataset, failed_dir)
        if ok:
            shutil.move(str(trace_file), str(processed_dir / trace_file.name))
            total_new += n; total_upd += u; files_ok += 1

    if files_ok > 0:
        if _save_dataset(dataset, target_path):
            SovereignHUD.log("PASS", f"Merge Complete ({files_ok} files)")
            SovereignHUD.log("INFO", f"Stats: +{total_new} New | ~{total_upd} Updated")
    else:
        SovereignHUD.log("INFO", "No trace files to process.")

if __name__ == "__main__":
    if len(sys.argv) < 2: print("Usage: python merge_traces.py <source_dir> [target_file]")
    else: merge_traces(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "fishtest_data.json")
