import {
  canonicalSha256,
  hashOmittingField,
  isPlainJsonObject,
  sha256Hex,
  withSelfHash,
} from "./canonical.js";
import { validateClosedObject } from "./schemas.js";

export const INTENT_SCHEMA = "corvus.intent_envelope.v1" as const;

export type ParseOutcome = "ACCEPTED" | "NEEDS_OPERATOR_INPUT" | "REJECTED";

export interface SourceAttestation {
  readonly [key: string]: unknown;
}

export interface IntentSource {
  readonly host_id: string;
  readonly source_thread_id: string;
  readonly source_turn_id: string;
  readonly attestation: string | SourceAttestation;
}

export interface RootAuthorityGrant {
  readonly grant_type: "ROOT_AUTHORITY";
  readonly grant_id: string;
  readonly scope: string;
}

export interface IntentVerificationFlags {
  readonly schema_valid: boolean;
  readonly source_valid: boolean;
  readonly hash_valid: boolean;
  readonly authority_granted: boolean;
}

export interface IntentEnvelope {
  readonly schema: typeof INTENT_SCHEMA;
  readonly raw_text_utf8: string;
  readonly raw_text_sha256: string;
  readonly normalized_text_utf8: string;
  readonly source: IntentSource;
  readonly received_at_measured: unknown;
  readonly operator_grant_refs: readonly RootAuthorityGrant[];
  readonly requested_scope_hints: readonly string[];
  readonly requested_protected_effects: readonly string[];
  readonly policy_version: string;
  readonly parse_outcome: ParseOutcome;
  readonly verification: IntentVerificationFlags;
  readonly envelope_sha256: string;
}

export interface IntentEnvelopeInput {
  readonly raw_text_utf8: string;
  readonly source: IntentSource;
  readonly received_at_measured: unknown;
  readonly operator_grant_refs: readonly RootAuthorityGrant[];
  readonly requested_scope_hints: readonly string[];
  readonly requested_protected_effects: readonly string[];
  readonly policy_version: string;
  readonly parse_outcome?: ParseOutcome;
}

export interface IntentVerificationResult {
  readonly valid: boolean;
  readonly schema_valid: boolean;
  readonly source_valid: boolean;
  readonly hash_valid: boolean;
  readonly authority_granted: boolean;
  readonly envelope_hash_valid: boolean;
  readonly issues: readonly string[];
}

export class IntentVerificationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join("; ") || "Intent envelope verification failed");
    this.name = "IntentVerificationError";
    this.issues = issues;
  }
}

const SOURCE_KEYS = ["host_id", "source_thread_id", "source_turn_id", "attestation"];
const GRANT_KEYS = ["grant_type", "grant_id", "scope"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainJsonObject(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validAttestation(value: unknown): boolean {
  if (nonEmptyString(value)) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  // Hosts may expose different attestation evidence. The evidence must still
  // state that it was verified; arbitrary prose is not an attestation.
  return value.verified === true || value.attested === true || value.valid === true;
}

function validSource(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, SOURCE_KEYS)) {
    return false;
  }
  return nonEmptyString(value.host_id)
    && nonEmptyString(value.source_thread_id)
    && nonEmptyString(value.source_turn_id)
    && validAttestation(value.attestation);
}

function validGrant(value: unknown): value is RootAuthorityGrant {
  if (!isRecord(value) || !hasExactKeys(value, GRANT_KEYS)) {
    return false;
  }
  return value.grant_type === "ROOT_AUTHORITY"
    && nonEmptyString(value.grant_id)
    && nonEmptyString(value.scope);
}

function validStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function validMeasuredValue(value: unknown): boolean {
  if (nonEmptyString(value)) {
    return true;
  }
  return isRecord(value) && Object.keys(value).length > 0;
}

function hasRootAuthorityGrant(value: unknown): value is readonly RootAuthorityGrant[] {
  return Array.isArray(value) && value.some((grant) => validGrant(grant));
}

