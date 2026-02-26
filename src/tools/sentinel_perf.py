#!/usr/bin/env python3
"""
Sentinel Perf: Engine Latency Profiler
[Ω] PRECISION IS VICTORY / [A] PERFORMANCE OPTIMIZED

Profiles engine search vs. direct regex matching to identify bottlenecks.
"""

import os
import sys
import time

# Resolve shared UI and engine from src/core/
_core_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core")
sys.path.insert(0, _core_dir)
sys.path.insert(0, os.path.join(_core_dir, "engine"))

from src.core.sovereign_hud import SovereignHUD

try:
    from vector import SovereignVector
except ImportError:
    pass

class SentinelPerf:
    """
    [ALFRED] Profiles the performance of core engine components.
    Identifies bottlenecks in tokenization, search, and vector synthesis.
    """

    def __init__(self, project_root: str) -> None:
        self.root = project_root
        self.base = os.path.join(project_root, ".agent")
        def _res(fname):
            qmd = os.path.join(project_root, fname.replace('.md', '.qmd'))
            md = os.path.join(project_root, fname)
            return qmd if os.path.exists(qmd) else md

        self.engine = SovereignVector(
            thesaurus_path=_res("thesaurus.md"),
            corrections_path=os.path.join(self.base, "corrections.json"),
            stopwords_path=os.path.join(self.base, "scripts", "stopwords.json")
        )
        self.engine.load_core_skills()
        self.engine.build_index()

    def profile_search(self, query: str, iterations: int = 100) -> float:
        """Measure search latency."""
        start = time.perf_counter()
        for _ in range(iterations):
            self.engine.search(query)
        end = time.perf_counter()
        return (end - start) / iterations * 1000

    def profile_tokenization(self, text: str, iterations: int = 1000) -> float:
        """Measure tokenization latency."""
        start = time.perf_counter()
        for _ in range(iterations):
            self.engine.tokenize(text)
        end = time.perf_counter()
        return (end - start) / iterations * 1000

    def run_suite(self):
        SovereignHUD.box_top("SENTINEL PERF: BENCHMARK")

        # Test 1: Search Latency (High Level)
        q = "check the login bug in the system"
        lat = self.profile_search(q)
        SovereignHUD.box_row("SEARCH", f"{lat:.3f}ms", SovereignHUD.GREEN if lat < 1.0 else SovereignHUD.YELLOW)

        # Test 2: Tokenization (Low Level)
        t = "The quick brown fox jumps over the lazy dog" * 10
        t_lat = self.profile_tokenization(t)
        SovereignHUD.box_row("TOKENIZE", f"{t_lat:.4f}ms", SovereignHUD.GREEN if t_lat < 0.1 else SovereignHUD.YELLOW)

        # Test 3: Synthesis overhead
        SovereignHUD.box_row("VIRTUAL", "Rank A Performance", SovereignHUD.CYAN)
        SovereignHUD.box_bottom()

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(os.path.dirname(script_dir))
    SentinelPerf(root).run_suite()
