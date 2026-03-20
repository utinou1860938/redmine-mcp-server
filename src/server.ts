import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
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

async function redminePost<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${redmineBaseUrl}${path}`, {
        method: 'POST',
        headers: {
            'X-Redmine-API-Key': redmineApiKey!,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Redmine API エラー: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return response.json() as Promise<T>;
}

async function redminePut(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${redmineBaseUrl}${path}`, {
        method: 'PUT',
        headers: {
            'X-Redmine-API-Key': redmineApiKey!,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Redmine API エラー: ${response.status} ${response.statusText} - ${errorText}`);
    }
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

// チケット作成
server.registerTool(
    "create_issue",
    {
        description: "Redmineに新しいチケットを作成します。",
        inputSchema: {
            subject: z.string().describe("チケットの題名"),
            description: z.string().optional().describe("チケットの説明"),
            tracker_id: z.number().optional().describe("トラッカーID（1: バグ, 2: 機能, 3: サポート など）"),
            status_id: z.number().optional().describe("ステータスID"),
            priority_id: z.number().optional().describe("優先度ID（1: 低め, 2: 通常, 3: 高め, 4: 急いで, 5: 今すぐ）"),
            assigned_to_id: z.number().optional().describe("担当者ID"),
            parent_issue_id: z.number().optional().describe("親チケットID"),
            start_date: z.string().optional().describe("開始日（YYYY-MM-DD形式）"),
            due_date: z.string().optional().describe("期日（YYYY-MM-DD形式）"),
            estimated_hours: z.number().optional().describe("予定工数（時間）"),
        },
    },
    async ({ subject, description, tracker_id, status_id, priority_id, assigned_to_id, parent_issue_id, start_date, due_date, estimated_hours }) => {
        const issue: Record<string, unknown> = {
            project_id: resolvedProjectId,
            subject,
        };
        if (description) issue.description = description;
        if (tracker_id) issue.tracker_id = tracker_id;
        if (status_id) issue.status_id = status_id;
        if (priority_id) issue.priority_id = priority_id;
        if (assigned_to_id) issue.assigned_to_id = assigned_to_id;
        if (parent_issue_id) issue.parent_issue_id = parent_issue_id;
        if (start_date) issue.start_date = start_date;
        if (due_date) issue.due_date = due_date;
        if (estimated_hours) issue.estimated_hours = estimated_hours;

        const data = await redminePost<{ issue: unknown }>('/issues.json', { issue });

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

// チケット更新
server.registerTool(
    "update_issue",
    {
        description: "Redmineのチケットを更新します。",
        inputSchema: {
            issue_id: z.number().describe("チケットID"),
            subject: z.string().optional().describe("チケットの題名"),
            description: z.string().optional().describe("チケットの説明"),
            tracker_id: z.number().optional().describe("トラッカーID"),
            status_id: z.number().optional().describe("ステータスID"),
            priority_id: z.number().optional().describe("優先度ID"),
            assigned_to_id: z.number().optional().describe("担当者ID"),
            parent_issue_id: z.number().optional().describe("親チケットID"),
            start_date: z.string().optional().describe("開始日（YYYY-MM-DD形式）"),
            due_date: z.string().optional().describe("期日（YYYY-MM-DD形式）"),
            estimated_hours: z.number().optional().describe("予定工数（時間）"),
            done_ratio: z.number().optional().describe("進捗率（0-100）"),
            notes: z.string().optional().describe("コメント（更新時のメモ）"),
        },
    },
    async ({ issue_id, subject, description, tracker_id, status_id, priority_id, assigned_to_id, parent_issue_id, start_date, due_date, estimated_hours, done_ratio, notes }) => {
        // 先にチケットを取得してプロジェクトIDをチェック
        const existing = await redmineGet<{ issue: { project: { id: number } } }>(`/issues/${issue_id}.json`);
        assertProjectAllowed(existing.issue.project.id);

        const issue: Record<string, unknown> = {};
        if (subject) issue.subject = subject;
        if (description) issue.description = description;
        if (tracker_id) issue.tracker_id = tracker_id;
        if (status_id) issue.status_id = status_id;
        if (priority_id) issue.priority_id = priority_id;
        if (assigned_to_id) issue.assigned_to_id = assigned_to_id;
        if (parent_issue_id) issue.parent_issue_id = parent_issue_id;
        if (start_date) issue.start_date = start_date;
        if (due_date) issue.due_date = due_date;
        if (estimated_hours) issue.estimated_hours = estimated_hours;
        if (done_ratio !== undefined) issue.done_ratio = done_ratio;
        if (notes) issue.notes = notes;

        await redminePut(`/issues/${issue_id}.json`, { issue });

        return {
            content: [
                {
                    type: "text",
                    text: `チケット #${issue_id} を更新しました。`,
                },
            ],
        };
    }
);

