"""
Synapse Sync
Identity: ODIN
Purpose: Synchronize local knowledge with the wider Corvus network.
Target: src.synapse.synapse_sync
"""
import runpy
import sys
from pathlib import Path

# Bootstrap Project Root
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if __name__ == "__main__":
    try:
        runpy.run_module('src.synapse.synapse_sync', run_name='__main__')
    except ImportError as e:
        print(f"Failed to load module: {e}")
        sys.exit(1)
