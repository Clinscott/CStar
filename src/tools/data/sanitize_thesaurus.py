import json

# Re-initialize the clusters properly
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

# Invert
inverted = {}
for head, syns in clusters.items():
    words = syns + [head]
    for w in set(words):
        w = w.lower().strip()
        if not w: continue
        if w not in inverted: inverted[w] = set()
        for other in words:
            other = other.lower().strip()
            if w != other:
                inverted[w].add(other)

# Build file
lines = ["# Corvus Star Thesaurus (Sanitized Expanded Version)", "", "## 🌊 Expanded Intent Clusters", ""]
for w in sorted(inverted.keys()):
    syns = sorted(list(inverted[w]))
    lines.append(f"- **{w}**: {', '.join(syns)}")

with open('thesaurus.md', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f"Sanitized thesaurus with {len(inverted)} keys.")
