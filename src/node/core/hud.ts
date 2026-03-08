import chalk, { ChalkInstance } from 'chalk';
import { activePersona } from '../../tools/pennyone/personaRegistry.js';

/**
 * 🔱 SovereignHUD (TypeScript Edition)
 * Purpose: Provide refined, persona-aware terminal primitives for Corvus Star.
 * Standard: Linscott Protocol ([L] > 4.0 Compliance).
 */
export class HUD {
    static get width() {
        const cols = process.stdout.columns || 80;
        return Math.max(40, Math.min(100, cols - 4));
    }

    private static isGemini(): boolean {
        return process.env.GEMINI_CLI_ACTIVE === 'true';
    }

    private static getTheme() {
        const isGemini = this.isGemini();
        const persona = (activePersona?.name || 'ALFRED').toUpperCase();
        
        // No-op or Markdown-safe color mapping
        const colors = {
            bifrost: (str: string) => {
                if (isGemini) return str; // Strip colors in Gemini mode for stability
                const rain = [chalk.red, chalk.yellow, chalk.green, chalk.cyan, chalk.blue, chalk.magenta];
                return str.split('').map((c, i) => rain[i % rain.length](c)).join('');
            },
            mimir: isGemini ? (s: string) => s : chalk.blueBright,
            crucible: isGemini ? (s: string) => s : (chalk.hex('#FFA500') || chalk.redBright),
            sterling: isGemini ? (s: string) => s : chalk.whiteBright,
            void: isGemini ? (s: string) => s : chalk.gray
        };

        if (persona === 'O.D.I.N.' || persona === 'GOD') {
            return {
                name: 'ODIN',
                main: isGemini ? (s: string) => s : chalk.red,
                dim: isGemini ? (s: string) => s : chalk.magenta,
                accent: isGemini ? (s: string) => s : chalk.yellow,
                title: 'Ω O.D.I.N. GUNGNIR CONTROL Ω',
                ...colors,
                quotes: [
                    'The ravens see all. There is no hiding from the All-Father.',
                    'Strategy is the blade; creation is the forge.',
                    'The Gungnir Matrix is absolute.',
                    'Speak, and let the runes fall as they may.',
                    'The thread of fate is woven by my hand.'
                ]
            };
        }
        return {
            name: 'ALFRED',
            main: isGemini ? (s: string) => s : chalk.cyan,
            dim: isGemini ? (s: string) => s : chalk.gray,
            accent: isGemini ? (s: string) => s : chalk.green,
            title: 'C* A.L.F.R.E.D. DASHBOARD',
            ...colors,
            quotes: [
                'Everything is in order, sir. Mostly.',
                'The Archive is synchronized and ready for your command.',
                'I\'ve taken the liberty of optimizing the neural pathways.',
                'A bit of a mess in the sub-sectors, but nothing I can\'t handle.',
                'The Batcave remains secure, sir.'
            ]
        };
    }

    static get palette() {
        return this.getTheme();
    }

