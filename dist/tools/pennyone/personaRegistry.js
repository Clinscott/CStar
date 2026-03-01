import * as fs from 'fs';
import * as path from 'path';
import { registry } from './pathRegistry.js';
export class PersonaRegistry {
    static instance;
    persona;
    constructor() {
        this.persona = this.loadConfig();
    }
    static getInstance() {
        if (!PersonaRegistry.instance) {
            PersonaRegistry.instance = new PersonaRegistry();
        }
        return PersonaRegistry.instance;
    }
    /**
     * Loads the active persona from the system configuration.
     * @returns The active persona configuration.
     */
    loadConfig() {
        try {
            const root = registry.getRoot();
            const configPath = path.join(root, '.agent', 'config.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf-8');
                const data = JSON.parse(configData);
                // Support legacy and active structures
                const personaStr = data.system?.persona || data.persona || data.Persona || 'ALFRED';
                return this.hydratePersona(personaStr);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[WARNING] Failed to load persona config: ${message}`);
        }
        return this.hydratePersona('ALFRED');
    }
    hydratePersona(name) {
        const upper = name.toUpperCase();
        if (upper === 'O.D.I.N.' || upper === 'ODIN') {
            return {
                name: 'O.D.I.N.',
                prefix: '[O.D.I.N.]',
                loreFile: 'odin.qmd'
            };
        }
        // Default to ALFRED
        return {
            name: 'A.L.F.R.E.D.',
            prefix: '[A.L.F.R.E.D.]',
            loreFile: 'alfred.qmd'
        };
    }
    getPersona() {
        return this.persona;
    }
}
export const activePersona = PersonaRegistry.getInstance().getPersona();
