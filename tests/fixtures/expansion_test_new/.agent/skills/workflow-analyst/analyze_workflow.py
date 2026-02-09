
import json
import os
import re
import sys
from collections import Counter


class WorkflowAnalyst:
    def __init__(self, root_dir):
        self.root = root_dir
        self.tasks_path = os.path.join(root_dir, "tasks.md")
        self.journal_path = os.path.join(root_dir, "dev_journal.md")

    def analyze(self):
        report = {
            "stalled_tasks": [], # [/] items
            "open_loops": [],    # [ ] items
            "recurring_patterns": [],
            "suggestions": []
        }

        # 1. Analyze Tasks
        if os.path.exists(self.tasks_path):
            with open(self.tasks_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            for line in lines:
                clean_line = line.strip()
                if "- [ ]" in clean_line:
                    report["open_loops"].append(clean_line.replace("- [ ]", "").strip())
                elif "- [/]" in clean_line:
                    report["stalled_tasks"].append(clean_line.replace("- [/]", "").strip())

        # 2. Analyze Journal (Pattern Recognition)
        if os.path.exists(self.journal_path):
            with open(self.journal_path, 'r', encoding='utf-8') as f:
                journal_content = f.read().lower()
            
            # Simple keyword frequency analysis for "pain words"
            pain_keywords = ["manual", "fix", "error", "fail", "slow", "refactor", "broken"]
            found_pain = [word for word in pain_keywords if word in journal_content]
            
            # Count occurrences
            word_counts = Counter(re.findall(r'\b\w+\b', journal_content))
            common = word_counts.most_common(20)
            
            # Filter for interesting actionable words
            for word, count in common:
                if word in pain_keywords:
                    report["recurring_patterns"].append(f"High frequency of '{word}': {count} times")

        # 3. Generate Suggestions
        if len(report["stalled_tasks"]) > 0:
            report["suggestions"].append("CRITICAL: You have tasks explicitly marked 'In Progress' ([/]). Finish them or Reset them.")
        
        if len(report["open_loops"]) > 5:
            report["suggestions"].append("WARNING: Too many open loops. Close 3 tasks before opening new ones.")

        return report

def main():
    root = os.getcwd()
    analyst = WorkflowAnalyst(root)
    report = analyst.analyze()
    
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
