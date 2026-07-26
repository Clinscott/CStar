#!/usr/bin/env python3
"""
[DEBUG] System Integrity Verifier
Lore: "Ensuring the ravens are bound to the high seat."
Purpose: Verifies that core Sentinel modules can be imported and initialized.
"""

import sys
from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))


def verify_system_integrity() -> bool:
    return IntegrityVerifier.verify()


class IntegrityVerifier:
    """[O.D.I.N.] Orchestration logic for system integrity verification."""

    @staticmethod
    def verify() -> bool:
        """
        Verifies that Muninn and the main loop can be imported and initialized.

        Returns:
            True if the system is verified, False otherwise.
        """
        print("--- VERIFYING SYSTEM INTEGRITY ---")
        try:
            from src.core.engine.ravens.muninn import Muninn
            print("SUCCESS: Muninn imported.")

            # Initialize Muninn with current project root
            _ = Muninn(str(PROJECT_ROOT))
            print("SUCCESS: Muninn initialized.")

        except ImportError as e:
            print(f"FAILURE: ImportError in Muninn: {e}")
            return False
        except Exception as e:
            print(f"FAILURE: Exception during Muninn verification: {e}")
            return False

        print("\nSYSTEM VERIFIED.")
        return True


if __name__ == "__main__":
    if not IntegrityVerifier.verify():
        sys.exit(1)
