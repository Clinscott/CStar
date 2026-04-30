import json
import sys
import time
import asyncio
from pathlib import Path

# Path Resolution
PROJECT_ROOT = Path("/home/morderith/Corvus/CStar")
SECRETS_FILE = PROJECT_ROOT / ".agents" / "secrets" / "x_session.json"

# Dependency Injection
try:
    from twikit import Client
except ImportError:
    sys.path.append("/home/morderith/Corvus/Spoke_XBriefer")
    try:
        from twikit import Client
    except ImportError:
        print("CRITICAL: twikit missing.")
        sys.exit(1)

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.bead_ledger import BeadLedger, SovereignBead
from src.core.engine.hall_schema import build_repo_id

async def fetch_and_inject():
    """Autonomous Bookmark-to-Bead pipeline"""
    if not SECRETS_FILE.exists() or SECRETS_FILE.stat().st_size == 0:
        print(f"ERROR: Secrets not found in {SECRETS_FILE}. Human must provide cookies once.")
        return 0

    # Twikit requires 'en-US' locale by default for parsing some dates
    client = Client(language="en-US")
    try:
        client.load_cookies(str(SECRETS_FILE))
    except Exception as e:
        print(f"ERROR: Cookie load failed: {e}")
        return 0

    print("[SYSTEM] Fetching bookmarks from X...")
    try:
        bookmarks = await client.get_bookmarks(count=10) # Bounded for the 1MB limit
        if not bookmarks:
            print("[SYSTEM] No new bookmarks found.")
            return 0
    except Exception as e:
        print(f"ERROR: Bookmark fetch failed: {e}")
        return 0

    ledger = BeadLedger(PROJECT_ROOT)
    repo_id = build_repo_id(PROJECT_ROOT)
    scan_id = f"scan:bookmarks:{int(time.time())}"
    
    count = 0
    for b in bookmarks:
        bead_id = f"bead:bookmark:{b.id}"
        # Check if bead already exists to avoid duplication
        with ledger.connect() as conn:
            exists = conn.execute("SELECT 1 FROM hall_beads WHERE bead_id = ?", (bead_id,)).fetchone()
        
        if exists:
            continue

        rationale = (
            f"Analyze this X bookmark from @{b.user.screen_name if b.user else 'unknown'} for Estate Integration:\n"
            f"\"{b.text}\"\n\n"
            "Task:\n"
            "1. Identify the core technology/concept.\n"
            "2. Run `npx tsx cstar.ts hall <concept>` to find the best Spoke.\n"
            "3. Append your integration plan to docs/bookmarks/estate_integration.md"
        )
        
        ledger.upsert_bead(
            bead_id=bead_id,
            scan_id=scan_id,
            rationale=rationale,
            target_kind="OTHER",
            status="OPEN",
            created_at=int(time.time()),
            updated_at=int(time.time()),
            acceptance_criteria="Agent successfully mapped the bookmark and updated docs."
        )
        
        count += 1
        print(f"  + Injected {bead_id}")

    return count

def main():
    print("🔱 [AUTONOMOUS] CORVUS BOOKMARK WEAVER 🔱")
    new_beads = asyncio.run(fetch_and_inject())
    
    if new_beads > 0:
        print(f"\n[SYSTEM] {new_beads} new beads in the Ledger. They are ready for the swarm.")
    else:
        print("\n[SYSTEM] Estate is current. No new beads to weave.")

if __name__ == "__main__":
    main()
