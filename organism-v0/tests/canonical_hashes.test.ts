import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalBytes,
  canonicalJson,
  canonicalSha256,
  hashOmittingField,
  sha256Hex,
  verifySelfHash,
  withSelfHash,
} from "../src/canonical.ts";
import {
  V0_SCHEMA_DECLARATIONS,
  assertValidClosedObject,
  isValidClosedObject,
  validateClosedObject,
} from "../src/schemas.ts";

type VectorFixture = {
  vectors: Array<{
    id: string;
    value: unknown;
    canonical: string;
    sha256: string;
  }>;
};

test("canonical JSON sorts object keys, preserves arrays, and ends with LF", () => {
  const value = {
    z: 1,
    a: { d: true, b: "ok" },
    items: [{ y: 2, x: 1 }],
  };
  const expected = "{\"a\":{\"b\":\"ok\",\"d\":true},\"items\":[{\"x\":1,\"y\":2}],\"z\":1}\n";
  assert.equal(canonicalJson(value), expected);
  assert.deepEqual(canonicalBytes(value), Buffer.from(expected, "utf8"));
  assert.equal(canonicalSha256(value), sha256Hex(expected));
});

test("all deterministic fixture vectors match canonical bytes and hashes", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../fixtures/intent_vectors.json", import.meta.url), "utf8"),
  ) as VectorFixture;
  assert.ok(fixture.vectors.length >= 3);
  for (const vector of fixture.vectors) {
    assert.equal(canonicalJson(vector.value), vector.canonical, vector.id);
    assert.match(vector.sha256, /^[0-9a-f]{64}$/, vector.id);
    assert.equal(canonicalSha256(vector.value), vector.sha256, vector.id);
  }
});

test("empty journal vector is stable and remains an empty ordered sequence", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../fixtures/intent_vectors.json", import.meta.url), "utf8"),
  ) as VectorFixture;
  const empty = fixture.vectors.find((vector) => vector.id === "empty-journal");
  assert.ok(empty);
  assert.deepEqual((empty.value as { events: unknown[] }).events, []);
  assert.equal((empty.value as { revision: number }).revision, 0);
  assert.equal(canonicalJson(empty.value), empty.canonical);
});

test("self-hash omits exactly the named field", () => {
  const body = { schema: "example.v0", value: [1, 2], self_hash: "stale" };
  const hash = hashOmittingField(body, "self_hash");
  const bound = withSelfHash(body, "self_hash");
  assert.equal(bound.self_hash, hash);
  assert.equal(verifySelfHash(bound, "self_hash"), true);
  assert.equal(verifySelfHash({ ...bound, value: [1, 3] }, "self_hash"), false);
  assert.notEqual(hashOmittingField(body, "other_field"), hash);
});

test("closed declarations reject unknown and missing fields", () => {
  const declaration = V0_SCHEMA_DECLARATIONS["corvus.snapshot.v1"];
  const complete = Object.fromEntries(declaration.required.map((key) => [
    key,
    key === "schema" ? declaration.schema : null,
  ]));
  assert.equal(isValidClosedObject(complete, declaration), true);
  assert.equal(isValidClosedObject({ ...complete, extra: true }, declaration), false);
  assert.equal(validateClosedObject({ ...complete, extra: true }, declaration).issues[0]?.code, "UNKNOWN_FIELD");
  const missing = { ...complete };
  delete missing.snapshot_sha256;
  assert.equal(validateClosedObject(missing, declaration).issues[0]?.code, "MISSING_FIELD");
  assert.throws(() => assertValidClosedObject({ ...complete, schema: "wrong.v0" }, declaration));
});

test("canonicalization fails closed for unsupported JSON values", () => {
  assert.throws(() => canonicalJson(undefined), /Unsupported JSON value/);
  assert.throws(() => canonicalJson(Number.NaN), /Non-finite number/);
  assert.throws(() => canonicalJson(new Date(0)), /plain JSON object/);
});
