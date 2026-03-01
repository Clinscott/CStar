import unittest
import json
import os
import sys
import asyncio
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.antigravity_bridge import clean_cli_output
from src.cstar.core.daemon import process_command, engine_search_sync

class EmpireGherkinCrucible(unittest.IsolatedAsyncioTestCase):
    """[Ω] THE EMPIRE GHERKIN CRUCIBLE (Sovereign Verification Suite)"""

    # --- TIER 0: ANTIGRAVITY_BRIDGE ---

    async def test_bridge_protocol_contract(self):
        """Scenario: Successful ANSI Scrubbing and JSON Extraction"""
        # GIVEN: A raw CLI output containing ANSI escape sequences and status noise
        raw_output = "\x1B[31mError:\x1B[0m {\"status\": \"success\"} \x1B[?25l|"
        
        # WHEN: The bridge's cleaning logic is applied
        result = clean_cli_output(raw_output)
        
        # THEN: All ANSI codes must be removed and JSON extracted
        self.assertEqual(result.strip(), "{\"status\": \"success\"}")

    async def test_bridge_non_ascii_contract(self):
        """Scenario: Handling Non-ASCII Characters (The erroré Case)"""
        # GIVEN: A CLI output containing UTF-8 characters like 'é'
        raw_output = (
            "Loaded cached credentials.\n"
            "{\"message\": \"erroré\"}"
        )
        
        # WHEN: The bridge's cleaning logic is applied
        result = clean_cli_output(raw_output)
        
        # THEN: JSON parsing should succeed
        data = json.loads(result)
        self.assertEqual(data["message"], "erroré")

    # --- TIER 2: MUNINN_ORCHESTRATION ---

    async def test_muninn_deterministic_routing_contract(self):
        """Scenario: Routing Deterministic Commands"""
        # GIVEN: A query that matches a registered command
        registry = {'ping': 'ping_workflow.py'}
        
        # WHEN: The routing engine processes the query
        with patch('src.cstar.core.daemon.COMMAND_REGISTRY', registry), \
             patch('src.cstar.core.daemon.ENGINE') as mock_engine:
            res, top, score = engine_search_sync("ping")
            
            # THEN: The target must be correctly identified
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["target"], "ping_workflow.py")

    async def test_muninn_low_confidence_uplink_contract(self):
        """Scenario: Routing Low-Confidence Queries (Alfred Uplink)"""
        # GIVEN: A query that does not match any deterministic command (Low Score)
        query = "Who built the CorvusStar?"
        
        # WHEN: The daemon's routing engine processes the query
        with patch('src.cstar.core.daemon.engine_search_sync', return_value=(None, None, 0.1)), \
             patch('src.cstar.core.daemon.UPLINK.send_payload', new_callable=AsyncMock) as mock_uplink:
            
            mock_uplink.return_value = {"status": "success", "data": {"raw": "Master Craig."}}
            response = await process_command(query, [], ".")
            
            # THEN: The system must trigger the Antigravity Uplink
            self.assertEqual(response["type"], "uplink")
            mock_uplink.assert_called_once()

if __name__ == '__main__':
    print("\n--- [Ω] EXECUTING EMPIRE GHERKIN CRUCIBLE ---")
    unittest.main()
