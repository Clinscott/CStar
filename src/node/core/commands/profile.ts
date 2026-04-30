import { Command } from 'commander';
import chalk from 'chalk';

import { getDb } from '../../../tools/pennyone/intel/database.js';
import {
    buildProfileDigest,
    ensureCorvusStarSchema,
    getProfile,
    getProfileByEmail,
    listSecretServices,
    upsertProfile,
    setPreference,
} from '../../../tools/pennyone/profile.js';
import { deleteSecret, storeSecret } from '../../../tools/pennyone/secrets.js';

interface ActiveIdentity {
    provider: string;
    sub: string;
}

function resolveActiveIdentity(): ActiveIdentity | null {
    const db = getDb();
    ensureCorvusStarSchema(db);
    const email = process.env.CORVUS_STAR_ACTIVE_EMAIL;
    if (email) {
        const byEmail = getProfileByEmail(db, email);
        if (byEmail) {
            return { provider: byEmail.oauth_provider, sub: byEmail.oauth_sub };
        }
    }
    const row = db
        .prepare('SELECT oauth_provider, oauth_sub FROM cs_profiles ORDER BY updated_at DESC LIMIT 1')
        .get() as { oauth_provider: string; oauth_sub: string } | undefined;
    return row ? { provider: row.oauth_provider, sub: row.oauth_sub } : null;
}

async function readLine(prompt: string): Promise<string> {
    process.stdout.write(prompt);
    return new Promise((resolve, reject) => {
        let buf = '';
        const stdin = process.stdin;
        stdin.resume();
        stdin.setEncoding('utf8');
        const onData = (chunk: string) => {
            buf += chunk;
            const nl = buf.indexOf('\n');
            if (nl !== -1) {
                stdin.pause();
                stdin.removeListener('data', onData);
                stdin.removeListener('error', onError);
                resolve(buf.slice(0, nl).replace(/\r$/, ''));
            }
        };
        const onError = (err: Error) => {
            stdin.removeListener('data', onData);
            reject(err);
        };
        stdin.on('data', onData);
        stdin.on('error', onError);
    });
}

async function readSecret(prompt: string): Promise<string> {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
        return new Promise((resolve, reject) => {
            let buf = '';
            stdin.setEncoding('utf8');
            stdin.on('data', (chunk) => { buf += chunk; });
            stdin.on('end', () => resolve(buf.trim()));
            stdin.on('error', reject);
        });
    }
    process.stdout.write(prompt);
    return new Promise((resolve, reject) => {
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let secret = '';
        const cleanup = () => {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
        };
        const onData = (ch: string) => {
            switch (ch) {
                case '\n':
                case '\r':
                case '\u0004':
                    cleanup();
                    process.stdout.write('\n');
                    resolve(secret);
                    return;
                case '\u0003':
                    cleanup();
                    process.stdout.write('\n');
                    reject(new Error('Cancelled'));
                    return;
                case '\u007f':
                case '\b':
                    if (secret.length > 0) {
                        secret = secret.slice(0, -1);
                    }
                    return;
                default:
                    secret += ch;
            }
        };
        stdin.on('data', onData);
    });
}

