import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    bindForgeChildRequestTemplate,
    canonicalForgeChildRequestTemplate,
} from '../../../src/tools/cstar-kernel-mcp/contracts/forge_child_request_template.js';
import {
    cleanupV2Roots,
    cloneV2,
    createV2Root,
    responseOnlyTemplate,
    templateBinding,
} from './augury_mission_v2_test_support.js';

const outsideRoots: string[] = [];

afterEach(() => {
    cleanupV2Roots();
    while (outsideRoots.length > 0) {
        fs.rmSync(outsideRoots.pop()!, { recursive: true, force: true });
    }
});

function canonical(root: string, value: unknown, targets = ['work/source.ts']) {
    return canonicalForgeChildRequestTemplate({
        value,
        repository_root: root,
        plan_target_paths: targets,
    });
}

function projectTemplate() {
    return responseOnlyTemplate({
        requested_actions: ['project_files', 'validation_artifacts'],
        required_output_paths: [
            'src/output.ts',
            'tests/features/mission.feature',
            'tests/unit/mission.test.ts',
        ],
    });
}

describe('ForgeChildRequestTemplateV1 strict contract', () => {
    it('accepts only the exact canonical field set and exact metric objects', () => {
        const root = createV2Root();
        const result = canonical(root, responseOnlyTemplate());
        assert.equal(result.schema, 'cstar.forge_child_request_template.v1');
        assert.deepEqual(result.requested_actions, [
            'response_only', 'validation_artifacts',
        ]);

        const injected = cloneV2(responseOnlyTemplate()) as Record<string, unknown>;
        injected.spend_policy = { mode: 'live_authorized' };
        assert.throws(() => canonical(root, injected),
            /forge_child_request_template_shape_invalid/);

        const metric = cloneV2(responseOnlyTemplate()) as any;
        delete metric.required_metrics[0].unit;
        assert.throws(() => canonical(root, metric),
            /forge_child_request_template_shape_invalid/);
        const derived = cloneV2(responseOnlyTemplate()) as any;
        derived.request_id = 'request:forged';
        assert.throws(() => canonical(root, derived),
            /forge_child_request_template_shape_invalid/);
    });

    it('enforces trimmed bounded strings, controls, nullability, and list bounds', () => {
        const root = createV2Root();
        for (const objective of ['', ' padded', `bad\u0000value`, 'x'.repeat(1025)]) {
            const value = responseOnlyTemplate({ objective });
            assert.throws(() => canonical(root, value),
                /forge_child_request_template_string_invalid/);
        }
        assert.equal(canonical(root, responseOnlyTemplate({
            prompt: null, system_under_test: null,
        })).prompt, null);

        const cases = [
            responseOnlyTemplate({ required_metrics: [] }),
            responseOnlyTemplate({
                required_metrics: Array.from({ length: 65 }, (_, index) => ({
                    name: `metric-${index}`,
                    threshold: 'pass',
                    acceptance_rule: null,
                    unit: null,
                })),
            }),
            responseOnlyTemplate({ artifact_expectations: [] }),
            responseOnlyTemplate({
                artifact_expectations: Array.from({ length: 65 }, (_, index) => `a-${index}`),
            }),
            responseOnlyTemplate({ lore_paths: [] }),
            responseOnlyTemplate({
                lore_paths: Array.from({ length: 26 }, (_, index) =>
                    `tests/features/${index}.feature`),
            }),
            responseOnlyTemplate({ isolation_paths: [] }),
            responseOnlyTemplate({
                isolation_paths: Array.from({ length: 26 }, (_, index) =>
                    `tests/unit/${index}.test.ts`),
            }),
            responseOnlyTemplate({
                package_locks: Array.from({ length: 65 }, (_, index) => ({
                    path: `locks/${index}.lock`, sha256: 'a'.repeat(64),
                })),
            }),
        ];
        cases.forEach((value) => assert.throws(() => canonical(root, value)));
    });

    it('accepts only the four ordered requested-action tuples', () => {
        const root = createV2Root();
        for (const actions of [
            ['response_only'],
            ['response_only', 'validation_artifacts'],
            ['project_files'],
            ['project_files', 'validation_artifacts'],
        ]) {
            const value = actions[0] === 'project_files'
                ? projectTemplate() : responseOnlyTemplate();
            value.requested_actions = actions as never;
            assert.doesNotThrow(() => canonical(
                root, value, actions[0] === 'project_files' ? ['src', 'tests'] : undefined,
            ));
        }
        for (const actions of [
            ['validation_artifacts', 'response_only'],
            ['validation_artifacts', 'project_files'],
            ['project_files', 'response_only'],
            ['response_only', 'project_files'],
        ]) {
            assert.throws(() => canonical(
                root,
                responseOnlyTemplate({ requested_actions: actions as never }),
            ), /forge_child_request_template_actions_invalid/);
        }
    });

    it('enforces output containment and Lore/Isolation suffix and subset rules', () => {
        const root = createV2Root();
        assert.doesNotThrow(() => canonical(root, projectTemplate(), ['src', 'tests']));

        const outside = projectTemplate();
        outside.required_output_paths[0] = 'other/output.ts';
        assert.throws(() => canonical(root, outside, ['src', 'tests']),
            /output_outside_plan_targets/);

        const missingLore = projectTemplate();
        missingLore.required_output_paths =
            missingLore.required_output_paths.filter((entry) => !entry.endsWith('.feature'));
        assert.throws(() => canonical(root, missingLore, ['src', 'tests']),
            /validation_path_not_output/);

        const badLore = projectTemplate();
        badLore.lore_paths = ['tests/features/mission.md'];
        badLore.required_output_paths[1] = 'tests/features/mission.md';
        assert.throws(() => canonical(root, badLore, ['src', 'tests']),
            /lore_path_invalid/);

        const badIsolation = projectTemplate();
        badIsolation.isolation_paths = ['src/mission.test.ts'];
        badIsolation.required_output_paths[2] = 'src/mission.test.ts';
        assert.throws(() => canonical(root, badIsolation, ['src', 'tests']),
            /isolation_path_invalid/);

        assert.throws(() => canonical(root, responseOnlyTemplate({
            required_output_paths: ['work/source.ts'],
        })), /response_output_invalid/);
    });

    it('rejects absolute, backslash, dot, dotdot, root, duplicate, and case-alias paths', () => {
        const root = createV2Root();
        for (const bad of [
            '/tmp/outside', 'work\\source.ts', '.', './work', 'work/../outside',
            'work//source.ts', 'work/source.ts/', `tests/${'x'.repeat(1025)}.feature`,
            'tests/features/bad\u0000.feature',
        ]) {
            assert.throws(() => canonical(root, responseOnlyTemplate({
                lore_paths: [bad],
            })));
        }
        assert.throws(() => canonical(root, responseOnlyTemplate({
            lore_paths: ['tests/features/A.feature', 'tests/features/a.feature'],
        })), /path_duplicate/);

        fs.mkdirSync(path.join(root, 'Exact'), { recursive: true });
        assert.throws(() => canonical(root, responseOnlyTemplate({
            lore_paths: ['exact/mission.feature'],
        })), /path_case_alias/);
    });

    it('rejects symlink escape and noncanonical in-root symlink aliases', () => {
        const root = createV2Root();
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-template-outside-'));
        outsideRoots.push(outside);
        fs.writeFileSync(path.join(outside, 'escape.feature'), 'outside\n');
        fs.symlinkSync(outside, path.join(root, 'outside-link'), 'dir');
        assert.throws(() => canonical(root, responseOnlyTemplate({
            lore_paths: ['outside-link/escape.feature'],
        })), /path_symlink_escape/);

        fs.symlinkSync(path.join(root, 'tests', 'features'),
            path.join(root, 'inside-link'), 'dir');
        assert.throws(() => canonical(root, responseOnlyTemplate({
            lore_paths: ['inside-link/mission.feature'],
        })), /path_noncanonical/);
    });

    it('requires lowercase package hashes, unique canonical paths, and exact derived binding', () => {
        const root = createV2Root();
        assert.throws(() => canonical(root, responseOnlyTemplate({
            package_locks: [{ path: 'package-lock.json', sha256: 'A'.repeat(64) }],
        })), /package_locks_invalid/);
        assert.throws(() => canonical(root, responseOnlyTemplate({
            package_locks: [
                { path: 'locks/A.lock', sha256: 'a'.repeat(64) },
                { path: 'locks/a.lock', sha256: 'b'.repeat(64) },
            ],
        })), /path_duplicate/);

        const template = responseOnlyTemplate();
        const binding = templateBinding(template);
        assert.doesNotThrow(() => bindForgeChildRequestTemplate({
            value: template,
            repository_root: root,
            plan_target_paths: ['work/source.ts'],
            supplied_sha256: binding.forge_child_request_template_sha256,
            supplied_bytes: binding.forge_child_request_template_bytes,
        }));
        assert.throws(() => bindForgeChildRequestTemplate({
            value: template,
            repository_root: root,
            plan_target_paths: ['work/source.ts'],
            supplied_sha256: '0'.repeat(64),
            supplied_bytes: binding.forge_child_request_template_bytes,
        }), /binding_mismatch/);
        assert.throws(() => bindForgeChildRequestTemplate({
            value: template,
            repository_root: root,
            plan_target_paths: ['work/source.ts'],
            supplied_sha256: binding.forge_child_request_template_sha256,
            supplied_bytes: binding.forge_child_request_template_bytes + 1,
        }), /binding_mismatch/);
    });
});