/** The normalized text is a derived view. It never replaces raw operator bytes. */
export function normalizeIntentText(rawText: string): string {
  return rawText.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Build an envelope from typed fields. No identifier is read from raw text. */
export function createIntentEnvelope(input: IntentEnvelopeInput): IntentEnvelope {
  const rawText = input.raw_text_utf8;
  if (typeof rawText !== "string") {
    throw new TypeError("raw_text_utf8 must be a string");
  }
  const sourceValid = validSource(input.source);
  const authorityGranted = hasRootAuthorityGrant(input.operator_grant_refs);
  const envelopeWithoutHash = {
    schema: INTENT_SCHEMA,
    raw_text_utf8: rawText,
    raw_text_sha256: sha256Hex(rawText),
    normalized_text_utf8: normalizeIntentText(rawText),
    source: input.source,
    received_at_measured: input.received_at_measured,
    operator_grant_refs: input.operator_grant_refs,
    requested_scope_hints: input.requested_scope_hints,
    requested_protected_effects: input.requested_protected_effects,
    policy_version: input.policy_version,
    parse_outcome: input.parse_outcome ?? (sourceValid && authorityGranted ? "ACCEPTED" : "REJECTED"),
    verification: {
      schema_valid: true,
      source_valid: sourceValid,
      hash_valid: true,
      authority_granted: authorityGranted,
    },
  };
  return withSelfHash(envelopeWithoutHash, "envelope_sha256") as IntentEnvelope;
}

export const buildIntentEnvelope = createIntentEnvelope;

/** Verify every authority-bearing property before a derived identifier is used. */
export function verifyIntentEnvelope(value: unknown): IntentVerificationResult {
  const issues: string[] = [];
  const schemaResult = validateClosedObject(value, INTENT_SCHEMA);
  const schemaValid = schemaResult.valid;
  if (!schemaValid) {
    issues.push(...schemaResult.issues.map((issue) => `${issue.path}: ${issue.message}`));
  }

  if (!isRecord(value)) {
    return {
      valid: false,
      schema_valid: false,
      source_valid: false,
      hash_valid: false,
      authority_granted: false,
      envelope_hash_valid: false,
      issues,
    };
  }

  const sourceValid = validSource(value.source);
  if (!sourceValid) {
    issues.push("$.source: invalid source attestation");
  }
  const rawHashValid = typeof value.raw_text_utf8 === "string"
    && value.raw_text_sha256 === sha256Hex(value.raw_text_utf8);
  if (!rawHashValid) {
    issues.push("$.raw_text_sha256: raw text hash mismatch");
  }
  const envelopeHashValid = typeof value.envelope_sha256 === "string"
    && value.envelope_sha256 === hashOmittingField(value, "envelope_sha256");
  if (!envelopeHashValid) {
    issues.push("$.envelope_sha256: self-hash mismatch");
  }
  const authorityGranted = hasRootAuthorityGrant(value.operator_grant_refs);
  if (!authorityGranted) {
    issues.push("$.operator_grant_refs: typed ROOT_AUTHORITY grant required");
  }
  if (!validMeasuredValue(value.received_at_measured)) {
    issues.push("$.received_at_measured: measured value required");
  }
  if (!validStringArray(value.requested_scope_hints)) {
    issues.push("$.requested_scope_hints: string array required");
  }
  if (!validStringArray(value.requested_protected_effects)) {
    issues.push("$.requested_protected_effects: string array required");
  }
  if (!nonEmptyString(value.policy_version)) {
    issues.push("$.policy_version: non-empty policy version required");
  }
  if (value.parse_outcome !== "ACCEPTED"
    && value.parse_outcome !== "NEEDS_OPERATOR_INPUT"
    && value.parse_outcome !== "REJECTED") {
    issues.push("$.parse_outcome: invalid parse outcome");
  }

  const verification = value.verification;
  const verificationValid = isRecord(verification)
    && hasExactKeys(verification, ["schema_valid", "source_valid", "hash_valid", "authority_granted"])
    && verification.schema_valid === schemaValid
    && verification.source_valid === sourceValid
    && verification.hash_valid === rawHashValid
    && verification.authority_granted === authorityGranted;
  if (!verificationValid) {
    issues.push("$.verification: verification flags do not match evidence");
  }

  return {
    valid: issues.length === 0,
    schema_valid: schemaValid,
    source_valid: sourceValid,
    hash_valid: rawHashValid,
    authority_granted: authorityGranted,
    envelope_hash_valid: envelopeHashValid,
    issues,
  };
}

export function assertVerifiedIntentEnvelope(value: unknown): asserts value is IntentEnvelope {
  const result = verifyIntentEnvelope(value);
  if (!result.valid) {
    throw new IntentVerificationError(result.issues);
  }
}

/**
 * Derive an identifier only from a verified envelope hash, an ordinal, and
 * canonical action bytes. Raw operator prose is never parsed as authority.
 */
export function deriveIdentifier(
  envelope: unknown,
  ordinal: number,
  action: unknown,
): string {
  assertVerifiedIntentEnvelope(envelope);
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError("Identifier ordinal must be a non-negative safe integer");
  }
  return canonicalSha256({
    schema: "corvus.derived_identifier.v0",
    parent_sha256: envelope.envelope_sha256,
    ordinal,
    action,
  });
}

export const deriveId = deriveIdentifier;
export const deriveGeneratedIdentifier = deriveIdentifier;

