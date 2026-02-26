import json
import os
import shutil
import sys
from pathlib import Path

# Import Shared UI
try:
    from src.core.sovereign_hud import SovereignHUD
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from src.core.sovereign_hud import SovereignHUD

def merge_traces(source_dir, target_file="fishtest_data.json"):
    """
    Merges traces from source_dir into target_file.
    - Moves processed files to source_dir/processed/
    - Implements 'Real User Wins' conflict resolution
    """
    source_path = Path(source_dir)
    target_path = Path(target_file)
    processed_dir = source_path / "processed"
    failed_dir = source_path / "failed"

    processed_dir.mkdir(exist_ok=True)
    failed_dir.mkdir(exist_ok=True)

    SovereignHUD.log("INFO", f"Scanning {source_path} for traces...")

    dataset = {"test_cases": []}
    if target_path.exists():
        try:
            with open(target_path, encoding='utf-8') as f:
                dataset = json.load(f)
        except Exception as e:
            SovereignHUD.log("WARN", f"Could not load target file: {e}. Starting fresh.")

    # Index existing by query for O(1) lookups
    # Format: {query: {data}}
    existing_queries = {case['query']: case for case in dataset.get('test_cases', [])}

    new_count = 0
    update_count = 0
    files_processed = 0

    trace_files = list(source_path.glob("*.json"))

    for trace_file in trace_files:
        try:
            with open(trace_file, encoding='utf-8') as f:
                # Handle both single object and list of objects
                content = json.load(f)
                traces = content if isinstance(content, list) else [content]

            for trace in traces:
                query = trace.get('query')
                match = trace.get('match')

                if not query or not match:
                    continue

                # Create Standard Test Case
                new_case = {
                    "query": query,
                    "expected": match,
                    "min_score": 0.85, # Standard Rigor
                    "tags": ["federated", "real-user"]
                }

                # Metadata pass-through
                if trace.get('persona'):
                    new_case['tags'].append(trace.get('persona'))

                if trace.get('is_global'):
                    new_case['expected_global'] = True # Standardized key name

                # Conflict Resolution: Real User Wins / Last Writer Wins
                if query in existing_queries:
                    # Merge Logic: Overwrite expected, append tags
                    existing = existing_queries[query]
                    existing['expected'] = match
                    existing['tags'] = list(set(existing.get('tags', []) + new_case['tags']))
                    if 'expected_global' in new_case:
                        existing['expected_global'] = new_case['expected_global']

                    update_count += 1
                else:
                    # Add new
                    dataset['test_cases'].append(new_case)
                    existing_queries[query] = new_case
                    new_count += 1

            # Archive File
            f.close() # Ensure handle closed before move
            shutil.move(str(trace_file), str(processed_dir / trace_file.name))
            files_processed += 1

        except json.JSONDecodeError:
            SovereignHUD.log("WARN", f"Invalid JSON: {trace_file.name}")
            shutil.move(str(trace_file), str(failed_dir / trace_file.name))
        except Exception as e:
            SovereignHUD.log("WARN", f"Failed to process {trace_file.name}: {e}")

    # Write back to target
    try:
        with open(target_path, 'w', encoding='utf-8') as f:
            json.dump(dataset, f, indent=2)

        SovereignHUD.log("PASS", f"Merge Complete. Processed {files_processed} files.")
        SovereignHUD.log("INFO", f"Stats: +{new_count} New | ~{update_count} Updated")

    except Exception as e:
        SovereignHUD.log("WARN", f"Failed to save target file: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python merge_traces.py <source_dir> [target_file]")
    else:
        src = sys.argv[1]
        tgt = sys.argv[2] if len(sys.argv) > 2 else "fishtest_data.json"
        merge_traces(src, tgt)
