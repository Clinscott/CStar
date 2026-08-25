import {
    consumeForgeCodexHostWorkerHandoff,
} from '../src/tools/pennyone/intel/forge_host_worker_consumer.js';

const VALUE_FLAGS = new Set([
    '--handoff-path',
    '--handoff-sha256',
    '--request-id',
    '--request-sha256',
    '--execution-receipt-id',
    '--attempt-id',
    '--scope-sha256',
    '--control-root',
]);

function usage(): string {
    return [
        'Usage:',
        '  npm run consume:forge-host-handoff -- --handoff-path PATH',
        '    --handoff-sha256 SHA256 --request-id ID --request-sha256 SHA256',
        '    --execution-receipt-id ID --attempt-id ID --scope-sha256 SHA256',
        '    [--control-root PATH]',
        '',
        'The command only reads and validates the returned CStar handoff. It does',
        'not launch cognition, call a provider, mutate CStar, consume a ticket, or',
        'delete/quarantine the handoff.',
    ].join('\n');
}

function parseFlags(argv: string[]): Record<string, string> {
    const values: Record<string, string> = {};
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--help') {
            values.help = 'true';
            continue;
        }
        if (!argument?.startsWith('--')) throw new Error('forge_codex_host_consumer_binding_invalid');
        const equals = argument.indexOf('=');
        const name = equals === -1 ? argument : argument.slice(0, equals);
        if (!VALUE_FLAGS.has(name) || values[name]) {
            throw new Error('forge_codex_host_consumer_binding_invalid');
        }
        const value = equals === -1 ? argv[++index] : argument.slice(equals + 1);
        if (!value || value.startsWith('--')) throw new Error('forge_codex_host_consumer_binding_missing');
        values[name] = value;
    }
    return values;
}

function required(values: Record<string, string>, name: string): string {
    const value = values[name];
    if (!value) throw new Error('forge_codex_host_consumer_binding_missing');
    return value;
}

function main(): void {
    try {
        const flags = parseFlags(process.argv.slice(2));
        if (flags.help) {
            process.stdout.write(`${usage()}\n`);
            return;
        }
        const result = consumeForgeCodexHostWorkerHandoff({
            handoffPath: required(flags, '--handoff-path'),
            expectedHandoffSha256: required(flags, '--handoff-sha256'),
            expectedRequestId: required(flags, '--request-id'),
            expectedRequestSha256: required(flags, '--request-sha256'),
            expectedExecutionReceiptId: required(flags, '--execution-receipt-id'),
            expectedAttemptId: required(flags, '--attempt-id'),
            expectedScopeSha256: required(flags, '--scope-sha256'),
            ...(flags['--control-root'] ? { controlRoot: flags['--control-root'] } : {}),
        });
        process.stdout.write(`${JSON.stringify({
            status: result.receipt.status,
            receipt: result.receipt,
            worker_job: result.job,
        }, null, 2)}\n`);
    } catch (error) {
        const errorCode = error instanceof Error && /^forge_[a-z0-9_]+$/.test(error.message)
            ? error.message
            : 'forge_codex_host_consumer_blocked';
        process.stdout.write(`${JSON.stringify({
            status: 'blocked',
            error_code: errorCode,
            executable_job: null,
        })}\n`);
        process.exitCode = 1;
    }
}

main();

