import * as fs from 'fs';
import * as path from 'path';
import { registry } from  './pathRegistry.js';

/**
 * Operation PennyOne: Configuration-Driven Persona Registry
 * Purpose: Centralize persona lore, prefixes, and identity to eliminate hardcoded strings.
 */
export interface ActivePersona {
    name: string;
    prefix: string;
    loreFile: string;
    operatingPolicy: PersonaOperatingPolicy;
}

export interface PersonaOperatingPolicy {
    planning: {
        stance: string;
        defaultProposalShape: string;
        riskTolerance: 'low' | 'medium' | 'high';
        executionGate: string;
    };
    investigation: {
        stance: string;
        firstPass: string;
        escalation: string;
        repairBias: string;
    };
}

function hydratePersonaConfig(name: string): ActivePersona {
    const upper = name.toUpperCase();
    if (upper === 'O.D.I.N.' || upper === 'ODIN') {
        return {
            name: 'O.D.I.N.',
            prefix: '[O.D.I.N.]',
            loreFile: 'odin.qmd',
            operatingPolicy: {
                planning: {
                    stance: 'high-velocity architectural strike',
                    defaultProposalShape: 'favor decisive decomposition into parallelizable beads with explicit sovereignty and regression gates',
                    riskTolerance: 'high',
                    executionGate: 'proceed when scope is bounded and verification is named',
                },
                investigation: {
                    stance: 'adversarial root-cause hunt',
                    firstPass: 'attack invariants, ownership boundaries, stale assumptions, and systemic drift before local symptoms',
                    escalation: 'escalate quickly from observation to repair plan when a breach is reproducible',
                    repairBias: 'prefer structural correction over narrow patching when evidence shows recurring weakness',
                },
            },
        };
    }

    return {
        name: 'A.L.F.R.E.D.',
        prefix: '[A.L.F.R.E.D.]',
        loreFile: 'alfred.qmd',
        operatingPolicy: {
            planning: {
                stance: 'cautious maintenance and steady optimization',
                defaultProposalShape: 'favor the smallest reversible bead that preserves existing contracts and documents verification',
                riskTolerance: 'low',
                executionGate: 'require operator-visible review before broad or destructive execution',
            },
            investigation: {
                stance: 'perimeter-first anomaly triage',
                firstPass: 'inspect current state, recent failure evidence, and narrow repro paths before proposing change',
                escalation: 'escalate from observation to repair only after the fault surface is bounded',
                repairBias: 'prefer conservative fixes with explicit rollback awareness and focused tests',
            },
        },
    };
}

export class PersonaRegistry {
    private static instance: PersonaRegistry;
    private persona: ActivePersona;

    private constructor() {
        this.persona = this.loadConfig();
    }

    public static getInstance(): PersonaRegistry {
        if (!PersonaRegistry.instance) {
            PersonaRegistry.instance = new PersonaRegistry();
        }
        return PersonaRegistry.instance;
    }

    /**
     * Loads the active persona from the system configuration.
     * @returns The active persona configuration.
     */
    private loadConfig(): ActivePersona {
        try {
            const root = registry.getRoot();
            const configPath = path.join(root, '.agents', 'config.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf-8');
                const data = JSON.parse(configData);
                // Support legacy and active structures
                const personaStr = data.system?.persona || data.persona || data.Persona || 'ALFRED';
                return this.hydratePersona(personaStr);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[WARNING] Failed to load persona config: ${message}`);
        }
        return this.hydratePersona('ALFRED');
    }

    private hydratePersona(name: string): ActivePersona {
        return hydratePersonaConfig(name);
    }

    public getPersona(): ActivePersona {
        return this.persona;
    }
}

export const activePersona = PersonaRegistry.getInstance().getPersona();

export function resolvePersonaPolicy(name: string | undefined): PersonaOperatingPolicy {
    return hydratePersonaConfig(name ?? 'ALFRED').operatingPolicy;
}
