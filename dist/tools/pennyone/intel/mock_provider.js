import path from 'node:path';
/**
 * Mock Intelligence Provider
 * Purpose: Fast-path intent generation for testing and rapid visualization.
 * Mandate: Provide plausible "Synthetic Lore" without API overhead.
 */
export class MockProvider {
    async getIntent(code, data) {
        const fileName = path.basename(data.path);
        const intent = `Synthetic Lore for ${fileName}: This module facilitates the core logic for repository intelligence and structural analysis within the Corvus Star framework.`;
        const interaction = `Interact via the standard Gungnir Spoke protocol. Consult the ${fileName} API for specific integration patterns.`;
        return { intent, interaction };
    }
    async getBatchIntent(items) {
        return Promise.all(items.map(item => this.getIntent(item.code, item.data)));
    }
}
