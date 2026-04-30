import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../");

/**
 * [Ω] THE MCP BRIDGE
 * Purpose: Allows Python skills to call 'sampling' on the Host Agent.
 * No API Keys. Pure Protocol.
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === "think") {
        const prompt = args[1];
        const systemPrompt = args[2];

        // Connect to the local PennyOne MCP server
        const transport = new StdioClientTransport({
            command: "node",
            args: [path.join(PROJECT_ROOT, "bin/pennyone-mcp.js")],
        });

        const client = new Client(
            { name: "one-mind-bridge", version: "1.0.0" },
            { capabilities: { sampling: {} } }
        );

        await client.connect(transport);

        try {
            // [🔱] THE SYNAPTIC STRIKE
            // We call the 'think' tool on the server, which in turn calls 'createMessage' (Sampling)
            const result = await client.callTool({
                name: "think",
                arguments: { prompt, systemPrompt }
            });

            if (result.isError) {
                console.error(result.content[0].text);
                process.exit(1);
            }

            console.log(result.content[0].text);
        } catch (err) {
            console.error(`Bridge Error: ${err.message}`);
            process.exit(1);
        } finally {
            await client.close();
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
