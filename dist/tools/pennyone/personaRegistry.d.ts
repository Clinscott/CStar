/**
 * Operation PennyOne: Configuration-Driven Persona Registry
 * Purpose: Centralize persona lore, prefixes, and identity to eliminate hardcoded strings.
 */
export interface ActivePersona {
    name: string;
    prefix: string;
    loreFile: string;
}
export declare class PersonaRegistry {
    private static instance;
    private persona;
    private constructor();
    static getInstance(): PersonaRegistry;
    /**
     * Loads the active persona from the system configuration.
     * @returns The active persona configuration.
     */
    private loadConfig;
    private hydratePersona;
    getPersona(): ActivePersona;
}
export declare const activePersona: ActivePersona;
