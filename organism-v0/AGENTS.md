# Organism v0 topology contract

This contract applies to `organism-v0` and all descendants. The parent
contract is the Corvus Star invariant set plus topology contract
`a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011`.

## Scope and authority

- Scope: `organism-v0`.
- Parent scope: none; the durable parent is Corvus Star OS.
- Controller identity: `cstar`.
- Controller generation source: durable CStar state.
- This file is a restrictive declaration. It grants no authority.
- CStar owns the one canonical reducer, one canonical journal, lifecycle
  transitions, effects, receipts, validation, and acceptance.

## Effects and gates

- Allowed local effects: read declared topology files and emit bounded local
  lint receipts.
- Source relocation, copying, symlinking, migration, and duplicate writers are
  prohibited.
- Hall and SQLite writes, provider calls, network, credentials, installation,
  registration, activation, restart, deployment, production, Git publication,
  secrets/configuration mutation, deletion, and public release are prohibited.
- Forge = `TOMBSTONED_PERMANENT`.
- No automatic cognition or automatic worker execution is permitted.

## Health and continuity

- Health signals are declared by `manifest/health-signals.v1.json`.
- The required grade is measured, typed, and fail-closed; unavailable evidence
  is recorded as `unavailable`.
- Succession uses one atomic CStar transition: revoke the old generation,
  identify the new generation, bind a handoff, and append the event.
- A local declaration cannot self-appoint, self-succeed, or continue a stale
  generation.
- Material design drift, destructive risk, uncertain authority, protected
  effects, or an operator choice escalates to the authoritative parent.

## Bound contracts

- All descendant contracts are subordinate. Child policy adds restrictions
  only and cannot weaken this contract or any parent invariant.
- Role manifests are under `manifest/` and each declared scope.
- Capability profiles are closed and hash-bound in `manifest/` and each scope.
- Schemas are under `schemas/`; deterministic tools are under `tools/`;
  focused tests are under `tests/`; procedures are under `runbooks/`.
- Bounded, content-addressed memory is under `memory/` and is not authority.
- Accepted S00-S03 flat bytes remain immutable compatibility inputs. S03A does
  not open S04 and does not activate the tiered topology.
