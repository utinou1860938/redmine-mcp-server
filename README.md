# RedmineMCPサーバー

## 概要
RedmineMCPサーバーは、AIエージェントがRedmine APIを使用してRedmineプロジェクト管理ツールと連携するためのMCPサーバーです。

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.example` をコピーして `.env` を作成し、値を設定してください。

```bash
cp .env.example .env
```

```
REDMINE_BASE_URL=https://your-redmine.com
REDMINE_API_KEY=your-api-key
```

## 起動方法（YuMeeの場合）

### 開発モード（手動起動
```bash
npm run dev -- --project=yumee
```

プロジェクトは識別子（例: `yumee`）でも数値ID（例: `401`）でも指定可能です。

### 本番モード
```bash
npm run build
npm run start -- --project=yumee
```

## Claude Codeとの連携

Claude Codeから使用するには、`.mcp.json` または `~/.claude/settings.json` に設定を追加します。

### プロジェクトローカル設定（.mcp.json）
対象プロジェクトのルートに `.mcp.json` を作成：

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["tsx", "/path/to/redmine-mcp-saerver/src/server.ts", "--", "--project=yumee"],
      "cwd": "/path/to/redmine-mcp-saerver"
    }
  }
}
```

### グローバル設定（~/.claude/settings.json）
どのプロジェクトからでも使いたい場合：

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["tsx", "/path/to/redmine-mcp-saerver/src/server.ts", "--", "--project=yumee"],
      "cwd": "/path/to/redmine-mcp-saerver"
    }
  }
}
```

設定後、Claude Codeを再起動すると `list_issues` と `get_issue` ツールが使用可能になります。

## 利用可能なツール

### list_issues
Redmineのチケット一覧を取得します。

パラメータ：
- `status_id`（任意）: ステータスID（`open`, `closed`, `*` など）
- `assigned_to_id`（任意）: 担当者ID（`me` で自分）
- `limit`（任意）: 取得件数（デフォルト25、最大100）
- `offset`（任意）: オフセット

### get_issue
Redmineのチケット詳細を取得します。

パラメータ：
- `issue_id`（必須）: チケットID
- `include`（任意）: 追加情報（`children`, `attachments`, `relations`, `journals` など、カンマ区切り）

## セキュリティ

- `--project` で指定したプロジェクト以外のチケットにはアクセスできません
- 起動時にプロジェクトの存在確認を行い、存在しない場合はエラーで終了します
- 環境変数（APIキー等）は `.env` ファイルで管理し、gitにコミットしないでください