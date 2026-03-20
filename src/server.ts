import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// どこから起動しても .env を読めるように絶対パスを指定
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const redmineBaseUrl = process.env.REDMINE_BASE_URL;
const redmineApiKey = process.env.REDMINE_API_KEY;
const projectArg = process.argv.find(arg => arg.startsWith('--project='));
const projectArgValue = projectArg?.split('=')[1];

if (!redmineBaseUrl) {
    throw new Error("REDMINE_BASE_URL環境変数が設定されていません。");
}

if (!redmineApiKey) {
    throw new Error("REDMINE_API_KEY環境変数が設定されていません。");
}

if (!projectArgValue) {
    throw new Error("プロジェクトIDを引数で指定してください。例: npm run dev -- --project=yumee");
}

// 起動時に解決されるプロジェクト情報
let resolvedProjectId: number;
let resolvedProjectIdentifier: string;

interface RedmineProject {
    id: number;
    identifier: string;
    name: string;
}

async function resolveProject(projectIdOrIdentifier: string): Promise<RedmineProject> {
    const response = await fetch(`${redmineBaseUrl}/projects/${projectIdOrIdentifier}.json`, {
        headers: {
            'X-Redmine-API-Key': redmineApiKey!,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`プロジェクト "${projectIdOrIdentifier}" が見つかりません: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as { project: RedmineProject };
    return data.project;
}

function assertProjectAllowed(projectId: number): void {
    if (projectId !== resolvedProjectId) {
        throw new Error(`プロジェクトID ${projectId} へのアクセスは許可されていません。`);
    }
}

async function redmineGet<T>(path: string): Promise<T> {
    const response = await fetch(`${redmineBaseUrl}${path}`, {
        headers: {
            'X-Redmine-API-Key': redmineApiKey!,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`Redmine API エラー: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
}

const server = new McpServer({
    name: "redmine-mcp-server",
    version: "1.0.0",
});

// チケット一覧取得
server.registerTool(
    "list_issues",
    {
        description: "Redmineのチケット一覧を取得します。",
        inputSchema: {
            status_id: z.string().optional().describe("ステータスID（open, closed, * など）"),
            assigned_to_id: z.string().optional().describe("担当者ID（me で自分）"),
            limit: z.number().optional().describe("取得件数（デフォルト25、最大100）"),
            offset: z.number().optional().describe("オフセット"),
        },
    },
    async ({ status_id, assigned_to_id, limit, offset }) => {
        const params = new URLSearchParams({ project_id: resolvedProjectIdentifier });
        if (status_id) params.append('status_id', status_id);
        if (assigned_to_id) params.append('assigned_to_id', assigned_to_id);
        if (limit) params.append('limit', String(limit));
        if (offset) params.append('offset', String(offset));

        const data = await redmineGet<{ issues: unknown[]; total_count: number }>(
            `/issues.json?${params.toString()}`
        );

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }
);

// チケット詳細取得
server.registerTool(
    "get_issue",
    {
        description: "Redmineのチケット詳細を取得します。",
        inputSchema: {
            issue_id: z.number().describe("チケットID"),
            include: z.string().optional().describe("追加情報（children, attachments, relations, journals など、カンマ区切り）"),
        },
    },
    async ({ issue_id, include }) => {
        const params = new URLSearchParams();
        if (include) params.append('include', include);

        const query = params.toString() ? `?${params.toString()}` : '';
        const data = await redmineGet<{ issue: { project: { id: number } } }>(
            `/issues/${issue_id}.json${query}`
        );

        // プロジェクトIDをチェック
        assertProjectAllowed(data.issue.project.id);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }
);

async function main() {
    // 起動時にプロジェクト情報を解決
    const project = await resolveProject(projectArgValue!);
    resolvedProjectId = project.id;
    resolvedProjectIdentifier = project.identifier;
    console.error(`プロジェクト "${project.name}" (ID: ${project.id}, identifier: ${project.identifier}) を使用します。`);

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("RedmineMcpServerが起動しました。");
}

main().catch((error) => {
    console.error("サーバーの起動中にエラーが発生しました:", error);
    process.exit(1);
});
