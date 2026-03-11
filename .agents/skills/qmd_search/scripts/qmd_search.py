#!/usr/bin/env python3
"""
[SKILL] QMD Search
Lore: "The Scryer of the Hall of Records."
Purpose: Parses .stats/*.qmd files to identify the weakest sectors based on Gungnir metrics.
"""

import os
import re
import json
import argparse
from pathlib import Path

def parse_qmd(file_path: Path) -> dict:
    data = {"file": "", "path": "", "scores": {}}
    try:
        content = file_path.read_text(encoding='utf-8')
        # Extract YAML frontmatter
        match = re.search(r'^---\n(.*?)\n---', content, re.DOTALL)
        if not match:
            return data
            
        frontmatter = match.group(1)
        for line in frontmatter.split('\n'):
            line = line.strip()
            if ':' in line:
                key, val = [part.strip() for part in line.split(':', 1)]
                if key == 'title':
                    data['file'] = val.strip('"\'')
                elif key == 'path':
                    data['path'] = val.strip('"\'')
                elif key.endswith('_score'):
                    try:
                        data['scores'][key.replace('_score', '')] = float(val)
                    except ValueError:
                        pass
    except Exception:
        pass
    return data

def search_qmds(metric: str, limit: int = 5) -> list:
    stats_dir = Path('.stats')
    if not stats_dir.exists():
        return []

    sectors = []
    for qmd_file in stats_dir.glob('*.qmd'):
        data = parse_qmd(qmd_file)
        if data['path'] and metric in data['scores']:
            sectors.append(data)

    # Sort ascending (lowest scores first)
    sectors.sort(key=lambda x: x['scores'][metric])
    return sectors[:limit]

def main():
    parser = argparse.ArgumentParser(description="QMD Search Skill")
    parser.add_argument("--metric", required=True, help="The Gungnir metric to sort by (e.g., logic, style, intel, overall)")
    parser.add_argument("--limit", type=int, default=5, help="Number of results to return")
    args = parser.parse_args()

    results = search_qmds(args.metric, args.limit)
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
