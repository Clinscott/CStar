import fs from 'node:fs';
import path from 'node:path';

export interface StrictSemver {
    raw: string;
    major: bigint;
    minor: bigint;
    patch: bigint;
    prerelease: string[];
}

function parseIdentifiers(value: string, label: string, allowNumericLeadingZero: boolean): string[] {
    const identifiers = value.split('.');
    if (
        identifiers.length === 0
        || identifiers.some((identifier) => !identifier || !/^[0-9A-Za-z-]+$/.test(identifier))
        || (!allowNumericLeadingZero && identifiers.some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0')))
    ) {
        throw new Error(`Invalid strict SemVer ${label}: ${value}`);
    }
    return identifiers;
}

/** Parse a strict SemVer 2.0.0 value without accepting paths, whitespace, or loose versions. */
export function parseStrictSemver(value: unknown, label = 'version'): StrictSemver {
    if (typeof value !== 'string' || !value || value !== value.trim()) {
        throw new Error(`Invalid strict SemVer ${label}: ${String(value)}`);
    }

    const plusParts = value.split('+');
    if (plusParts.length > 2) {
        throw new Error(`Invalid strict SemVer ${label}: ${value}`);
    }
    if (plusParts[1] !== undefined) {
        parseIdentifiers(plusParts[1], label, true);
    }

    const coreAndPrerelease = plusParts[0]!;
    const dashIndex = coreAndPrerelease.indexOf('-');
    const core = dashIndex >= 0 ? coreAndPrerelease.slice(0, dashIndex) : coreAndPrerelease;
    const prereleaseText = dashIndex >= 0 ? coreAndPrerelease.slice(dashIndex + 1) : undefined;
    const coreParts = core.split('.');
    if (
        coreParts.length !== 3
        || coreParts.some((part) => !/^(?:0|[1-9]\d*)$/.test(part))
    ) {
        throw new Error(`Invalid strict SemVer ${label}: ${value}`);
    }

    const prerelease = prereleaseText === undefined
        ? []
        : parseIdentifiers(prereleaseText, label, false);

    return {
        raw: value,
        major: BigInt(coreParts[0]!),
        minor: BigInt(coreParts[1]!),
        patch: BigInt(coreParts[2]!),
        prerelease,
    };
}

/** Compare strict SemVer precedence. Build metadata intentionally does not affect precedence. */
export function compareStrictSemver(leftValue: string, rightValue: string): number {
    const left = parseStrictSemver(leftValue, 'version');
    const right = parseStrictSemver(rightValue, 'version');
    for (const key of ['major', 'minor', 'patch'] as const) {
        if (left[key] < right[key]) return -1;
        if (left[key] > right[key]) return 1;
    }

    if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
    if (left.prerelease.length === 0) return 1;
    if (right.prerelease.length === 0) return -1;

    const length = Math.max(left.prerelease.length, right.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        const leftPart = left.prerelease[index];
        const rightPart = right.prerelease[index];
        if (leftPart === undefined) return -1;
        if (rightPart === undefined) return 1;
        if (leftPart === rightPart) continue;
        const leftNumeric = /^\d+$/.test(leftPart);
        const rightNumeric = /^\d+$/.test(rightPart);
        if (leftNumeric && rightNumeric) {
            return BigInt(leftPart) < BigInt(rightPart) ? -1 : 1;
        }
        if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
        return leftPart < rightPart ? -1 : 1;
    }
    return 0;
}

export function resolveCanonicalDirectory(root: string, label: string): string {
    const resolved = path.resolve(root);
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
        throw new Error(`${label} is not a directory: ${resolved}`);
    }
    return fs.realpathSync(resolved);
}

function relativeContainedPath(root: string, target: string, label: string): string {
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`${label} escapes managed root: ${target}`);
    }
    return relative;
}

function lstatIfPresent(target: string): fs.Stats | undefined {
    try {
        return fs.lstatSync(target);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

/**
 * Fail closed when an existing path component below root is a symlink.
 * Missing descendants are safe because a later mkdir/write cannot traverse a
 * symlink that did not exist during this synchronous preflight.
 */
export function assertManagedPathSafe(root: string, target: string, label: string): void {
    const canonicalRoot = fs.realpathSync(path.resolve(root));
    const resolvedTarget = path.resolve(target);
    const relative = relativeContainedPath(canonicalRoot, resolvedTarget, label);
    if (!relative) return;

    let current = canonicalRoot;
    const parts = relative.split(path.sep);
    for (let index = 0; index < parts.length; index += 1) {
        current = path.join(current, parts[index]!);
        const stat = lstatIfPresent(current);
        if (!stat) return;
        if (stat.isSymbolicLink()) {
            throw new Error(`${label} contains a symbolic-link path component: ${current}`);
        }
        if (index < parts.length - 1 && !stat.isDirectory()) {
            throw new Error(`${label} has a non-directory ancestor: ${current}`);
        }
    }
}

/** Reject symlinks and special files anywhere in a managed tree. */
export function assertRegularTree(root: string, label: string): void {
    const rootStat = lstatIfPresent(root);
    if (!rootStat) return;
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new Error(`${label} must be a real directory: ${root}`);
    }
    const visit = (current: string): void => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolutePath = path.join(current, entry.name);
            if (entry.isSymbolicLink()) {
                throw new Error(`${label} contains a symbolic link: ${absolutePath}`);
            }
            if (entry.isDirectory()) {
                visit(absolutePath);
            } else if (!entry.isFile()) {
                throw new Error(`${label} contains an unsupported filesystem entry: ${absolutePath}`);
            }
        }
    };
    visit(root);
}

export function listRegularFiles(root: string, current = root): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolutePath = path.join(current, entry.name);
        if (entry.isSymbolicLink()) {
            throw new Error(`Managed tree contains a symbolic link: ${absolutePath}`);
        }
        if (entry.isDirectory()) {
            files.push(...listRegularFiles(root, absolutePath));
        } else if (entry.isFile()) {
            files.push(path.relative(root, absolutePath).split(path.sep).join('/'));
        } else {
            throw new Error(`Managed tree contains an unsupported filesystem entry: ${absolutePath}`);
        }
    }
    return files.sort((left, right) => left.localeCompare(right));
}

/** Preserve and surface incomplete transaction state instead of building over it. */
export function assertNoRecoveryArtifacts(parent: string, prefixes: string[], label: string): void {
    const stat = lstatIfPresent(parent);
    if (!stat) return;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`${label} recovery parent must be a real directory: ${parent}`);
    }
    const artifacts = fs.readdirSync(parent)
        .filter((entry) => prefixes.some((prefix) => entry.startsWith(prefix)))
        .sort((left, right) => left.localeCompare(right));
    if (artifacts.length > 0) {
        throw new Error(
            `Unresolved ${label} recovery artifacts require operator review: ${artifacts.map((entry) => path.join(parent, entry)).join(', ')}`,
        );
    }
}
