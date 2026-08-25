# Hall Database Handle-Cache Boundary

The long-lived Hall database facade caches at most eight distinct canonical
roots for read-only handles and eight for writable handles. A ninth distinct
root in either mode fails with `hall_database_root_cache_limit_exceeded` before
creating a `.stats` directory or opening another SQLite file.

Connections are not evicted implicitly because a concurrent lifecycle request
may still hold a handle. The explicit `closeDb`/`HallDatabase.close` boundary
closes every handle and resets both caches. Supported live MCP handlers use the
canonical CStar control root; the cap contains accidental or hostile library
use without altering lifecycle semantics.

This is a resource-safety contract only. It does not authorize a new Hall root,
direct SQLite access, migration, source work, execution, or cleanup.
