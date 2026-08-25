#!/usr/bin/env node

/**
 * Retired CStar MCP TCP daemon entrypoint.
 *
 * Mutation-capable CStar tools require a host-bound caller identity. Loopback
 * TCP supplies no trustworthy peer/thread binding, so this compatibility
 * entrypoint fails closed until an authenticated transport is designed.
 */

process.stderr.write(
    '[cstar-kernel-daemon] unauthenticated_tcp_transport_disabled; use bin/cstar-kernel-mcp-bridge.js in direct mode\n',
);
process.exitCode = 2;
