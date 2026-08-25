import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const POLICY_PATHS = [
    'docs/architecture/cos-pmt-thread-architecture.md',
    'docs/operations/cstar-goal-driven-daily-bootstrap.md',
    'docs/operations/cos-context-refresh-primer-gpt-5-6-sol.md',
    'docs/integrations/host_native_skill_contract.md',
    'AGENTS.md',
    '.agents/AGENTS.feature',
].map((relativePath) => path.join(ROOT, relativePath));

function policyText(): string {
    return POLICY_PATHS.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
}

describe('CoS delegation policy', () => {
    it('rejects CoS self-implementation and self-validation', () => {
        const policy = policyText().replace(/\s+/g, ' ');

        assert.match(policy, /CoS must not implement, research, debug, edit source/);
        assert.match(policy, /run worker tests or validation/);
        assert.match(policy, /silently take over failed worker work/);
        assert.match(policy, /independent validation/);
        assert.doesNotMatch(policy, /CoS\s+(?:implements|researches|debugs|edits source|runs worker tests|self-validates|takes over failed worker)/i);
    });

    it('rejects silent model fallback for substantive workers', () => {
        const policy = policyText();

        assert.match(policy, /gpt-5\.6-luna/);
        assert.match(policy, /reasoning(?: effort)? [`"]?max/);
        assert.match(policy, /requested_model/);
        assert.match(policy, /requested_reasoning/);
        assert.match(policy, /actual_identity/);
        assert.match(policy, /Selector absence or mismatch[\s\S]*never silently fall back/i);
        assert.doesNotMatch(policy, /selector[^.\n]*(?:falls back|fallback) to another model/i);
    });

    it('rejects treating a workthread as a kernel or provider launcher', () => {
        const policy = policyText();

        assert.match(policy, /retained\/resumable host-issued worker thread with stable lineage/);
        assert.match(policy, /CStar must not launch a workthread, agent, or provider/);
        assert.match(policy, /not a CStar kernel worker launcher or provider launcher/);
        assert.match(policy, /no runtime support is claimed unless the host exposes/i);
        assert.doesNotMatch(policy, /CStar\s+(?:may|can|should|will) launch[^.\n]*(?:workthread|provider|agent)/i);
    });

    it('rejects CoS-owned host-goal lifecycle control', () => {
        const policy = policyText();

        assert.match(policy, /CoS owns no host goal/);
        assert.match(policy, /CoS must never create, resume, update, pause, block, complete, or close a host goal/);
        assert.doesNotMatch(
            policy,
            /CoS\s+(?:creates|resumes|updates|pauses|blocks|completes|closes)\s+(?:a|the) host goal/i,
        );
    });

    it('rejects root-goal reuse and silent replacement-worker transfer', () => {
        const policy = policyText().replace(/\s+/g, ' ');

        assert.match(policy, /Recoverable correction stays in the same retained workthread and(?:\s+the)?\s+same host goal/);
        assert.match(policy, /replacement worker gets a new host goal[\s\S]*explicit bounded CStar handoff/i);
        assert.match(policy, /never (?:inherits hidden|silently inherits hidden) host-goal state/i);
        assert.doesNotMatch(policy, /replacement worker\s+(?:inherits|reuses|receives a transferred) (?:the )?implementation goal/i);
    });

    it('rejects treating host-goal status as CStar lifecycle authority', () => {
        const policy = policyText().replace(/\s+/g, ' ');

        assert.match(policy, /host-goal status is worker-local evidence(?:,| and) never CStar lifecycle authority/i);
        assert.doesNotMatch(policy, /host-goal status\s+(?:is|becomes|determines)\s+CStar lifecycle authority/i);
    });

    it('rejects validator reuse of the implementation goal', () => {
        const policy = policyText().replace(/\s+/g, ' ');

        assert.match(policy, /distinct validator owns a distinct validation goal\s+and never reuses the implementation goal/i);
        assert.doesNotMatch(policy, /validator\s+(?:reuses|shares|inherits) (?:the )?implementation goal/i);
    });

    it('rejects legacy CoS-goal resurrection and generic CStar goal launchers', () => {
        const policy = policyText().replace(/\s+/g, ' ');

        assert.match(policy, /legacy CoS-held goals remain paused and historical until a supported transfer exists/i);
        assert.match(policy, /never delete, silently resume, or falsely complete/i);
        assert.match(policy, /CStar has no generic (?:host-)?goal(?: or worker-launcher| or worker launcher) surface/i);
        assert.doesNotMatch(policy, /CStar\s+(?:creates|resumes|updates|pauses|blocks|completes|closes)\s+(?:a|the) host goal/i);
    });
});
