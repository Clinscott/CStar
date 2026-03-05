"""
[Ω] Mimir Client: The Synaptic Link
Lore: "A Raven's mind is linked to the Well by the threads of the Bifrost."
Purpose: Native Python MCP Client for querying PennyOne and Corvus Control.
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class MimirClient:
    """The central nervous system bridge for Python agents."""

    def __init__(self):
        self.project_root = Path(__file__).resolve().parent.parent.parent
        self._exit_stack = AsyncExitStack()
        self.sessions = {}

    async def _get_session(self, server_name: str) -> ClientSession:
        """Lazily initializes and returns an MCP session for a specific server."""
        if server_name in self.sessions:
            return self.sessions[server_name]

        # 1. Resolve Server Command
        if server_name == "pennyone":
            command = "npx"
            args = ["tsx", str(self.project_root / "src" / "tools" / "pennyone" / "mcp-server.ts")]
        elif server_name == "corvus-control":
            command = "npx"
            args = ["tsx", str(self.project_root / "src" / "tools" / "corvus-control-mcp.ts")]
        else:
            raise ValueError(f"Unknown MCP server: {server_name}")

        # 2. Establish Transport
        server_params = StdioServerParameters(command=command, args=args, env=os.environ.copy())
        
        # We use the exit stack to manage the context managers for persistent sessions
        read, write = await self._exit_stack.enter_async_context(stdio_client(server_params))
        session = await self._exit_stack.enter_async_context(ClientSession(read, write))
        
        await session.initialize()
        
        self.sessions[server_name] = session
        return session

    async def call_tool(self, server: str, tool: str, arguments: dict = None) -> Any:
        """Invokes an MCP tool and returns the result."""
        try:
            session = await self._get_session(server)
            result = await session.call_tool(tool, arguments or {})
            return result
        except Exception as e:
            print(f"[ERROR] Mimir Client failed to call {server}.{tool}: {e}", file=sys.stderr)
            return None

    async def get_file_intent(self, filepath: str) -> Optional[str]:
        """Convenience method to fulfill the Omniscience Mandate."""
        res = await self.call_tool("pennyone", "get_file_intent", {"filepath": filepath})
        if res and not res.isError:
            # Result content is usually a list of blocks
            return res.content[0].text
        return None

    async def search_well(self, query: str) -> Optional[str]:
        """Queries Mimir's Well for ranked intents."""
        res = await self.call_tool("pennyone", "search_by_intent", {"query": query})
        if res and not res.isError:
            return res.content[0].text
        return None

    async def index_sector(self, filepath: str) -> bool:
        """Triggers an incremental scan of a modified file."""
        res = await self.call_tool("pennyone", "index_sector", {"filepath": filepath})
        return res and not res.isError

    async def think(self, query: str, system_prompt: Optional[str] = None) -> Optional[str]:
        """Delegates high-fidelity thinking to the Host Oracle via MCP Sampling."""
        args = {"query": query}
        if system_prompt:
            args["system_prompt"] = system_prompt
            
        res = await self.call_tool("pennyone", "consult_oracle", args)
        if res and not res.isError:
            return res.content[0].text
        return None

    async def close(self):
        """Clean up sessions and transports."""
        await self._exit_stack.aclose()
        self.sessions.clear()

# Global Singleton instance for shared usage
mimir = MimirClient()

async def test_mimir():
    """Diagnostic check for the Synaptic Link."""
    print("[INFO] Testing Bifrost Bridge...")
    try:
        intent = await mimir.get_file_intent("src/core/annex.py")
        if intent:
            print(f"[SUCCESS] Mimir's Well responded:\n{intent}")
        else:
            print("[FAILURE] Mimir's Well is silent.")
    finally:
        await mimir.close()

if __name__ == "__main__":
    asyncio.run(test_mimir())
