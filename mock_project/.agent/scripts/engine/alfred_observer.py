"""
Alfred's Observer - Shadow Advisor Integration.

Updates ALFRED_SUGGESTIONS.md with observations from:
- Fishtest results
- Code Sentinel output
- Trace visualizer analysis
"""

import os
from datetime import datetime
from typing import List, Dict, Any

class AlfredObserver:
    """Quietly observes and records improvement suggestions."""
    
    def __init__(self, project_root: str):
        self.root = project_root
        self.suggestions_path = os.path.join(project_root, "ALFRED_SUGGESTIONS.md")
    
    def observe_fishtest(self, results: Dict[str, Any]) -> None:
        """Analyze Fishtest results for improvement opportunities."""
        suggestions = []
        
        if results.get("regressions"):
            for reg in results["regressions"]:
                suggestions.append(f"- **Regression Detected**: `{reg['test']}` "
                                   f"(Score: {reg['score']:.2f} < {reg['min_score']:.2f})")
        
        if results.get("slow_tests"):
            for slow in results["slow_tests"]:
                suggestions.append(f"- **Performance Concern**: `{slow['test']}` "
                                   f"took {slow['time_ms']:.1f}ms")
        
        if suggestions:
            self._append_observation("Fishtest Analysis", suggestions)
    
    def observe_sentinel(self, violations: List[Dict[str, Any]]) -> None:
        """Analyze Code Sentinel output."""
        if not violations:
            return
            
        suggestions = []
        for v in violations[:5]:  # Top 5
            suggestions.append(f"- `{v['file']}:{v['line']}`: {v['message']}")
        
        if suggestions:
            self._append_observation("Code Sentinel Report", suggestions)
    
    def _append_observation(self, category: str, items: List[str]) -> None:
        """Append observations to the suggestions file."""
        if not os.path.exists(self.suggestions_path):
            return # Shadow advisor not present or file removed
            
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        
        entry = f"\n### {category} ({timestamp})\n\n" + "\n".join(items) + "\n"
        
        try:
            with open(self.suggestions_path, "a", encoding="utf-8") as f:
                f.write(entry)
        except (IOError, PermissionError):
            pass  # [ALFRED] Quietly fail if background process has lock
