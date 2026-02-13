from src.core.engine.alfred_observer import AlfredOverwatch
import os

observer = AlfredOverwatch()
with open("tests/fixtures/error_trace.txt", "r") as f:
    trace = f.read()

suggestion = observer.analyze_failure("test_file.py", trace)
print(f"Suggestion: {suggestion}")
observer.write_suggestion(suggestion, "tests/fixtures/ALFRED_SUGGESTIONS.md")

if os.path.exists("tests/fixtures/ALFRED_SUGGESTIONS.md"):
    print("Suggestion written successfully.")
    with open("tests/fixtures/ALFRED_SUGGESTIONS.md", "r") as f:
        print(f.read())
