import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSha256 } from "../src/canonical.js";
import { createWorkPacket, verifyWorkPacket, WorkPacketError } from "../src/work_packets.js";

const manifest = [{ path: "organism-v0/src/canonical.ts", sha256: canonicalSha256("canonical") }];
const base = {
  packet_id: "packet:s02:001", set_id: "CSO-ORGANISM-V0-EFFECTS", cell_id: "cell:s02:001",
  controller_generation: "generation:01", scope: "brain:CStar", action: "IMPLEMENT_S02_EFFECTS",
  input_manifest: manifest, write_allowlist: ["organism-v0/src/effects.ts"], output_allowlist: ["organism-v0/src/effects.ts"],
  requested_model: "gpt-5.6-luna", requested_reasoning: "max", actual_identity: "unreported",
  lease: { attempt: 1, retry_budget: 0 }, ceilings: { files: 5, descendants: 0 }, retry_budget: 0,
  terminal_schema: "corvus.terminal_packet.v1", tests: ["packet test"], protected_gates: [],
  transfer_checkpoint_ref: "S02-CSF-D007-checkpoint.v1.json",
};

test("work packet is compact, self-hashed, and binds current-cell input bytes", () => {
  const packet = createWorkPacket(base);
  assert.equal(verifyWorkPacket(packet), true);
  assert.equal(packet.input_manifest_sha256, canonicalSha256(manifest));
  assert.equal(packet.actual_identity, "unreported");
  assert.equal(Object.hasOwn(packet, "transcript"), false);
});

test("history and transcript fields fail closed", () => {
  assert.throws(() => createWorkPacket({ ...base, transcript: "full history" } as never),
    (error: unknown) => error instanceof WorkPacketError && error.code === "INVALID_PACKET");
  assert.throws(() => createWorkPacket({ ...base, retry_budget: 1 }),
    (error: unknown) => error instanceof WorkPacketError && error.code === "INVALID_PACKET");
  assert.throws(() => createWorkPacket({ ...base, input_manifest_sha256: canonicalSha256("wrong") }),
    (error: unknown) => error instanceof WorkPacketError && error.code === "INVALID_PACKET");
});

test("paths are normalized package-relative entries and read-only packets may be empty", () => {
  const readOnly = createWorkPacket({ ...base, action: "READ_ONLY_INSPECTION", actual_identity: undefined,
    write_allowlist: [], output_allowlist: [] });
  assert.equal(readOnly.actual_identity, "unreported");
  assert.equal(verifyWorkPacket(readOnly), true);
  const attested = createWorkPacket({ ...base, actual_identity: "host-attestation:cell-1" });
  assert.equal(attested.actual_identity, "host-attestation:cell-1");
  assert.equal(verifyWorkPacket(attested), true);
});

test("invalid and duplicate normalized paths fail closed", () => {
  for (const path of ["", "/absolute/path", ".", "..", "a/./b", "a/../b", "a\\b", "a\0b", "a//b", "a/b/"]) {
    assert.throws(() => createWorkPacket({ ...base,
      input_manifest: [{ path, sha256: canonicalSha256("path") }] } as never),
      (error: unknown) => error instanceof WorkPacketError && error.code === "INVALID_PACKET");
  }
  assert.throws(() => createWorkPacket({ ...base, write_allowlist: ["pkg/file.ts", "pkg/file.ts"] }),
    (error: unknown) => error instanceof WorkPacketError && error.code === "INVALID_PACKET");
  assert.throws(() => createWorkPacket({ ...base, output_allowlist: ["pkg/file.ts", "pkg/file.ts"] }),
    (error: unknown) => error instanceof WorkPacketError && error.code === "INVALID_PACKET");
});
