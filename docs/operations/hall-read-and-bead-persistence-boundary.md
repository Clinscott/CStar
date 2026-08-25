# Hall Read and Bead Persistence Boundary

Hall access is effect-explicit:

- `getReadDb` opens only an existing `pennyone.db` with SQLite read-only and
  query-only enforcement. A missing store raises `hall_store_missing`; it does
  not create `.stats`, a database, schema objects, migrations, or seed rows.
- `getWritableDb` is reserved for an already-authorized mutation or bootstrap
  path. It may create the store and run the idempotent Hall schema bootstrap.
- Both handles require a canonical directory root, a non-symlink `.stats`
  directory, and a unique regular `pennyone.db`. Root, state directory, and
  database must be owned by the current Unix UID and must not be group- or
  world-writable. Symlink roots or path segments, hardlinked stores,
  directories in place of the database, unsafe modes, and file-identity
  replacement fail closed before a handle is returned. A new store is securely
  precreated at mode `0600`; `.stats` is created at mode `0700`.
- The ambiguous `getDb` compatibility alias is retired with
  `legacy_hall_writable_facade_retired_use_explicit_kernel_controller`. It never
  creates `.stats` or returns a writable handle.
- Schema bootstrap initializes a neutral Hall repository row. Reading legacy
  `sovereign_state.json` is not part of normal open; legacy import remains an
  explicit migration operation.

Repository projection arguments identify rows inside the control-plane Hall;
they are not alternate Hall database roots. The Hall store root is passed as a
separate parameter (or resolved from the current CStar root), so looking up a
mounted repository cannot open or create `.stats/pennyone.db` under that spoke.

Controller functions choose one of those handles according to their actual SQL
effect. CStar READ handlers use only read controllers or `getReadDb`; mutation,
request, and execution handlers request `getWritableDb` explicitly.

Direct Hall maintenance, inspection, analytics, migration, ingestion, review,
and seeding scripts are retired. Their stable
`legacy_direct_hall_script_retired_use_cstar_kernel` response occurs before
filesystem, host-memory, schema, Hall, or lifecycle effects. A future terminal
operation must be a separately registered kernel capability with its own
request-scoped authority and receipt; importing a persistence controller from a
script is not that contract.

Bead persistence is bounded to the Hall bead lifecycle. `upsertHallBead` does
not post a blackboard entry and therefore does not implicitly rewrite legacy
state, agent presence, mounted-spoke projections, or Hall coordination events.
Any future coordination event must be a separate, authorized Hall mutation with
its own receipt and scope.

The local threat boundary trusts processes already running as the CStar Unix
UID. Filesystem ownership and mode checks protect against other local users;
hard isolation between same-UID processes requires a separately operated
service account or sandbox and is not claimed by this in-process library.
