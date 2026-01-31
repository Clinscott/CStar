import sys
import os
import io
import contextlib

# Add .agent/scripts to path
current_dir = os.path.dirname(os.path.abspath(__file__))
scripts_dir = os.path.join(os.path.dirname(current_dir), ".agent", "scripts")
sys.path.append(scripts_dir)

try:
    from trace_viz import visualize_trace
except ImportError as e:
    print(f"FAILED to import trace_viz: {e}")
    sys.exit(1)

def run_test_case(name, input_data):
    print(f"Running Case: {name} ... ", end="")
    try:
        # Capture stdout to prevent clutter and check for partial output if needed
        f = io.StringIO()
        with contextlib.redirect_stdout(f):
            visualize_trace(input_data)
        print("PASS")
        return True
    except Exception as e:
        print(f"FAIL ({type(e).__name__}: {e})")
        return False

def main():
    print("--- CHAOS MONKEY: trace_viz.py ---")
    
    cases = [
        ("Empty String", ""),
        ("Whitespace", "   "),
        ("Special Chars", "!@#$%^&*()_+{}|:<>?"),
        ("Very Long String", "test " * 1000),
        ("JSON Injection", '{"key": "value", "injection": true}'),
        ("SQL Injection Symulacrum", "SELECT * FROM skills WHERE 1=1"),
        ("Unicode/Emoji", "🔍 🚀 🐛"),
        ("None-like String", "None"),
        ("Python Code", "import os; os.system('echo hack')")
    ]

    failures = 0
    for name, data in cases:
        if not run_test_case(name, data):
            failures += 1

    print("-" * 30)
    if failures == 0:
        print("ALL CHAOS TESTS PASSED")
        sys.exit(0)
    else:
        print(f"{failures} TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