// コメント追加
server.registerTool(
    "add_comment",
    {
        description: "Redmineのチケットにコメントを追加します。",
        inputSchema: {
            issue_id: z.number().describe("チケットID"),
            notes: z.string().describe("コメント内容"),
        },
    },
    async ({ issue_id, notes }) => {
        // 先にチケットを取得してプロジェクトIDをチェック
        const existing = await redmineGet<{ issue: { project: { id: number } } }>(`/issues/${issue_id}.json`);
        assertProjectAllowed(existing.issue.project.id);

        await redminePut(`/issues/${issue_id}.json`, { issue: { notes } });

        return {
            content: [
                {
                    type: "text",
                    text: `チケット #${issue_id} にコメントを追加しました。`,
                },
            ],
        };
    }
);

// チケット検索
server.registerTool(
    "search_issues",
    {
        description: "Redmineのチケットをキーワードで検索します。",
        inputSchema: {
            query: z.string().describe("検索キーワード"),
            status_id: z.string().optional().describe("ステータスID（open, closed, * など）"),
            limit: z.number().optional().describe("取得件数（デフォルト25、最大100）"),
        },
    },
    async ({ query, status_id, limit }) => {
        const params = new URLSearchParams({
            project_id: resolvedProjectIdentifier,
            subject: `~${query}`,
        });
        if (status_id) params.append('status_id', status_id);
        if (limit) params.append('limit', String(limit));

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

// 添付ファイル一覧取得
server.registerTool(
    "list_attachments",
    {
        description: "Redmineのチケットに添付されているファイル一覧を取得します。",
        inputSchema: {
            issue_id: z.number().describe("チケットID"),
        },
    },
    async ({ issue_id }) => {
        const data = await redmineGet<{ issue: { project: { id: number }; attachments: unknown[] } }>(
            `/issues/${issue_id}.json?include=attachments`
        );

        assertProjectAllowed(data.issue.project.id);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data.issue.attachments, null, 2),
                },
            ],
        };
    }
);

// 添付ファイルダウンロード
server.registerTool(
    "download_attachment",
    {
        description: "Redmineのチケットから添付ファイルをダウンロードしてローカルに保存します。保存先パスを返すので、Readツールで内容を確認できます。",
        inputSchema: {
            issue_id: z.number().describe("チケットID"),
            attachment_id: z.number().describe("添付ファイルID（list_attachmentsで確認可能）"),
        },
    },
    async ({ issue_id, attachment_id }) => {
        // チケット情報を取得してプロジェクトIDと添付ファイル情報を確認
        const issueData = await redmineGet<{
            issue: {
                project: { id: number };
                attachments: Array<{
                    id: number;
                    filename: string;
                    content_url: string;
                }>;
            };
        }>(`/issues/${issue_id}.json?include=attachments`);

        assertProjectAllowed(issueData.issue.project.id);

        const attachment = issueData.issue.attachments.find(a => a.id === attachment_id);
        if (!attachment) {
            throw new Error(`添付ファイルID ${attachment_id} が見つかりません。`);
        }

        // ファイルをダウンロード
        const response = await fetch(attachment.content_url, {
            headers: {
                'X-Redmine-API-Key': redmineApiKey!,
            },
        });
        if (!response.ok) {
            throw new Error(`ファイルのダウンロードに失敗しました: ${response.status} ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // 保存先ディレクトリを作成
        const downloadDir = join(tmpdir(), 'redmine-attachments');
        await mkdir(downloadDir, { recursive: true });

        // ファイルを保存（チケットIDと添付ファイルIDをプレフィックスに付けて重複を防ぐ）
        const filename = `${issue_id}_${attachment_id}_${attachment.filename}`;
        const filePath = join(downloadDir, filename);
        await writeFile(filePath, buffer);

        return {
            content: [
                {
                    type: "text",
                    text: `ファイルを保存しました: ${filePath}\n\nReadツールでこのパスを指定して内容を確認できます。`,
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
