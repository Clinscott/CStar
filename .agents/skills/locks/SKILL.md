# 🔱 TASK LEASE MANAGEMENT SKILL (v1.0)

## MANDATE
Synchronize concurrent agent executions by managing exclusive task leases via the PennyOne database.

## LOGIC PROTOCOL
1. **LEASE ACQUISITION**: Attempt to acquire an exclusive lock for a target file path.
2. **EXPIRY ENFORCEMENT**: Automatically purge expired leases to prevent deadlocks.
3. **LEASE RENEWAL**: Allow the holding agent to renew their lease duration.
4. **RELEASE FLOW**: Explicitly release the lock upon task completion or failure.

## USAGE
`cstar locks --acquire --path <file> [--agent <id>] [--duration <ms>]`
`cstar locks --release --path <file> [--agent <id>]`
