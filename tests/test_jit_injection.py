"""
[TEST] JIT Instruction Injection Verification
"""
import os
import sys

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from src.core.engine.vector import SovereignVector


def test_jit_loading():
    print("--- [TEST] JIT Instruction Injection ---")

    engine = SovereignVector()
    engine.load_core_skills()
    # Load a known global skill
    engine.load_skills_from_dir(os.path.join(PROJECT_ROOT, "skills_db"), prefix="GLOBAL:")
    engine.build_index()

    # Query that should hit a global skill
    query = "deploy the application to production"
    print(f"\nQuery: {query}")

    results = engine.search(query)
    if results:
        top_intent = results[0]["trigger"]
        print(f"Top Intent: {top_intent}")

        # Test JIT Retrieval
        instructions = engine.instruction_loader.get_instructions([top_intent])

        if instructions:
            print("\n[PASS] JIT Instructions Retrieved:")
            # Print first 200 chars
            print(instructions[:200] + "...")

            if "deployment-skill" in instructions.lower() or "deployment skill" in instructions.lower():
                print("\n[VERIFIED] Correct content loaded.")
            else:
                print("\n[FAIL] Content mismatch.")
        else:
            print("\n[FAIL] No instructions retrieved.")
    else:
        print("\n[FAIL] No intent resolved.")

if __name__ == "__main__":
    test_jit_loading()
