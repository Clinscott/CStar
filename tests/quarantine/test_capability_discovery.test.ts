import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
    buildCapabilityInfoPayload,
    buildCapabilityManifestPayload,
} from '../../src/node/core/commands/capability_discovery.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

describe('Capability discovery', () => {
    it('builds a machine-readable manifest from the registry', () => {
        const payload = buildCapabilityManifestPayload(PROJECT_ROOT, ['hall', 'weave:chant', 'weave:estate-ritual']);

        const hall = payload.capabilities.find((capability) => capability.id === 'hall');
        const chant = payload.capabilities.find((capability) => capability.id === 'chant');
        const ritual = payload.capabilities.find((capability) => capability.id === 'estate-ritual');
        const oneMind = payload.capabilities.find((capability) => capability.id === 'one-mind');

        assert.ok(hall);
        assert.equal(hall?.entry_surface, 'cli');
        assert.equal(hall?.shell_command, 'cstar hall');
        assert.equal(hall?.active_in_runtime, true);
        assert.equal(hall?.invoke.source, 'inferred');

        assert.ok(chant);
        assert.equal(chant?.entry_surface, 'host-only');
        assert.equal(chant?.shell_command, null);
        assert.equal(chant?.active_in_runtime, true);
        assert.equal(chant?.invoke.source, 'unavailable');

        assert.ok(ritual);
        assert.equal(ritual?.shell_command, 'cstar ritual');
        assert.equal(ritual?.runtime_adapter_id, 'weave:estate-ritual');
        assert.equal(ritual?.active_in_runtime, true);
        assert.equal(ritual?.invoke.command_path[0], 'ritual');

        assert.ok(oneMind);
        assert.equal(oneMind?.invoke.source, 'commander');
        assert.equal(oneMind?.invoke.command_path.join(' '), 'one-mind');
        assert.equal(oneMind?.invoke.subcommands.some((subcommand) => subcommand.name === 'status' && subcommand.supports_json), true);
        assert.equal(oneMind?.invoke.subcommands.some((subcommand) => subcommand.name === 'agents' && subcommand.supports_json), true);
    });

    it('prefers weave contracts over skill shells for chant', () => {
        const payload = buildCapabilityInfoPayload(PROJECT_ROOT, 'chant', ['weave:chant']);

        assert.ok(payload);
        assert.equal(payload?.capability.entry_surface, 'host-only');
        assert.equal(payload?.documentation.kind, 'markdown');
        assert.equal(payload?.documentation.path, '.agents/weaves/chant.md');
        assert.match(payload?.documentation.content ?? '', /\*\*Invocation\*\*:\s+`weave:chant`/);
    });

    it('resolves runtime-backed entries without markdown contracts', () => {
        const payload = buildCapabilityInfoPayload(PROJECT_ROOT, 'estate-ritual', ['weave:estate-ritual']);

        assert.ok(payload);
        assert.equal(payload?.capability.shell_command, 'cstar ritual');
        assert.equal(payload?.documentation.kind, 'source');
        assert.equal(payload?.documentation.path, 'src/node/core/runtime/weaves/estate_ritual.ts');
    });

    it('resolves registry-only weave contracts through skill-info payloads', () => {
        const payload = buildCapabilityInfoPayload(PROJECT_ROOT, 'contract_hardening');

        assert.ok(payload);
        assert.equal(payload?.capability.entry_surface, 'cli');
        assert.equal(payload?.capability.shell_command, 'cstar contract_hardening');
        assert.equal(payload?.capability.invoke.source, 'inferred');
        assert.equal(payload?.documentation.path, '.agents/weaves/contract_hardening.md');
        assert.match(payload?.documentation.content ?? '', /Sterling Compliance/);
    });
});
