export const GUNGNIR_SCHEMA_VERSION = '1.0' as const;

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

function asMetric(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.round(numeric * 10000) / 10000;
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
    const gravity = asMetric(input.gravity);
    const vigil = asMetric(input.vigil);
    const evolution = asMetric(input.evolution);
    const anomaly = asMetric(input.anomaly);
    const sovereignty = asMetric(
        input.sovereignty,
        average([logic, style, intel, vigil || 0, evolution || 0]),
    );
    const aesthetic = asMetric(input.aesthetic, average([logic, style, intel]));
    const stability = asMetric(input.stability, logic);
    const coupling = asMetric(input.coupling, gravity);
    const overall = asMetric(
        input.overall,
        average([logic, style, intel, vigil, evolution, sovereignty]) - (anomaly * 0.5),
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

