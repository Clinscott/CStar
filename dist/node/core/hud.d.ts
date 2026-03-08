import { ChalkInstance } from 'chalk';
/**
 * 🔱 SovereignHUD (TypeScript Edition)
 * Purpose: Provide refined, persona-aware terminal primitives for Corvus Star.
 * Standard: Linscott Protocol ([L] > 4.0 Compliance).
 */
export declare class HUD {
    static get width(): number;
    private static isGemini;
    private static getTheme;
    static get palette(): {
        quotes: string[];
        bifrost: (str: string) => string;
        mimir: ChalkInstance | ((s: string) => string);
        crucible: ChalkInstance | ((s: string) => string);
        sterling: ChalkInstance | ((s: string) => string);
        void: ChalkInstance | ((s: string) => string);
        name: string;
        main: ChalkInstance | ((s: string) => string);
        dim: ChalkInstance | ((s: string) => string);
        accent: ChalkInstance | ((s: string) => string);
        title: string;
    };
    private static ansiWidth;
    static masterWrap(content: string): Promise<string>;
    static traceHUD(trace: {
        intent: string;
        well?: string;
        wisdom?: string;
        verdict?: string;
        confidence?: number;
    }): string;
    static boxTop(title?: string): string;
    static boxRow(label: string, value: string | number, valueColor?: Chalk): string;
    static boxNote(note?: string): string;
    static boxSeparator(): string;
    static boxBottom(): string;
    static streamText(text: string, delay?: number): Promise<void>;
    static progressBar(val: number, length?: number): string;
    static spinner(message: string, duration?: number): Promise<void>;
}
