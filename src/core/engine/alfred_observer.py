import os
import time

class AlfredOverwatch:
    def analyze_failure(self, target_file: str, error_trace: str) -> tuple[str, str]:
        """Reads a Gauntlet or Gungnir error and generates plain-text guidance."""
        # Standard library logic for failure analysis
        if "SyntaxError" in error_trace:
            return "SyntaxError", f"ALFRED: It appears there is a syntax error in {target_file}. Please check your braces and indentation."
        if "ImportError" in error_trace or "ModuleNotFoundError" in error_trace:
            return "ImportError", f"ALFRED: A module dependency is missing in {target_file}. Verify the PYTHONPATH and internal imports."
        if "AssertionError" in error_trace:
            return "AssertionError", f"ALFRED: The implementation in {target_file} fails its contract. The logic does not match the expected state."
        if "KeyboardInterrupt" in error_trace:
            return "KeyboardInterrupt", f"ALFRED: The operation for {target_file} was terminated by the user. Scaling back the computational workload."
        if "Timeout" in error_trace:
            return "Timeout", f"ALFRED: The operation for {target_file} timed out. Logic may be inefficient or deadlocked."
            
        return "UnknownError", f"ALFRED: An unexpected error occurred in {target_file}. Trace analysis suggests careful review of recent permutations."
        
    def write_suggestion(self, suggestion: str, file_path: str = ".agent/ALFRED_SUGGESTIONS.md"):
        """Writes the guidance so the agent can read it on the next loop."""
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(file_path, "a", encoding="utf-8") as f:
            f.write(f"\n## {timestamp}\n{suggestion}\n")
