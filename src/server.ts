import "dotenv/config";
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const redmineBaseUrl = process.env.REDMINE_BASE_URL;
const redmineApiKey = process.env.REDMINE_API_KEY;

if (!redmineBaseUrl) {
    throw new Error("REDMINE_BASE_URL環境変数が設定されていません。");
}

if (!redmineApiKey) {
    throw new Error("REDMINE_API_KEY環境変数が設定されていません。");
}

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
