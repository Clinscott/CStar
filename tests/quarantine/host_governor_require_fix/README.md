# Quarantine: test_host_governor.test.ts

## Reason
Uses `require()` in a Node.js ESM test context (line 298). The file uses `node:test`
which runs in ESM mode, but the beforeEach hook uses `require('node:child_process')`
which is CommonJS. No top-level `require` import exists, causing
`ReferenceError: require is not defined` at test runtime.

## Next Action
Rewrite the mock setup to use ESM-native module mocking via
`node:test`'s `mock.module()` API, or add a top-level `import { createRequire } from 'node:module'`
and use `const require = createRequire(import.meta.url)` at the top of the file.

## Canonical Fix
Replace:
```ts
originalChildProcess = require('node:child_process');
```
With:
```ts
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
originalChildProcess = require('node:child_process');
```

Then quarantine can be removed and test restored to `tests/unit/node-runtime/weaves/`.
