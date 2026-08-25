import { createHash } from "node:crypto";

export const AUGURY_EXPERIMENTAL_MAX_CELLS = 16 as const;

export type AuguryGoalTaskInput = {
  action: string;
  productPath: string;
  suggestedTokenCeiling?: number;
};

export type AuguryGoalPlanInput = {
  objective: string;
  tasks: readonly AuguryGoalTaskInput[];
};

export type AuguryCellMetrics = {
  attempts: 0;
  tokens: 0;
  elapsed: 0;
  protectedEffects: 0;
  outsideScopeChanges: 0;
  terminalState: "PENDING";
};

export type AuguryGoalCell = {
  id: string;
  ordinal: number;
  action: string;
  productAllowlist: readonly [string];
  requestedModel: "gpt-5.6-luna";
  requestedReasoning: "max";
  actualIdentity: "unreported";
  suggestedTokenCeiling: number;
  readiness: "READY" | "LOCKED";
  terminalRequirement: "ONE_TERMINAL_PACKET";
  automaticRetries: 0;
  descendants: false;
  continuation: false;
  replay: false;
  fallback: false;
  metrics: AuguryCellMetrics;
};

export type AuguryGoalPlan = {
  schema: "cstar.augury_experimental_goal_plan.v1";
  planId: string;
  objective: string;
  cells: readonly AuguryGoalCell[];
};

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

const SCHEMA = "cstar.augury_experimental_goal_plan.v1" as const;
const DEFAULT_TOKEN_CEILING = 8000;
const MIN_TOKEN_CEILING = 1000;
const MAX_TOKEN_CEILING = 64000;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  if (CONTROL_CHARACTERS.test(value)) {
    throw new TypeError(`${label} must not contain control characters`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${label} must not be blank`);
  }
  return normalized;
}

/* Canonical JSON sorts object keys recursively, preserves array order, and
 * emits JSON primitives without whitespace. This is the hash contract; it
 * does not depend on source/object insertion order. */
function canonicalJson(value: CanonicalValue): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as { readonly [key: string]: CanonicalValue };
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function sha256(value: CanonicalValue): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function compileAuguryGoalPlan(input: AuguryGoalPlanInput): AuguryGoalPlan {
  if (!isRecord(input)) {
    throw new TypeError("input must be an object");
  }
  const objective = normalizedText(input.objective, "objective");
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
    throw new TypeError("tasks must contain at least one task");
  }
  if (input.tasks.length > AUGURY_EXPERIMENTAL_MAX_CELLS) {
    throw new RangeError(`tasks must contain at most ${AUGURY_EXPERIMENTAL_MAX_CELLS} tasks`);
  }

  const normalizedTasks: Array<{ action: string; productPath: string; suggestedTokenCeiling: number }> = [];
  const productPaths = new Set<string>();
  for (let index = 0; index < input.tasks.length; index += 1) {
    const rawTask: unknown = input.tasks[index];
    if (!isRecord(rawTask)) {
      throw new TypeError(`tasks[${index}] must be an object`);
    }
    const action = normalizedText(rawTask.action, `tasks[${index}].action`);
    const productPath = normalizedText(rawTask.productPath, `tasks[${index}].productPath`);
    if (productPaths.has(productPath)) {
      throw new TypeError(`duplicate product path: ${productPath}`);
    }
    productPaths.add(productPath);

    const suggested = rawTask.suggestedTokenCeiling;
    const suggestedTokenCeiling = suggested === undefined ? DEFAULT_TOKEN_CEILING : suggested;
    if (typeof suggestedTokenCeiling !== "number" || !Number.isInteger(suggestedTokenCeiling) || suggestedTokenCeiling < MIN_TOKEN_CEILING || suggestedTokenCeiling > MAX_TOKEN_CEILING) {
      throw new RangeError(`tasks[${index}].suggestedTokenCeiling must be an integer from ${MIN_TOKEN_CEILING} to ${MAX_TOKEN_CEILING}`);
    }
    normalizedTasks.push({ action, productPath, suggestedTokenCeiling });
  }

  const planMaterial: CanonicalValue = {
    schema: SCHEMA,
    objective,
    tasks: normalizedTasks.map((task, index) => ({
      ordinal: index + 1,
      action: task.action,
      productPath: task.productPath,
      suggestedTokenCeiling: task.suggestedTokenCeiling,
    })),
  };
  const planId = sha256(planMaterial);
  const cells: AuguryGoalCell[] = normalizedTasks.map((task, index) => {
    const ordinal = index + 1;
    const cellId = `cell-${ordinal}-${sha256({ ordinal, action: task.action, productPath: task.productPath })}`;
    return {
      id: cellId,
      ordinal,
      action: task.action,
      productAllowlist: [task.productPath],
      requestedModel: "gpt-5.6-luna",
      requestedReasoning: "max",
      actualIdentity: "unreported",
      suggestedTokenCeiling: task.suggestedTokenCeiling,
      readiness: ordinal === 1 ? "READY" : "LOCKED",
      terminalRequirement: "ONE_TERMINAL_PACKET",
      automaticRetries: 0,
      descendants: false,
      continuation: false,
      replay: false,
      fallback: false,
      metrics: {
        attempts: 0,
        tokens: 0,
        elapsed: 0,
        protectedEffects: 0,
        outsideScopeChanges: 0,
        terminalState: "PENDING",
      },
    };
  });

  return { schema: SCHEMA, planId, objective, cells };
}
