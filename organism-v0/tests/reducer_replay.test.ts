import assert from "node:assert/strict";
import test from "node:test";
import {
  initialState,
  makeReducerEvent,
  reduce,
  ReducerError,
} from "../src/reducer.js";
import { canonicalSha256 } from "../src/canonical.js";

const scope = "brain:CStar";
const generation = "manual-clean-break-20260815-01";
const orderedEvents = [
  "INTENT_RECEIVED",
  "INTENT_VERIFIED",
  "PLAN_DERIVED",
  "SET_BOUND",
  "EFFECT_RESERVED",
  "EFFECT_ACKED",
  "WORK_DISPATCHED",
  "TERMINAL_RECORDED",
  "INDEPENDENT_VALIDATED",
  "RESULT_RECORDED",
  "TRANSFER_CHECKPOINTED",
  "CLOSED",
] as const;

function runOrderedSequence() {
  let state = initialState(scope, generation);
  const eventHashes: string[] = [];
  for (const eventType of orderedEvents) {
    const event = makeReducerEvent({
      event_type: eventType,
      scope,
      controller_generation: generation,
      expected_revision: state.revision,
      payload: { ordinal: state.revision, action: eventType },
    });
    const result = reduce(state, event);
    state = result.state;
    eventHashes.push(result.event_sha256);
  }
  return { state, eventHashes };
}

function expectCode(action: () => unknown, code: ReducerError["code"]) {
  assert.throws(action, (error: unknown) => error instanceof ReducerError && error.code === code);
}

test("100/100 deterministic replay pairs are byte-identical", () => {
  let accepted = 0;
  for (let pair = 0; pair < 100; pair += 1) {
    const left = runOrderedSequence();
    const right = runOrderedSequence();
    assert.equal(canonicalSha256(left.state), canonicalSha256(right.state));
    assert.deepEqual(left.eventHashes, right.eventHashes);
    accepted += 1;
  }
  assert.equal(accepted, 100);
});

test("same idempotency key and bytes replay without a second revision", () => {
  const state = initialState(scope, generation);
  const event = makeReducerEvent({
    event_type: "INTENT_RECEIVED",
    scope,
    controller_generation: generation,
    expected_revision: 0,
    idempotency_key: "same-event",
  });
  const first = reduce(state, event);
  const replay = reduce(first.state, event);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.state, first.state);
  assert.equal(replay.state.revision, 1);
});

test("stale, skipped, out-of-order, scope, generation, and protected transitions reject", () => {
  const first = reduce(
    initialState(scope, generation),
    makeReducerEvent({
      event_type: "INTENT_RECEIVED",
      scope,
      controller_generation: generation,
      expected_revision: 0,
    }),
  ).state;
  expectCode(
    () => reduce(first, makeReducerEvent({
      event_type: "INTENT_VERIFIED",
      scope,
      controller_generation: generation,
      expected_revision: 0,
    })),
    "STALE_REVISION",
  );
  expectCode(
    () => reduce(initialState(scope, generation), makeReducerEvent({
      event_type: "PLAN_DERIVED",
      scope,
      controller_generation: generation,
      expected_revision: 0,
    })),
    "OUT_OF_ORDER",
  );
  expectCode(
    () => reduce(initialState(scope, generation), makeReducerEvent({
      event_type: "INTENT_RECEIVED",
      scope,
      controller_generation: generation,
      expected_revision: 2,
    })),
    "SKIPPED_REVISION",
  );
  expectCode(
    () => reduce(initialState(scope, generation), makeReducerEvent({
      event_type: "INTENT_RECEIVED",
      scope: "spoke:other",
      controller_generation: generation,
      expected_revision: 0,
    })),
    "CROSS_SCOPE",
  );
  expectCode(
    () => reduce(initialState(scope, generation), makeReducerEvent({
      event_type: "INTENT_RECEIVED",
      scope,
      controller_generation: "old-generation",
      expected_revision: 0,
    })),
    "STALE_GENERATION",
  );
  expectCode(
    () => reduce(initialState(scope, generation), makeReducerEvent({
      event_type: "INTENT_RECEIVED",
      scope,
      controller_generation: generation,
      expected_revision: 0,
      protected_gates: ["activation"],
    })),
    "PROTECTED_EFFECT",
  );
});

test("duplicate conflicts, cancellation fences, and task recurrence circuit-break", () => {
  const start = initialState(scope, generation);
  const firstEvent = makeReducerEvent({
    event_type: "INTENT_RECEIVED",
    scope,
    controller_generation: generation,
    expected_revision: 0,
    idempotency_key: "conflict-key",
    payload: { value: 1 },
  });
  const afterFirst = reduce(start, firstEvent).state;
  expectCode(
    () => reduce(afterFirst, makeReducerEvent({
      event_type: "INTENT_RECEIVED",
      scope,
      controller_generation: generation,
      expected_revision: 0,
      idempotency_key: "conflict-key",
      payload: { value: 2 },
    })),
    "IDEMPOTENCY_CONFLICT",
  );

  const cancelled = reduce(afterFirst, makeReducerEvent({
    event_type: "CANCELLED",
    scope,
    controller_generation: generation,
    expected_revision: afterFirst.revision,
  })).state;
  expectCode(
    () => reduce(cancelled, makeReducerEvent({
      event_type: "INTENT_VERIFIED",
      scope,
      controller_generation: generation,
      expected_revision: cancelled.revision,
    })),
    "TERMINAL_FENCE",
  );

  let taskState = initialState(scope, generation);
  taskState = reduce(taskState, makeReducerEvent({
    event_type: "TASK_STARTED",
    scope,
    controller_generation: generation,
    expected_revision: taskState.revision,
  })).state;
  taskState = reduce(taskState, makeReducerEvent({
    event_type: "TASK_COMPLETE",
    scope,
    controller_generation: generation,
    expected_revision: taskState.revision,
  })).state;
  expectCode(
    () => reduce(taskState, makeReducerEvent({
      event_type: "TASK_STARTED",
      scope,
      controller_generation: generation,
      expected_revision: taskState.revision,
    })),
    "CIRCUIT_BREAKER_OPEN",
  );
});

