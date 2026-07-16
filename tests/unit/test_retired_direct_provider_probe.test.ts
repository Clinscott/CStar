import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const PROBE = path.join(ROOT, 'scripts', 'test_adc.js');
const ERROR = 'legacy_adc_provider_probe_retired_use_supported_host_provider_surface';

describe('retired direct ADC provider probe', () => {
    it('fails before environment, dotenv, filesystem, or provider access', () => {
        const source = fs.readFileSync(PROBE, 'utf8');
        const result = spawnSync(process.execPath, [PROBE], {
            cwd: ROOT,
            encoding: 'utf8',
            env: {
                CSTAR_SYNTHETIC_SECRET: 'must-not-be-read',
                GOOGLE_API_KEY: 'must-not-activate-provider',
            },
        });

        assert.equal(result.status, 1);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, `${ERROR}\n`);
        for (const forbidden of [
            '@google/genai',
            'dotenv',
            'process.env',
            'node:fs',
            'generateContent',
            'GOOGLE_API_KEY',
        ]) {
            assert.equal(source.includes(forbidden), false, `probe retained ${forbidden}`);
        }
    });
});
