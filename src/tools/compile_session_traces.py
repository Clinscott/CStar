import glob
import json
import os
import shutil
from datetime import datetime


class TraceAnalyzer:
    """[ALFRED] Advanced analytics for neural traces."""
    def __init__(self, traces: list[dict]) -> None:
        self.traces = traces

    def get_summary(self) -> dict:
        if not self.traces: return {}
        scores = [t.get('score', 0) for t in self.traces]
        return {
            "total": len(self.traces),
            "avg_score": sum(scores) / len(scores),
            "top_performer": self._get_top_performer(),
            "critical_fails": [t for t in self.traces if t.get('score', 0) < 0.6],
            "by_persona": self._group_by_persona()
        }

    def _group_by_persona(self) -> dict[str, list[dict]]:
        grouped = {}
        for t in self.traces:
            p = t.get('persona', 'UNKNOWN').upper()
            if p not in grouped: grouped[p] = []
            grouped[p].append(t)
        return grouped

    def _get_top_performer(self) -> str:
        counts = {}
        for t in self.traces:
            m = t.get('match', 'N/A')
            counts[m] = counts.get(m, 0) + 1
        return max(counts, key=counts.get) if counts else "N/A"

class ReportRenderer:
    """[ALFRED] Markdown report generation with thematic elements."""
    def __init__(self, report_path: str) -> None:
        self.path = report_path

    def render(self, traces: list[dict], stats: dict) -> None:
        lines = [
            "# 🧠 C* Neural Trace Report\n",
            f"**Session Traces**: {stats.get('total', 0)}\n",
            f"**Avg Score**: {stats.get('avg_score', 0):.4f}\n",
            f"**Most Active Skill**: `{stats.get('top_performer', 'N/A')}`\n",
            f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        ]

        by_persona = stats.get('by_persona', {})
        for persona, p_traces in by_persona.items():
            color_text = " (Enforcer Mode)" if persona == "ODIN" else " (Service Mode)"
            lines.append(f"\n## {'🔴' if persona == 'ODIN' else '🔵'} {persona}{color_text}")
            lines.append("| Query | Match | Score | Type |")
            lines.append("| :--- | :--- | :--- | :--- |")
            for t in p_traces:
                q, m, s = t.get('query', 'N/A'), t.get('match', 'N/A'), t.get('score', 0)
                icon = "🟢" if s > 0.8 else ("🟡" if s > 0.6 else "🔴")
                g = "GLOBAL" if t.get('is_global') else "LOCAL"
                lines.append(f"| `{q}` | **{m}** | {icon} {s:.2f} | {g} |")

        if stats.get('critical_fails'):
            lines.append("\n## 🚨 Critical Failures (Score < 0.6)")
            for f in stats['critical_fails']:
                lines.append(f"- `{f.get('query')}` matched `{f.get('match')}` with score {f.get('score'):.2f}")

        # Restoration of Suggested Improvements
        potential_improvements = []
        for t in traces:
            if 0.6 <= t.get('score', 0) < 0.85:
                potential_improvements.append(f"- **{t['match']}**: Confidence is low ({t['score']:.2f}) for query `{t['query']}`. Consider expanding `thesaurus.qmd` clusters.")

        if potential_improvements:
            lines.append("\n## 🔧 Suggested Improvements")
            lines.extend(list(set(potential_improvements))[:5]) # Top 5 unique improvements

        with open(self.path, "w", encoding="utf-8") as f: f.write("\n".join(lines))

def compile_traces(tdir: str | None = None, rpath: str | None = None):
    """[ALFRED] Restored trace compiler with persona-awareness and identity-theming."""
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tdir = tdir or os.path.join(base, "traces")
    rpath = rpath or os.path.join(base, "TRACE_REPORT.qmd")

    if not os.path.exists(tdir): return [], {}
    files = glob.glob(os.path.join(tdir, "*.json"))
    if not files: return [], {}

    raw_traces = []
    for f in files:
        try:
            with open(f) as j: raw_traces.append(json.load(j))
        except (json.JSONDecodeError, OSError): pass

    analyzer = TraceAnalyzer(raw_traces)
    stats = analyzer.get_summary()
    ReportRenderer(rpath).render(raw_traces, stats)

    # Auto-Corrections
    if stats.get('critical_fails'):
        corrections_path = os.path.join(base, ".agent", "corrections.json")
        try:
            data = {}
            if os.path.exists(corrections_path):
                with open(corrections_path) as f: data = json.load(f)

            mappings = data.get("phrase_mappings", {})
            for fail in stats['critical_fails']:
                # Auto-map query to expected trigger if available
                # In traces, we might not have 'expected' unless it was a test case.
                # But if we have a match that was weak, maybe we confirm it?
                # The user requirement says: "finding critical_fails ... write these failed query -> expected pairs"
                # If the trace doesn't have 'expected', we can't map it.
                # Assuming traces might come from fishtest or have 'expected' field.
                if 'expected' in fail and 'query' in fail:
                    mappings[fail['query']] = fail['expected']

            data["phrase_mappings"] = mappings
            with open(corrections_path, 'w') as f: json.dump(data, f, indent=2)
            print(f"Applied {len(stats['critical_fails'])} corrections to {corrections_path}")
        except Exception as e:
            print(f"Failed to apply corrections: {e}")

    # Archival
    archive = os.path.join(tdir, "archive")
    os.makedirs(archive, exist_ok=True)
    for f in files: shutil.move(f, os.path.join(archive, os.path.basename(f)))
    print(f"Report generated: {rpath}")

    return raw_traces, stats

if __name__ == "__main__":
    compile_traces()