export function registerProfileCommand(program: Command): void {
    const profile = program
        .command('profile')
        .description('Manage CStar user profile and service credentials (OS keyring).');

    profile
        .command('init')
        .description('Create a new CStar profile anchored to a Claude OAuth identity.')
        .option('--provider <id>', 'OAuth provider id', 'claude')
        .option('--sub <id>', 'OAuth subject id (required)')
        .option('--email <email>', 'User email')
        .option('--name <name>', 'Display name')
        .option('--persona <p>', 'ODIN or ALFRED', 'ALFRED')
        .action(async (opts: { provider: string; sub?: string; email?: string; name?: string; persona: string }) => {
            const db = getDb();
            ensureCorvusStarSchema(db);
            const sub = opts.sub || (await readLine('OAuth subject id (sub): ')).trim();
            if (!sub) {
                console.error(chalk.red('Profile init requires an OAuth subject id.'));
                process.exitCode = 1;
                return;
            }
            const email = opts.email || process.env.CORVUS_STAR_ACTIVE_EMAIL || (await readLine('Email (optional): ')).trim() || undefined;
            const name = opts.name || (await readLine('Display name (optional): ')).trim() || undefined;
            const persona = opts.persona === 'ODIN' ? 'ODIN' : 'ALFRED';
            const created = upsertProfile(db, {
                oauth_provider: opts.provider,
                oauth_sub: sub,
                email,
                display_name: name,
                persona,
            });
            console.log(chalk.green(`Profile ${opts.provider}:${sub} ready. persona=${created.persona}, email=${created.email ?? '(none)'}.`));
        });

    profile
        .command('show')
        .description('Print the active profile metadata (no secrets).')
        .action(() => {
            const db = getDb();
            ensureCorvusStarSchema(db);
            const id = resolveActiveIdentity();
            if (!id) {
                console.error(chalk.yellow('No profile found. Run `./cstar profile init` first.'));
                process.exitCode = 1;
                return;
            }
            const p = getProfile(db, id.provider, id.sub);
            if (!p) {
                console.error(chalk.yellow('Profile record disappeared during lookup.'));
                process.exitCode = 1;
                return;
            }
            const services = listSecretServices(db, id.provider, id.sub);
            console.log(JSON.stringify({ ...p, connected_services: services }, null, 2));
            console.log(chalk.dim('\nDigest (SessionStart hook sees this):'));
            console.log(chalk.cyan(buildProfileDigest(p, services)));
        });

    profile
        .command('set-persona <persona>')
        .description('Update the active profile persona (ODIN or ALFRED).')
        .action((persona: string) => {
            const db = getDb();
            ensureCorvusStarSchema(db);
            const id = resolveActiveIdentity();
            if (!id) {
                console.error(chalk.yellow('No profile found. Run `./cstar profile init` first.'));
                process.exitCode = 1;
                return;
            }
            const target = persona.toUpperCase() === 'ODIN' ? 'ODIN' : 'ALFRED';
            upsertProfile(db, { oauth_provider: id.provider, oauth_sub: id.sub, persona: target });
            console.log(chalk.green(`Persona set to ${target}.`));
        });

    profile
        .command('set-preference <key> <value>')
        .description('Set a single preference key on the active profile.')
        .action((key: string, value: string) => {
            const db = getDb();
            ensureCorvusStarSchema(db);
            const id = resolveActiveIdentity();
            if (!id) {
                console.error(chalk.yellow('No profile found. Run `./cstar profile init` first.'));
                process.exitCode = 1;
                return;
            }
            setPreference(db, id.provider, id.sub, key, value);
            console.log(chalk.green(`Preference "${key}" set.`));
        });

    const secret = profile
        .command('secret')
        .description('Manage service tokens in the OS keyring. Tokens never transit agent context.');

    secret
        .command('set <service>')
        .description('Store a service token. Prompts with hidden input, or reads from stdin when piped.')
        .action(async (service: string) => {
            const db = getDb();
            ensureCorvusStarSchema(db);
            const id = resolveActiveIdentity();
            if (!id) {
                console.error(chalk.yellow('No profile found. Run `./cstar profile init` first.'));
                process.exitCode = 1;
                return;
            }
            try {
                const token = await readSecret(`Token for ${service} (hidden): `);
                if (!token) {
                    console.error(chalk.red('Empty token — nothing stored.'));
                    process.exitCode = 1;
                    return;
                }
                await storeSecret(db, { provider: id.provider, sub: id.sub, service, secret: token });
                console.log(chalk.green(`Stored token for "${service}". Value is not echoed.`));
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(chalk.red(`Failed to store secret: ${msg}`));
                process.exitCode = 1;
            }
        });

    secret
        .command('delete <service>')
        .description('Remove a stored service token from the keyring.')
        .action(async (service: string) => {
            const db = getDb();
            ensureCorvusStarSchema(db);
            const id = resolveActiveIdentity();
            if (!id) {
                console.error(chalk.yellow('No profile found.'));
                process.exitCode = 1;
                return;
            }
            try {
                const deleted = await deleteSecret(db, id.provider, id.sub, service);
                console.log(deleted ? chalk.green(`Deleted "${service}".`) : chalk.yellow(`No token existed for "${service}".`));
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(chalk.red(`Failed to delete secret: ${msg}`));
                process.exitCode = 1;
            }
        });

    secret
        .command('list')
        .description('List service names that have stored tokens. Names only — never tokens.')
        .action(() => {
            const db = getDb();
            ensureCorvusStarSchema(db);
            const id = resolveActiveIdentity();
            if (!id) {
                console.error(chalk.yellow('No profile found.'));
                process.exitCode = 1;
                return;
            }
            const services = listSecretServices(db, id.provider, id.sub);
            console.log(services.length > 0 ? services.join('\n') : chalk.dim('(no connected services)'));
        });
}
