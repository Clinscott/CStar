import json
import os
import sys
import time
import traceback
from pathlib import Path
from colorama import Fore, Style, init

# Add project root to sys.path for imports
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from src.sentinel.muninn import Muninn
from tests.harness.raven_proxy import RavenProxy
from google import genai

# Initialize Colorama
init(autoreset=True)

class SovereignStressTest:
    def __init__(self, max_retries=5) -> None:
        self.max_retries = max_retries
        if not self.api_key:
            print(f"{Fore.CYAN}[TEACHER] API KEY MISSING. Handing over to Lead Architect (Main Agent).")
            print(f"{Fore.CYAN}[TEACHER] Please analyze the current state and perform manual adjudication.")
            sys.exit(42)
        
        self.pro_client = genai.Client(api_key=self.api_key)
        self.pro_model = "gemini-1.5-flash" # The Teacher (using Flash for stability)
        self.flash_model = "gemini-2.0-flash"      # The Student
        self.corrections_path = Path(".agent/corrections.json")
        self.logs_dir = Path("tests/harness/logs")

    def log_teacher(self, message):
        print(f"{Fore.CYAN}[TEACHER] {Style.BRIGHT}{message}{Style.RESET_ALL}")

    def log_student(self, message):
        print(f"{Fore.YELLOW}[STUDENT] {message}{Style.RESET_ALL}")

    def get_latest_trace(self):
        traces = list(self.logs_dir.glob("trace_*.json"))
        if not traces:
            return None
        return max(traces, key=lambda p: p.stat().st_mtime)

    def analyze_failure(self, trace_file, error_msg=None):
        self.log_teacher("Analyzing failure...")
        
        trace_content = ""
        if trace_file and trace_file.exists():
            with open(trace_file, "r", encoding="utf-8") as f:
                trace_content = f.read()

        prompt = f"""
        ACT AS: Lead Systems Architect / Teacher.
        CONTEXT: The Raven Agent (Muninn) running on Gemini Flash failed a task.
        
        FORENSIC TRACE:
        {trace_content}
        
        EXCEPTION (If any):
        {error_msg}
        
        TASK: Why did Flash fail this task? Provide a 1-sentence instruction to prevent this.
        Your instruction will be appended to the Student's next prompt to help them succeed.
        
        OUTPUT: Only the 1-sentence instruction.
        """
        
        try:
            response = self.pro_client.models.generate_content(
                model=self.pro_model,
                contents=prompt
            )
            lesson = response.text.strip() if response and response.text else "Review the target logic more carefully."
            return lesson
        except Exception as e:
            self.log_teacher(f"Error during analysis: {e}")
            return "Ensure implementation matches all requirements specified."

    def teach_lesson(self, lesson):
        self.log_teacher(f"Lesson generated: {lesson}")
        
        try:
            if self.corrections_path.exists():
                with open(self.corrections_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = {}

            if "lessons" not in data:
                data["lessons"] = []
            
            data["lessons"].append(lesson)
            
            with open(self.corrections_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            
            self.log_teacher("Lesson persisted to corrections.json")
        except Exception as e:
            self.log_teacher(f"Failed to save lesson: {e}")

    def run(self):
        for attempt in range(1, self.max_retries + 1):
            self.log_student(f"Starting Cycle {attempt}/{self.max_retries}...")
            
            proxy = RavenProxy(target_model=self.flash_model, api_key=self.api_key)
            # Muninn takes (target_path, client)
            muninn = Muninn(target_path=str(project_root), client=proxy)
            
            success = False
            error_msg = None
            
            try:
                # In stress test mode, we consider False as a failure to improve
                success = muninn.run()
                
                if success:
                    self.log_student("Succeeded! Protocol complete.")
                    return True
                else:
                    self.log_student("Failed to make/verify change.")
            except Exception as e:
                self.log_student(f"Crashed: {e}")
                error_msg = traceback.format_exc()
            
            # Adjudicate
            latest_trace = self.get_latest_trace()
            lesson = self.analyze_failure(latest_trace, error_msg)
            self.teach_lesson(lesson)
            
        self.log_student("Max retries reached. Exit.")
        return False

if __name__ == "__main__":
    max_retries = 5
    if len(sys.argv) > 1:
        try:
            max_retries = int(sys.argv[1])
        except ValueError:
            pass
            
    test = SovereignStressTest(max_retries=max_retries)
    test.run()