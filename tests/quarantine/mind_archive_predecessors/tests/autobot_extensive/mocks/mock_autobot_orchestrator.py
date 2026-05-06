#!/usr/bin/env python3
import sys
import re
import os

def main():
    if len(sys.argv) < 3:
        print("Usage: mock_autobot_orchestrator.py run_hermes <task>")
        sys.exit(1)

    task = sys.argv[2]

    # Strictly use env var or default to target.txt
    target_path = os.environ.get("CORVUS_TARGET_PATH", "target.txt")

    # Simple logic to simulate LLM responses based on task content
    if "TRIGGER_WRITE" in task:
        # Check if we already did the write (by looking at context in task)
        if f"Result of write_file: Successfully wrote to {target_path}" in task:
            print("I have written the file. DONE")
        else:
            print(f"<thought>I will write the file.</thought><invoke name='write_file'><path>{target_path}</path><content>MOCK_CONTENT</content></invoke>")
    elif "TRIGGER_SHELL" in task:
        if "Result of run_shell_command: Exit Code: 0" in task:
            print("Shell command finished. DONE")
        else:
            print("<thought>I will run a shell command.</thought><invoke name='run_shell_command'><command>echo 'MOCK_SHELL'</command></invoke>")
    elif "TRIGGER_FAIL" in task:
        print("I am failing. Error: Mock failure.")
    else:
        # Default behavior: just list directory and finish
        if "Result of list_directory:" in task:
            print("I see the files. DONE")
        else:
            print("<thought>I will list the directory.</thought><invoke name='list_directory'><path>.</path></invoke>")

if __name__ == "__main__":
    main()
