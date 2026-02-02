
import os
import re
import sys
import json

class WorkflowAnalyst:
    def __init__(self, root_dir):
        self.root = root_dir
        self.tasks_path = os.path.join(root_dir, "tasks.md")
        self.journal_path = os.path.join(root_dir, "dev_journal.md")

    def analyze(self):
        report = {
            "stalled_tasks": [],
            "recurring_patterns": [],
            "suggestions": []
        }

        # 1. Analyze Tasks
        if os.path.exists(self.tasks_path):
            with open(self.tasks_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            for line in lines:
                if "- [ ]" in line:
                    task_name = line.replace("- [ ]", "").strip()
                    # simplistic stalled check: if it's in the "Next Steps" block but not done
                    report["stalled_tasks"].append(task_name)

        # 2. Analyze Journal (Pattern Recognition)
        # This is a stub for future NLP integration
        # For now, we look for keywords in the last 3 entries
        
        return report

def main():
    root = os.getcwd()
    analyst = WorkflowAnalyst(root)
    report = analyst.analyze()
    
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
