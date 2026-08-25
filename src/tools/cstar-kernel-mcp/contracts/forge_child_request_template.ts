import fs from 'node:fs';
import path from 'node:path';

import {
    hashAuguryMissionValue,
    stableAuguryMissionJson,
} from './augury_mission.js';

export const FORGE_CHILD_REQUEST_TEMPLATE_SCHEMA =
    'cstar.forge_child_request_template.v1' as const;

export type ForgeChildRequestedActions =
    | ['response_only']
    | ['response_only', 'validation_artifacts']
    | ['project_files']
    | ['project_files', 'validation_artifacts'];

export interface ForgeChildRequestMetricV1 {
    name: string;
    threshold: string;
    acceptance_rule: string | null;
    unit: string | null;
}

export interface ForgeChildPackageLockV1 {
    path: string;
    sha256: string;
}

export interface ForgeChildRequestTemplateV1 {
    schema: typeof FORGE_CHILD_REQUEST_TEMPLATE_SCHEMA;
    objective: string;
    prompt: string | null;
    system_under_test: string | null;
    authority_lane: 'green' | 'yellow' | 'red';
    required_metrics: ForgeChildRequestMetricV1[];
    artifact_expectations: string[];
    requested_actions: ForgeChildRequestedActions;
    required_output_paths: string[];
    lore_paths: string[];
    isolation_paths: string[];
    callback_expected_packet: string;
    package_locks: ForgeChildPackageLockV1[];
}

export interface ForgeChildRequestTemplateBinding {
    readonly template: ForgeChildRequestTemplateV1;
    readonly canonical_json: string;
    readonly sha256: string;
    readonly bytes: number;
}

export interface OrderedForgeChildRequestTemplateBinding {
    readonly order: number;
    readonly bead_id: string;
    readonly template: ForgeChildRequestTemplateV1;
    readonly template_sha256: string;
    readonly template_bytes: number;
}

const REFERENCE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;
const SHA256 = /^[a-f0-9]{64}$/;
const LANES = new Set(['green', 'yellow', 'red']);
const TEMPLATE_KEYS = [
    'schema', 'objective', 'prompt', 'system_under_test', 'authority_lane',
    'required_metrics', 'artifact_expectations', 'requested_actions',
    'required_output_paths', 'lore_paths', 'isolation_paths',
    'callback_expected_packet', 'package_locks',
] as const;

function fail(code: string): never {
    throw new Error(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        fail('forge_child_request_template_shape_invalid');
    }
}

function reference(value: unknown): string {
    if (typeof value !== 'string' || value !== value.trim() || !REFERENCE.test(value)) {
        fail('forge_child_request_template_string_invalid');
    }
    return value;
}

function nullableReference(value: unknown): string | null {
    return value === null ? null : reference(value);
}

function isContained(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!path.isAbsolute(relative)
        && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function exactChild(parent: string, segment: string): string | null {
    let names: string[];
    try {
        names = fs.readdirSync(parent);
    } catch {
        fail('forge_child_request_template_path_ancestor_uninspectable');
    }
    if (names.includes(segment)) return path.join(parent, segment);
    const folded = segment.toLocaleLowerCase('en-US');
    if (names.some((name) => name.toLocaleLowerCase('en-US') === folded)) {
        fail('forge_child_request_template_path_case_alias');
    }
    return null;
}

function canonicalPath(root: string, value: unknown): string {
    const supplied = reference(value);
    if (supplied.includes('\\') || path.posix.isAbsolute(supplied)) {
        fail('forge_child_request_template_path_invalid');
    }
    const segments = supplied.split('/');
    if (segments.length === 0 || segments.some(
        (segment) => !segment || segment === '.' || segment === '..',
    )) fail('forge_child_request_template_path_invalid');
    let current = root;
    for (let index = 0; index < segments.length; index += 1) {
        const child = exactChild(current, segments[index]!);
        if (!child) return supplied;
        let realChild: string;
        try {
            realChild = fs.realpathSync.native(child);
        } catch {
            fail('forge_child_request_template_path_ancestor_uninspectable');
        }
        if (!isContained(realChild, root)) {
            fail('forge_child_request_template_path_symlink_escape');
        }
        const expected = path.join(current, segments[index]!);
        if (realChild !== expected) {
            fail('forge_child_request_template_path_noncanonical');
        }
        if (index < segments.length - 1) {
            let stat: fs.Stats;
            try {
                stat = fs.statSync(realChild);
            } catch {
                fail('forge_child_request_template_path_ancestor_uninspectable');
            }
            if (!stat.isDirectory()) {
                fail('forge_child_request_template_path_ancestor_not_directory');
            }
        }
        current = realChild;
    }
    return supplied;
}

function canonicalPaths(
    root: string,
    value: unknown,
    minimum: number,
    maximum: number,
): string[] {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
        fail('forge_child_request_template_path_count_invalid');
    }
    const result = value.map((entry) => canonicalPath(root, entry));
    const folded = result.map((entry) => entry.toLocaleLowerCase('en-US'));
    if (new Set(folded).size !== folded.length) {
        fail('forge_child_request_template_path_duplicate');
    }
    return result;
}

function strings(value: unknown, minimum: number, maximum: number): string[] {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
        fail('forge_child_request_template_list_count_invalid');
    }
    const result = value.map(reference);
    if (new Set(result).size !== result.length) {
        fail('forge_child_request_template_list_duplicate');
    }
    return result;
}

function metrics(value: unknown): ForgeChildRequestMetricV1[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
        fail('forge_child_request_template_metrics_invalid');
    }
    return value.map((entry) => {
        if (!isRecord(entry)) fail('forge_child_request_template_metrics_invalid');
        exactKeys(entry, ['name', 'threshold', 'acceptance_rule', 'unit']);
        return {
            name: reference(entry.name),
            threshold: reference(entry.threshold),
            acceptance_rule: nullableReference(entry.acceptance_rule),
            unit: nullableReference(entry.unit),
        };
    });
}

