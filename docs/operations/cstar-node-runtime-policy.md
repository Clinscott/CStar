# CStar Node runtime policy

CStar native use is supported only on the runtime described by the canonical
root file `runtime-policy.json`:

- Node `25.8.1`, `NODE_MODULE_VERSION` `141`, and N-API `10`.
- npm `11.11.0`.
- `better-sqlite3` `12.6.2`.

`.nvmrc`, `package.json`, `package-lock.json`, CI, release CI, and the runtime
validation command are projections of that definition. `npm run
validate:runtime` fails closed when a projection or the active runtime drifts.

The production database boundary checks the Node version, modules ABI, N-API,
and installed native package version before it loads `better-sqlite3`. Native
artifact readiness also records the same policy check before running its
read-only in-memory `SELECT 1` smoke. A loadable native addon under another
Node ABI is not CStar runtime support.

This exact runtime is a source and CI policy. It does not authorize local
dependency installation, native rebuild, activation, restart, deployment, or
production acceptance.
