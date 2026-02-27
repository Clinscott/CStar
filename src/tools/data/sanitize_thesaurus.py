#!/usr/bin/env python3
"""
[DATA] Thesaurus Sanitizer
Lore: "Purifying the lexicon for the All-Father."
Purpose: Inverts intent clusters into a bidirectional synonym map for vector expansion.
"""

from pathlib import Path


def sanitize_clusters(clusters: dict[str, list[str]]) -> dict[str, set[str]]:
    """
    Inverts a cluster dictionary into a bidirectional synonym map.

    Args:
        clusters: A dictionary mapping headwords to a list of synonyms.

    Returns:
        An inverted dictionary mapping every word to its set of synonyms.
    """
    inverted: dict[str, set[str]] = {}
    for head, syns in clusters.items():
        words = [*syns, head]
        for w in set(words):
            w = w.lower().strip()
            if not w:
                continue
            if w not in inverted:
                inverted[w] = set()
            for other in words:
                other = other.lower().strip()
                if w != other and other:
                    inverted[w].add(other)
    return inverted

def write_thesaurus(clusters: dict[str, list[str]], output_path: Path) -> None:
    """
    Writes the sanitized clusters to a markdown file.

    Args:
        clusters: The raw cluster dictionary.
        output_path: The file path to write to.
    """
    inverted = sanitize_clusters(clusters)
    lines = [
        "# Corvus Star Thesaurus (Sanitized Expanded Version)",
        "",
        "## 🌊 Expanded Intent Clusters",
        ""
    ]
    for w in sorted(inverted.keys()):
        syns = sorted(inverted[w])
        lines.append(f"- **{w}**: {', '.join(syns)}")

    output_path.write_text('\n'.join(lines), encoding='utf-8')
    print(f"Sanitized thesaurus with {len(inverted)} keys written to {output_path}.")

def main() -> None:
    """CLI entry point for thesaurus sanitization."""
    # Hardcoded clusters for legacy support, though future versions should read from thesaurus.qmd
    clusters = {
        "start": ["begin", "initiate", "resume", "lets-go", "kick-off", "fire-up", "boot", "spin-up"],
        "finish": ["close", "complete", "done", "end", "exit", "finalize", "finish", "pack-up", "quit", "stop", "wind-down", "wrap", "wrap-it-up"],
        "investigate": ["analyze", "audit", "bug", "check", "debug", "dig-into", "error", "find", "investigate", "issue", "linter", "look-into", "sentinel", "track-down", "validate", "verify"],
        "create": ["build", "component", "construct", "create", "develop", "feature", "generate", "implement", "make", "page", "run-task", "update", "modification"],
        "plan": ["architect", "blueprint", "design", "map", "outline", "plan", "prepare", "strategy", "roadmap", "itinerary"],
        "test": ["check", "integrity", "performance", "validity", "verify", "validate", "test", "verification"],
        "deploy": ["deploy", "deployment", "launch", "push", "release", "ship", "publish"],
        "git": ["commit", "merge", "rebase", "git-assistant", "repo", "repository", "github"],
        "automation": ["automation", "browser-automation", "e2e", "playwright", "playwright-e2e"],
        "futuristic": ["aesthetics", "glass", "glow", "holographic", "neon", "sci-fi", "ui-sci-fi", "visual", "beautify", "clean", "improve", "polish", "refine", "sovereignfish"],
        "optimize": ["agent-lightning", "fast", "optimization", "optimize", "performance", "quick", "reinforcement", "rl", "speed", "velocity", "benchmark", "measure", "metrics", "perf", "perf-profiler", "profile", "timing"],
        "knowledge": ["search", "find", "where-is", "how-does", "research", "scour", "hunter", "documentation", "knowledge-hunter"],
        "docs": ["api-docs", "doc-generator", "docs", "docstring", "documentation", "jsdoc", "readme", "document", "write-docs", "write-documentation"],
        "health": ["agent-health", "status", "pulse", "monitoring", "heartbeat"]
    }

    output = Path("thesaurus.md")
    write_thesaurus(clusters, output)

if __name__ == "__main__":
    main()
