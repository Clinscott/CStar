import json
import os
import sys
import glob

def merge_traces(network_share, target_file="fishtest_data.json"):
    print(f"Scanning {network_share} for traces...")
    
    if not os.path.exists(target_file):
        print(f"Error: Target file {target_file} not found.")
        return

    with open(target_file, 'r', encoding='utf-8') as f:
        dataset = json.load(f)

    existing_queries = {case['query']: case for case in dataset['test_cases']}
    new_count = 0
    update_count = 0

    trace_files = glob.glob(os.path.join(network_share, "*.json"))
    for trace_file in trace_files:
        print(f"Processing {os.path.basename(trace_file)}...")
        try:
            with open(trace_file, 'r', encoding='utf-8') as f:
                traces = json.load(f)
                
            for trace in traces:
                query = trace.get('query')
                match = trace.get('match')
                score = trace.get('score')
                
                if not query or not match: continue

                # Create Test Case Object
                new_case = {
                    "query": query,
                    "expected": match,
                    "min_score": 0.85, # Standard Rigor
                    "tags": ["federated", "real-user"]
                }
                
                # Distributed Fishtest: Tag the Persona
                if trace.get('persona'):
                    new_case['tags'].append(trace.get('persona'))
                
                if trace.get('is_global'):
                    new_case['should_be_global'] = True

                # Conflict Resolution: Real User Wins
                if query in existing_queries:
                    # Update existing
                    existing_queries[query].update(new_case)
                    update_count += 1
                else:
                    # Add new
                    dataset['test_cases'].append(new_case)
                    existing_queries[query] = new_case
                    new_count += 1
                    
        except json.JSONDecodeError:
            print(f"Skipping invalid JSON file: {trace_file}")
        except Exception as e:
            print(f"Failed to process {trace_file}: {e}")

    # Write back
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, indent=2)

    print(f"Merge Complete. Added: {new_count}, Updated: {update_count}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python merge_traces.py <network_share_path> [target_file]")
    else:
        share_path = sys.argv[1]
        target = sys.argv[2] if len(sys.argv) > 2 else "fishtest_data.json"
        merge_traces(share_path, target)
