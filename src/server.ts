import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
    name: "redmine-mcp-server",
    version: "1.0.0",
});

server.registerTool(
    "hello",
    {
        description: "Say hello",
        inputSchema: {
            name: z.string(),
        },
    },
    async ({ name }) => {
        return {
            content: [
                {
                    type: "text",
                    text: `Hello, ${name}!`
                },
            ],
        };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("RedmineMcpServerが起動しました。");
}

main().catch((error) => {
    console.error("サーバーの起動中にエラーが発生しました:", error);
    process.exit(1);
});
