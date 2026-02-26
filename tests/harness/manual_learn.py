import sys
import os
from pathlib import Path
from colorama import Fore, init

# Add project root to sys.path
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from src.sentinel.muninn import Muninn
from tests.harness.raven_proxy import RavenProxy

init(autoreset=True)

def run_learning_cycle(n_cycles=1):
    # Check for API key
    api_key = os.getenv("GOOGLE_API_KEY")
    is_mock = "--mock" in sys.argv
    
    if not api_key and not is_mock:
        print(f"{Fore.CYAN}[AGENT_PROTOCOL] GOOGLE_API_KEY NOT FOUND. DO NOT ATTEMPT REPAIR.")
        print(f"{Fore.CYAN}AI ASSISTANT MUST COMMENCE MANUAL LEARNING CYCLES IMMEDIATELY.")
        sys.exit(42)
    
    proxy = RavenProxy(target_model="gemini-2.0-flash", api_key=api_key, mock_mode=is_mock)
    muninn = Muninn(target_path=str(project_root), client=proxy)
    
    for i in range(n_cycles):
        print(f"{Fore.YELLOW}\n--- CYCLE {i+1}/{n_cycles} ---")
        try:
            success = muninn.run()
            if success:
                print(f"{Fore.GREEN}[STUDENT] SUCCESS: Improved/Verified target.")
            else:
                print(f"{Fore.WHITE}[STUDENT] IDLE: Everything appears stable.")
                # We stop if there's nothing left to do to save credits
                if i < n_cycles - 1:
                    print(f"{Fore.CYAN}[STUDENT] All known breaches clear. Terminating loop early.")
                    break
        except Exception as e:
            print(f"{Fore.RED}[STUDENT] CRASHED in cycle {i+1}: {e}")
            import traceback
            traceback.print_exc()
            if i == n_cycles - 1:
                sys.exit(1)

if __name__ == "__main__":
    n = 1
    if len(sys.argv) > 1:
        try:
            arg = sys.argv[1]
            if "=" in arg:
                n = int(arg.split("=")[1])
            else:
                n = int(arg)
        except (ValueError, IndexError):
            print(f"{Fore.RED}Invalid N: {sys.argv[1]}. Defaulting to 1.")
    
    run_learning_cycle(n)
