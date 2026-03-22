import json
from pathlib import Path
from typing import Any

from src.core.engine.vector import SovereignVector


def analyze_benchmarks(source_path: Path) -> list[dict[str, Any]]:
    """
    Analyzes the vector engine's performance against a benchmark JSON file.

    Args:
        source_path: Path to the fishtest JSON file.

    Returns:
        A list of failure records.
    """
    engine = SovereignVector()

    if not source_path.exists():
        print(f"Error: Source path {source_path} does not exist.")
        return []

    with source_path.open('r', encoding='utf-8') as f:
        data = json.load(f)

    failures = []
    test_cases = data.get('test_cases', [])

    for case in test_cases:
        query = case.get('query', '')
        expected = case.get('expected', '')
        results = engine.search(query)

        actual = results[0]['trigger'] if results else None
        score = results[0]['score'] if results else 0

        if actual != expected:
            failures.append({
                "query": query,
                "expected": expected,
                "actual": actual,
                "score": score,
                "top_results": [
                    {"trigger": r['trigger'], "score": r['score'], "note": r.get('note', '')}
                    for r in results[:3]
                ]
            })
    return failures

def main() -> None:
    """CLI entry point for benchmark analysis."""
    source = Path(r"C:\Users\Craig\Corvus\CorvusStar\tests\fixtures\fishtest_N100.json")
    failures = analyze_benchmarks(source)

    print(f"FAILED CASES: {len(failures)}")
    for f in failures:
        print(f"\nQuery: {f['query']}")
        print(f"  Expected: {f['expected']}, Actual: {f['actual']} (Score: {f['score']:.4f})")
        print("  Top Results:")
        for tr in f['top_results']:
            print(f"    - {tr['trigger']} ({tr['score']:.4f}) [{tr['note']}]")

if __name__ == "__main__":
    main()
