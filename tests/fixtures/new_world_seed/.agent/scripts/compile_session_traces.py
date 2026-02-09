import glob
import json
import os


def compile_traces(traces_dir=None, report_path=None):
    # Setup Paths
    current_dir = os.path.dirname(os.path.abspath(__file__))
    base_path = os.path.dirname(current_dir) # .agent
    
    if traces_dir is None:
        traces_dir = os.path.join(base_path, "traces")
    if report_path is None:
        report_path = os.path.join(base_path, "TRACE_REPORT.md")

    if not os.path.exists(traces_dir):
        print("No traces directory found.")
        return

    json_files = glob.glob(os.path.join(traces_dir, "*.json"))
    if not json_files:
        print("No traces found for this session.")
        # Create empty report
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("# Neural Trace Report\n\nNo traces recorded this session.\n")
        return

    traces = []
    for jf in json_files:
        try:
            with open(jf, "r", encoding="utf-8") as f:
                traces.append(json.load(f))
        except: pass
    
    # Sort by score (descending) or timestamp (if we had real ones)
    # For now, let's sort by score to highlight best matches
    traces.sort(key=lambda x: x.get('score', 0), reverse=True)

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# 🧠 C* Neural Trace Report\n\n")
        f.write(f"**Session Traces**: {len(traces)}\n\n")
        
        f.write("| Query | Match | Score | Type |\n")
        f.write("| :--- | :--- | :--- | :--- |\n")
        
        # Identify weak spots
        improvements = []
        seen_skills = set()

        for t in traces:
            query = t.get('query', 'N/A')
            match = t.get('match', 'N/A')
            score = t.get('score', 0)
            is_global = "GLOBAL" if t.get('is_global') else "LOCAL"
            
            # Simple visual indicator for score
            score_icon = "🟢" if score > 0.8 else "🟡"
            
            f.write(f"| `{query}` | **{match}** | {score_icon} {score:.2f} | {is_global} |\n")
            
            if score < 0.8 and match not in seen_skills and len(improvements) < 2:
                improvements.append(f"- **{match}**: Score {score:.2f} on query `{query}`. Consider adding more activation words or using this trace for future training.")
                seen_skills.add(match)

        if improvements:
            f.write("\n## 🔧 Suggested Improvements\n")
            for imp in improvements:
                f.write(f"{imp}\n")

    print(f"Trace report generated at: {report_path}")

    # Output to terminal
    with open(report_path, "r", encoding="utf-8") as f:
        print(f.read())
    
    # Archive processed traces
    archive_dir = os.path.join(traces_dir, "archive")
    if not os.path.exists(archive_dir): os.makedirs(archive_dir)
    
    for jf in json_files:
        try:
            filename = os.path.basename(jf)
            os.rename(jf, os.path.join(archive_dir, filename))
        except: pass
    print(f"Archived {len(json_files)} traces.")

if __name__ == "__main__":
    compile_traces()
