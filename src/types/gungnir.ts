export const GUNGNIR_SCHEMA_VERSION = '1.0' as const;
export const GUNGNIR_SCORE_MIN = 0;
export const GUNGNIR_SCORE_MAX = 10;

export const GUNGNIR_AXIS_KEYS = [
    'logic',
    'style',
    'intel',
    'gravity',
    'vigil',
    'evolution',
    'anomaly',
    'sovereignty',
] as const;

export const GUNGNIR_PROJECTION_KEYS = [
    'overall',
    'stability',
    'coupling',
    'aesthetic',
] as const;

export type GungnirAxisKey = (typeof GUNGNIR_AXIS_KEYS)[number];
export type GungnirProjectionKey = (typeof GUNGNIR_PROJECTION_KEYS)[number];

export function isCanonicalGungnirScore(value: unknown): value is number {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value >= GUNGNIR_SCORE_MIN
        && value <= GUNGNIR_SCORE_MAX;
}

export interface GungnirMatrix {
    version: typeof GUNGNIR_SCHEMA_VERSION;
    logic: number;
    style: number;
    intel: number;
    gravity: number;
    vigil: number;
    evolution: number;
    anomaly: number;
    sovereignty: number;
    overall: number;
    stability: number;
    coupling: number;
    aesthetic: number;
}

function asMetric(value: unknown, fallback = 0, boundedScore = true): number {
    let numeric = value === null || value === undefined ? fallback : Number(value);
    if (!Number.isFinite(numeric)) {
        numeric = Number(fallback);
    }
    if (!Number.isFinite(numeric)) {
        numeric = 0;
    }
    const rounded = Math.round(numeric * 10000) / 10000;
    if (boundedScore && !isCanonicalGungnirScore(rounded)) {
        throw new RangeError(
            `Gungnir metric ${rounded} is outside canonical range `
            + `${GUNGNIR_SCORE_MIN}..${GUNGNIR_SCORE_MAX}`,
        );
    }
    if (!boundedScore && rounded < 0) {
        throw new RangeError(`Gungnir metric ${rounded} must be non-negative`);
    }
    return rounded;
}

function average(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function createGungnirMatrix(input: Partial<GungnirMatrix> = {}): GungnirMatrix {
    const logic = asMetric(input.logic);
    const style = asMetric(input.style);
    const intel = asMetric(input.intel);
    const gravity = asMetric(input.gravity, 0, false);
    const vigil = asMetric(input.vigil);
    const evolution = asMetric(input.evolution);
    const anomaly = asMetric(input.anomaly, 0, false);
    const sovereignty = asMetric(
        input.sovereignty,
        average([logic, style, intel, vigil || 0, evolution || 0]),
    );
    const aesthetic = asMetric(input.aesthetic, average([logic, style, intel]));
    const stability = asMetric(input.stability, logic);
    const coupling = asMetric(input.coupling, gravity, false);
    const overall = asMetric(
        input.overall,
        Math.max(
            GUNGNIR_SCORE_MIN,
            Math.min(
                GUNGNIR_SCORE_MAX,
                average([logic, style, intel, vigil, evolution, sovereignty])
                    - (anomaly * 0.5),
            ),
        ),
    );

    return {
        version: GUNGNIR_SCHEMA_VERSION,
        logic,
        style,
        intel,
        gravity,
        vigil,
        evolution,
        anomaly,
        sovereignty,
        overall,
        stability,
        coupling,
        aesthetic,
    };
}

export function patchGungnirMatrix(
    matrix: Partial<GungnirMatrix>,
    patch: Partial<GungnirMatrix>,
): GungnirMatrix {
    return createGungnirMatrix({
        ...matrix,
        ...patch,
    });
}

export function getGungnirOverall(matrix: Partial<GungnirMatrix> | null | undefined): number {
    return createGungnirMatrix(matrix ?? {}).overall;
}
