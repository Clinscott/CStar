import time
import asyncio

class EmpireStabilizer:
    """
    [Ω] THE STABILIZER OF FLOW
    Ensures the system is 'Waiting for Input' or 'Idle' before next command.
    """

    def __init__(self, timeout: float = 5.0):
        self.timeout = timeout

    async def wait_for_idle(self, system_check_fn):
        """
        Polls the system check function until it returns True (Idle).
        Eliminates non-deterministic sleep() calls.
        """
        start = time.time()
        while time.time() - start < self.timeout:
            if system_check_fn():
                return True
            await asyncio.sleep(0.1)
        
        raise TimeoutError("[!] SYSTEM FAILED TO STABILIZE. RUNE OF FLOW BROKEN.")

if __name__ == "__main__":
    stabilizer = EmpireStabilizer()
    print("[Ω] STABILIZER READY")