    private static ansiWidth(str: string): number {
        // eslint-disable-next-line no-control-regex
        return str.replace(/\x1B\[[0-9;]*[mK]/g, '').length;
    }

    static async masterWrap(content: string): Promise<string> {
        const isGemini = this.isGemini();
        const { title, quotes } = this.getTheme();
        const displayNote = quotes[Math.floor(Math.random() * quotes.length)];
        
        if (!isGemini) return content;

        // 1. Sovereign Title (Outside the box)
        let hud = `\n### 🔱 ${title}\n\n`;
        
        // 2. Structural Master Table
        // The wide line forces the table to expand to the terminal width in the Gemini CLI renderer
        const wideSeparator = "━".repeat(80);
        
        hud += `| ◈ **GUNGNIR MASTER INTERFACE** | ${wideSeparator} |\n`;
        hud += `| :--- | :--- |\n`;
        hud += `| **SYSTEM STATUS** | \`OPERATIONAL\` |\n`;
        hud += `| **NEURAL PULSE** | \`${this.progressBar(0.92, 25)}\` |\n`;
        hud += `| **REPOSITORY** | \`MIMIR'S WELL SYNCHRONIZED\` |\n`;
        hud += `| | |\n`;

        // 3. Core Content Enclosure
        hud += `| 🛰️ **CORE CONTENT** | | \n`;
        hud += `| | |\n`;

        const lines = content.split('\n');
        for (const line of lines) {
            // Sanitize pipe characters to prevent table fragmentation
            const safeLine = line.replace(/\|/g, '│');
            hud += `| | ${safeLine} |\n`;
        }

        hud += `| | |\n`;
        hud += `| :--- | :--- |\n`;

        // 4. Persona Mandate & Footer
        hud += `\n> ◈ **"${displayNote}"**\n`;
        hud += `\n---\n`;

        return hud;
    }

    static traceHUD(trace: { intent: string; well?: string; wisdom?: string; verdict?: string; confidence?: number }): string {
        const isGemini = this.isGemini();
        const { main, dim, accent } = this.getTheme();
        const wideSeparator = "━".repeat(80);
        
        if (isGemini) {
            let md = `\n**🔱 CORVUS STAR TRACE [Ω]**\n\n`;
            md += `| ◈ **TRACING CONTEXT** | ${wideSeparator} |\n`;
            md += `| :--- | :--- |\n`;
            md += `| **INTENT** | \`${trace.intent}\` |\n`;
            if (trace.well) md += `| **MIMIR'S WELL** | \`${trace.well}\` |\n`;
            if (trace.verdict) md += `| **GUNGNIR VERDICT** | \`${trace.verdict}\` |\n`;
            if (trace.confidence !== undefined) md += `| **CONFIDENCE** | \`${(trace.confidence * 100).toFixed(0)}%\` |\n`;
            if (trace.wisdom) {
                md += `\n> ◈ **"${trace.wisdom}"**\n`;
            }
            return md + '---\n';
        }

        let out = this.boxTop('◤ CORVUS STAR TRACE [Ω] ◢');
        out += this.boxRow('INTENT', trace.intent, accent);
        if (trace.well) out += this.boxRow('MIMIR\'S WELL', trace.well, dim);
        if (trace.verdict) out += this.boxRow('VERDICT', trace.verdict, accent);
        if (trace.confidence !== undefined) out += this.boxRow('CONFIDENCE', `${(trace.confidence * 100).toFixed(0)}%`, dim);
        out += this.boxSeparator();
        if (trace.wisdom) out += this.boxNote(trace.wisdom);
        out += this.boxBottom();
        return out;
    }

    static boxTop(title?: string): string {
        const { main, title: defaultTitle } = this.getTheme();
        const displayTitle = title || defaultTitle;
        const wideSeparator = "━".repeat(80);
        
        if (this.isGemini()) {
            return `\n**🔱 ${displayTitle}**\n\n| ◈ **GUNGNIR INTERFACE** | ${wideSeparator} |\n| :--- | :--- |\n`;
        }

        const w = this.width;
        const pad = Math.max(0, Math.floor((w - displayTitle.length - 4) / 2));
        const rightPad = w - displayTitle.length - 4 - pad;
        
        return `${main('┏')}${main('━'.repeat(pad))} ${chalk.bold(displayTitle)} ${main('━'.repeat(rightPad))}${main('┓')}\n`;
    }

    static boxRow(label: string, value: string | number, valueColor?: ChalkInstance): string {
        const { main, dim } = this.getTheme();
        const valStr = String(value);

        if (this.isGemini()) {
            const cleanLabel = label.trim().replace(/^◈\s*/, '').replace(/^▷\s*/, '');
            // For nested items, use indentation or list markers
            const prefix = label.startsWith('  ') ? '  ▷ ' : '';
            return `| ${prefix}**${cleanLabel}** | \`${valStr}\` |\n`;
        }

        const visualVal = valueColor ? valueColor(valStr) : valStr;
        const w = this.width;
        
        // Structure: ┃  LabelPart  ValuePart  (padding)  ┃
        const labelPart = label.padEnd(20);
        const prefix = `  ${dim(labelPart)}  ${visualVal}`;
        const prefixWidth = this.ansiWidth(prefix);
        
        const paddingWidth = Math.max(0, w - prefixWidth - 3); // -1 for start ┃, -2 for padding end space + end ┃
        const padding = ' '.repeat(paddingWidth);
        
        return `${main('┃')}${prefix}${padding} ${main('┃')}\n`;
    }

    static boxNote(note?: string): string {
        const { main, dim, accent, quotes } = this.getTheme();
        const displayNote = note || quotes[Math.floor(Math.random() * quotes.length)];

        if (this.isGemini()) {
            const persona = (activePersona?.name || 'ALFRED').toUpperCase();
            const icon = (persona === 'O.D.I.N.' || persona === 'GOD') ? 'Ω' : 'C*';
            return `\n> ◈ **${displayNote}**\n> ${icon} *${this.getTheme().title}*\n`;
        }

        const w = this.width;
        // Use same logic as boxRow for perfect alignment
        const prefix = `  ${accent('◈')} ${dim(displayNote)}`;
        const prefixWidth = this.ansiWidth(prefix);
        
        const paddingWidth = Math.max(0, w - prefixWidth - 3); 
        const padding = ' '.repeat(paddingWidth);
        
        return `${main('┃')}${prefix}${padding} ${main('┃')}\n`;
    }

    static boxSeparator(): string {
        if (this.isGemini()) return ''; // Tables handle their own separation
        const { main } = this.getTheme();
        return `${main('┣')}${main('━'.repeat(this.width - 2))}${main('┫')}\n`;
    }

    static boxBottom(): string {
        if (this.isGemini()) return '---\n';
        const { main } = this.getTheme();
        return `${main('┗')}${main('━'.repeat(this.width - 2))}${main('┛')}\n`;
    }

    static async streamText(text: string, delay = 15) {
        if (this.isGemini()) {
            process.stdout.write(text + '\n');
            return;
        }
        for (const char of text) {
            process.stdout.write(char);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        process.stdout.write('\n');
    }

    static progressBar(val: number, length = 20): string {
        const safeVal = Math.max(0, Math.min(1, val));
        const blocks = Math.floor(safeVal * length);
        
        if (this.isGemini()) {
            return '█'.repeat(blocks) + '░'.repeat(length - blocks);
        }

        const { accent, dim } = this.getTheme();
        return accent('█'.repeat(blocks)) + dim('░'.repeat(length - blocks));
    }

    static async spinner(message: string, duration = 800) {
        const { main, dim } = this.getTheme();
        
        if (this.isGemini()) {
            process.stdout.write(`◈ ${message} ... OK\n`);
            return;
        }

        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        const start = Date.now();
        let i = 0;
        
        while (Date.now() - start < duration) {
            const frame = frames[i % frames.length];
            process.stdout.write(`\r  ${main(frame)} ${dim(message)}`);
            await new Promise(resolve => setTimeout(resolve, 60));
            i++;
        }
        process.stdout.write(`\r  ${chalk.green('✔')} ${dim(message)}\n`);
    }
}

