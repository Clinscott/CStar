"""
Daemon Manager
Identity: ODIN
Purpose: Alias for Ravens/Huginn/Muninn.
"""
import sys
from pathlib import Path

# Add current directory to path to import ravens
sys.path.append(str(Path(__file__).parent))

try:
    import ravens
    if __name__ == "__main__":
        ravens.main()
except ImportError:
    print("Error: Could not find ravens.py")
    sys.exit(1)
