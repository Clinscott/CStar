import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export type CompatibilityResult = {
  ok: boolean;
  errors: string[];
  rows: number;
  pathMoves: number;
  byteDonations: number;
  duplicateReducerWriters: number;
  duplicateJournalWriters: number;
};

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const physicalLines = (text: string): number => text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

export function checkCompatibility(root = resolve(import.meta.dirname, "../..")): CompatibilityResult {
  const errors: string[] = [];
  const mapPath = join(root, "organism-v0/manifest/flat-compatibility-map.v1.json");
  if (!existsSync(mapPath)) return { ok: false, errors: ["missing-map"], rows: 0, pathMoves: -1, byteDonations: -1, duplicateReducerWriters: -1, duplicateJournalWriters: -1 };
  const map = JSON.parse(readFileSync(mapPath, "utf8")) as Record<string, unknown>;
  const rows = Array.isArray(map.rows) ? map.rows as Array<Record<string, unknown>> : [];
  const sourceManifestPath = String(map.source_manifest_path ?? "");
  if (!existsSync(sourceManifestPath)) errors.push("missing-source-manifest");
  const sourceRows = existsSync(sourceManifestPath) ? readFileSync(sourceManifestPath, "utf8").trimEnd().split("\n").map((line) => {
    const [path, hash, bytes, lines] = line.split("\t");
    return { path, sha256: hash, bytes: Number(bytes), physical_lines: Number(lines) };
  }) : [];
  if (rows.length !== 19 || sourceRows.length !== 19) errors.push(`row-count:${rows.length}/${sourceRows.length}`);
  if (map.source_manifest_sha256 !== (existsSync(sourceManifestPath) ? sha256(readFileSync(sourceManifestPath, "utf8")) : "")) errors.push("source-manifest-hash");
  const expected = new Map(sourceRows.map((row) => [row.path, row]));
  const seen = new Set<string>();
  for (const row of rows) {
    const path = String(row.path ?? "");
    if (seen.has(path)) errors.push(`duplicate-path:${path}`);
    seen.add(path);
    const source = expected.get(path);
    if (!source || row.sha256 !== source.sha256 || row.bytes !== source.bytes || row.physical_lines !== source.physical_lines) errors.push(`preimage:${path}`);
    if (row.state !== "FLAT_ACCEPTED_COMPATIBILITY" || row.moved !== false || row.donated !== false || row.duplicate_writer !== false) errors.push(`row-state:${path}`);
    if (!existsSync(join(root, path))) errors.push(`missing-flat:${path}`);
    else {
      const bytes = readFileSync(join(root, path));
      const text = bytes.toString("utf8");
      if (sha256(bytes) !== row.sha256 || bytes.byteLength !== row.bytes || physicalLines(text) !== row.physical_lines) errors.push(`changed-flat:${path}`);
    }
  }
  if (map.schema !== "corvus.organism.flat_compatibility_map.v1" || map.state !== "FLAT_ACCEPTED_COMPATIBILITY") errors.push("map-state");
  if (map.path_moves !== 0 || map.byte_donations !== 0 || map.duplicate_reducer_writers !== 0 || map.duplicate_journal_writers !== 0) errors.push("nonzero-compatibility-counters");
  if (map.canonical_reducer !== "organism-v0/src/reducer.ts" || map.canonical_journal !== "organism-v0/src/journal.ts" || map.canonical_controller !== "cstar") errors.push("canonical-binding");
  const reducerRows = rows.filter((row) => String(row.logical_owner).includes("reducer-journal") && String(row.path).endsWith("reducer.ts"));
  const journalRows = rows.filter((row) => String(row.logical_owner).includes("reducer-journal") && String(row.path).endsWith("journal.ts"));
  if (reducerRows.length !== 1 || journalRows.length !== 1) errors.push("canonical-writer-cardinality");
  return { ok: errors.length === 0, errors, rows: rows.length, pathMoves: Number(map.path_moves), byteDonations: Number(map.byte_donations), duplicateReducerWriters: Number(map.duplicate_reducer_writers), duplicateJournalWriters: Number(map.duplicate_journal_writers) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkCompatibility();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