function requestedActions(value: unknown): ForgeChildRequestedActions {
    if (!Array.isArray(value)) fail('forge_child_request_template_actions_invalid');
    const key = value.join(',');
    if (![
        'response_only',
        'response_only,validation_artifacts',
        'project_files',
        'project_files,validation_artifacts',
    ].includes(key)) fail('forge_child_request_template_actions_invalid');
    return [...value] as ForgeChildRequestedActions;
}

function packageLocks(root: string, value: unknown): ForgeChildPackageLockV1[] {
    if (!Array.isArray(value) || value.length > 64) {
        fail('forge_child_request_template_package_locks_invalid');
    }
    const result = value.map((entry) => {
        if (!isRecord(entry)) fail('forge_child_request_template_package_locks_invalid');
        exactKeys(entry, ['path', 'sha256']);
        if (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) {
            fail('forge_child_request_template_package_locks_invalid');
        }
        return { path: canonicalPath(root, entry.path), sha256: entry.sha256 };
    });
    const folded = result.map((entry) => entry.path.toLocaleLowerCase('en-US'));
    if (new Set(folded).size !== folded.length) {
        fail('forge_child_request_template_path_duplicate');
    }
    return result;
}

function assertOutputContainment(outputs: string[], targets: readonly string[]): void {
    if (outputs.some((output) => !targets.some(
        (target) => output === target || output.startsWith(`${target}/`),
    ))) fail('forge_child_request_template_output_outside_plan_targets');
}

export function canonicalForgeChildRequestTemplate(input: {
    value: unknown;
    repository_root: string;
    plan_target_paths: readonly string[];
}): ForgeChildRequestTemplateV1 {
    if (!isRecord(input.value)) fail('forge_child_request_template_shape_invalid');
    exactKeys(input.value, TEMPLATE_KEYS);
    if (input.value.schema !== FORGE_CHILD_REQUEST_TEMPLATE_SCHEMA
        || !LANES.has(String(input.value.authority_lane))) {
        fail('forge_child_request_template_shape_invalid');
    }
    const actions = requestedActions(input.value.requested_actions);
    const projectFiles = actions[0] === 'project_files';
    const outputs = canonicalPaths(
        input.repository_root, input.value.required_output_paths, projectFiles ? 1 : 0, 64,
    );
    const lore = canonicalPaths(input.repository_root, input.value.lore_paths, 1, 25);
    const isolation = canonicalPaths(
        input.repository_root, input.value.isolation_paths, 1, 25,
    );
    if (lore.some((entry) => !entry.endsWith('.feature'))) {
        fail('forge_child_request_template_lore_path_invalid');
    }
    if (isolation.some((entry) =>
        !/^tests\/.+(?:\.test\.ts|\.py)$/u.test(entry))) {
        fail('forge_child_request_template_isolation_path_invalid');
    }
    if (projectFiles) {
        const outputSet = new Set(outputs);
        if ([...lore, ...isolation].some((entry) => !outputSet.has(entry))) {
            fail('forge_child_request_template_validation_path_not_output');
        }
        assertOutputContainment(outputs, input.plan_target_paths);
    } else if (outputs.length !== 0) {
        fail('forge_child_request_template_response_output_invalid');
    }
    return {
        schema: FORGE_CHILD_REQUEST_TEMPLATE_SCHEMA,
        objective: reference(input.value.objective),
        prompt: nullableReference(input.value.prompt),
        system_under_test: nullableReference(input.value.system_under_test),
        authority_lane: input.value.authority_lane as ForgeChildRequestTemplateV1['authority_lane'],
        required_metrics: metrics(input.value.required_metrics),
        artifact_expectations: strings(input.value.artifact_expectations, 1, 64),
        requested_actions: actions,
        required_output_paths: outputs,
        lore_paths: lore,
        isolation_paths: isolation,
        callback_expected_packet: reference(input.value.callback_expected_packet),
        package_locks: packageLocks(input.repository_root, input.value.package_locks),
    };
}

export function bindForgeChildRequestTemplate(input: {
    value: unknown;
    repository_root: string;
    plan_target_paths: readonly string[];
    supplied_sha256: unknown;
    supplied_bytes: unknown;
}): ForgeChildRequestTemplateBinding {
    const template = canonicalForgeChildRequestTemplate(input);
    const canonicalJson = stableAuguryMissionJson(template);
    const sha256 = hashAuguryMissionValue(template);
    const bytes = Buffer.byteLength(canonicalJson, 'utf-8');
    if (input.supplied_sha256 !== sha256 || input.supplied_bytes !== bytes) {
        fail('forge_child_request_template_binding_mismatch');
    }
    if (stableAuguryMissionJson(input.value) !== canonicalJson) {
        fail('forge_child_request_template_noncanonical');
    }
    return Object.freeze({ template, canonical_json: canonicalJson, sha256, bytes });
}

export function hashOrderedForgeChildRequestTemplates(
    bindings: readonly OrderedForgeChildRequestTemplateBinding[],
): string {
    return hashAuguryMissionValue({
        schema: 'cstar.augury_ordered_forge_request_templates.v1',
        forge_request_template_count: bindings.length,
        bindings: bindings.map((binding) => ({
            plan_order: binding.order,
            bead_id: binding.bead_id,
            canonical_template_json: stableAuguryMissionJson(binding.template),
            forge_child_request_template_sha256: binding.template_sha256,
            forge_child_request_template_bytes: binding.template_bytes,
        })),
    });
}
