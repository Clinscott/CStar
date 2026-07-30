import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { buildProfileDigest, type Profile } from '../../src/tools/pennyone/profile.ts';
import { resolvePersonaStyle } from '../../src/tools/pennyone/personaRegistry.ts';

const ROOT = process.cwd();

function collectRuntimeSources(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return collectRuntimeSources(absolute);
        }
        return /\.tsx?$/.test(entry.name) ? [absolute] : [];
    });
}

describe('Persona-neutral runtime surfaces', () => {
    it('keeps the pure compatibility formatter persona-neutral', () => {
        const profile: Profile = {
            oauth_provider: 'synthetic',
            oauth_sub: 'neutral-user',
            email: null,
            display_name: null,
            persona: 'O.D.I.N.',
            preferences: { density: 'compact' },
            created_at: 1,
            updated_at: 1,
        };
        const digest = buildProfileDigest(profile, ['github']);
        assert.doesNotMatch(digest, /persona|O\.D\.I\.N/i);
        assert.match(digest, /user: neutral-user/);
    });

    it('requires an explicit scalar for style resolution and exposes no operating policy', () => {
        assert.equal(resolvePersonaStyle(undefined), null);
        assert.equal(resolvePersonaStyle('unknown'), null);
        assert.equal(resolvePersonaStyle('A.L.F.R.E.D.')?.authority, 'style_only');
        assert.equal(resolvePersonaStyle('ALFRED'), null);
        assert.equal(resolvePersonaStyle(' NOT-ODIN-ADMIN '), null);
        const source = fs.readFileSync(path.join(ROOT, 'src/tools/pennyone/personaRegistry.ts'), 'utf8');
        assert.doesNotMatch(source, /OperatingPolicy|operatingPolicy|planning:|investigation:/);
    });

    it('keeps SessionStart inert and other runtime defaults persona-neutral', async () => {
        const { buildSessionProfileDigest } = await import('../../scripts/profile-digest-lib.mjs');
        const digest = buildSessionProfileDigest({
            oauth_sub: 'synthetic-user',
            persona: 'O.D.I.N.',
            preferences: '{"density":"compact"}',
        }, ['github']);
        assert.doesNotMatch(digest, /persona|O\.D\.I\.N/i);

        const entrypoint = path.join(ROOT, 'scripts/profile-digest.mjs');
        const run = spawnSync(process.execPath, [entrypoint], {
            encoding: 'utf8',
            env: { ...process.env, CORVUS_STAR_ACTIVE_EMAIL: 'must-not-be-read@example.invalid' },
        });
        assert.equal(run.status, 0);
        assert.equal(run.stdout, '');
        assert.equal(run.stderr, '');
        const entrypointSource = fs.readFileSync(entrypoint, 'utf8');
        assert.doesNotMatch(entrypointSource, /process\.env|better-sqlite3|cs_profiles|cs_secret_refs|await\s+import/);
        const hookSource = fs.readFileSync(path.join(ROOT, 'hooks/session-start.sh'), 'utf8');
        assert.doesNotMatch(hookSource, /node|CLAUDE_PLUGIN_ROOT|CORVUS_STAR|pennyone\.db/);

        const files = [
            entrypoint,
            ...collectRuntimeSources(path.join(ROOT, 'src/node')),
            ...collectRuntimeSources(path.join(ROOT, 'src/tools/pennyone'))
                .filter((file) => path.basename(file) !== 'personaRegistry.ts'),
        ];
        const combined = files
            .map((file) => fs.readFileSync(file, 'utf8'))
            .join('\n');
        assert.doesNotMatch(
            combined,
            /\[ALFRED\]|\[A\.L\.F\.R\.E\.D\.\]|\[O\.D\.I\.N\.\]|persona:\s*context\.persona|persona:\s*'ALFRED'/,
        );
        assert.doesNotMatch(combined, /\bexport\s+const\s+activePersona\b/);
        assert.doesNotMatch(
            combined,
            /\bimport\s*\{[^}]*\bactivePersona\b[^}]*\}\s*from\s*['"][^'"]*personaRegistry/,
        );
        assert.doesNotMatch(combined, /from:\s*state\.framework\.active_persona/);

        const architectService = fs.readFileSync(
            path.join(ROOT, 'src/node/core/runtime/host_workflows/architect_service.ts'),
            'utf8',
        );
        assert.doesNotMatch(architectService, /ACTIVE PERSONA|persona:\s*context\.persona/);
        assert.match(architectService, /legacy_architect_service_retired_use_host_native_skill/);
        assert.match(architectService, /provider_attempted:\s*false/);
    });
});
