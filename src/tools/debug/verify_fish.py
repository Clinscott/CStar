
import os
import sys
import types
from unittest.mock import MagicMock

# Create a mock module for 'google'
google = types.ModuleType("google")
sys.modules["google"] = google

# Create a mock module for 'google.generativeai'
generativeai = MagicMock()
sys.modules["google.generativeai"] = generativeai
google.generativeai = generativeai

# Add current dir to path
sys.path.append(os.getcwd())

print("--- VERIFYING SOVEREIGN FISH ---")
try:
    import sovereign_fish
    print("SUCCESS: sovereign_fish imported.")
    
    # Mock API key
    os.environ["GOOGLE_API_KEY"] = "TEST"
    
    # Init
    fish = sovereign_fish.SovereignFish(".")
    print("SUCCESS: SovereignFish initialized.")
    
except ImportError as e:
    print(f"FAILURE: ImportError in sovereign_fish: {e}")
except Exception as e:
    print(f"FAILURE: Exception in sovereign_fish: {e}")

print("\n--- VERIFYING MAIN LOOP ---")
try:
    import main_loop
    print("SUCCESS: main_loop imported.")
except ImportError as e:
    print(f"FAILURE: ImportError in main_loop: {e}")
except Exception as e:
    print(f"FAILURE: Exception in main_loop: {e}")
