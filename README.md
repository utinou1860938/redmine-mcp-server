# RedmineMCPサーバー

## 概要
RedmineMCPサーバーは、AIエージェントがRedmine APIを使用してRedmineプロジェクト管理ツールと連携するためのMCPサーバーです。

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定

#### 方法A: macOS Keychain を使う（推奨）

API キーをディスクに平文で保存せず、macOS Keychain で安全に管理します。

**Step 1: REDMINE_BASE_URL を ~/.zshrc に登録**

```bash
echo 'export REDMINE_BASE_URL="https://tech-saisoncard.cloudmine.jp"' >> ~/.zshrc
source ~/.zshrc
```

**Step 2: REDMINE_API_KEY を Keychain に登録**

```bash
# 対話形式で登録（API キーがシェル履歴に残らない）
security add-generic-password -s "redmine-api-key" -a "$USER" -w
# → プロンプトが表示されたら API キーを貼り付けて Enter
```

登録確認：
```bash
security find-generic-password -s "redmine-api-key" -w
```

**Step 3: Claude Code の起動**

毎回 Keychain から API キーを取得して起動します：

```bash
REDMINE_API_KEY=$(security find-generic-password -s "redmine-api-key" -w) claude
```

便利なエイリアスを設定しておくと楽です：

```bash
# ~/.zshrc に追加
alias claude-redmine='REDMINE_API_KEY=$(security find-generic-password -s "redmine-api-key" -w) claude'
```

**Keychain の管理コマンド**

```bash
# 削除
security delete-generic-password -s "redmine-api-key"

# 再登録
security add-generic-password -s "redmine-api-key" -a "$USER" -w
```

## 起動方法（YuMeeの場合）

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

### create_issue
Redmineに新しいチケットを作成します。

パラメータ：
- `subject`（必須）: チケットの題名
- `description`（任意）: チケットの説明
- `tracker_id`（任意）: トラッカーID（1: バグ, 2: 機能, 3: サポート など）
- `status_id`（任意）: ステータスID
- `priority_id`（任意）: 優先度ID（1: 低め, 2: 通常, 3: 高め, 4: 急いで, 5: 今すぐ）
- `assigned_to_id`（任意）: 担当者ID
- `parent_issue_id`（任意）: 親チケットID
- `start_date`（任意）: 開始日（YYYY-MM-DD形式）
- `due_date`（任意）: 期日（YYYY-MM-DD形式）
- `estimated_hours`（任意）: 予定工数（時間）

### update_issue
Redmineのチケットを更新します。

パラメータ：
- `issue_id`（必須）: チケットID
- `subject`（任意）: チケットの題名
- `description`（任意）: チケットの説明
- `tracker_id`（任意）: トラッカーID
- `status_id`（任意）: ステータスID
- `priority_id`（任意）: 優先度ID
- `assigned_to_id`（任意）: 担当者ID
- `done_ratio`（任意）: 進捗率（0-100）
- `notes`（任意）: コメント（更新時のメモ）

### add_comment
Redmineのチケットにコメントを追加します。

パラメータ：
- `issue_id`（必須）: チケットID
- `notes`（必須）: コメント内容

### search_issues
Redmineのチケットをキーワードで検索します。

パラメータ：
- `query`（必須）: 検索キーワード
- `status_id`（任意）: ステータスID（`open`, `closed`, `*` など）
- `limit`（任意）: 取得件数（デフォルト25、最大100）

### list_attachments
チケットに添付されているファイル一覧を取得します。

パラメータ：
- `issue_id`（必須）: チケットID

### download_attachment
添付ファイルをダウンロードしてローカルに保存します。保存後、Claude CodeのReadツールで内容を確認できます（画像も対応）。

パラメータ：
- `issue_id`（必須）: チケットID
- `attachment_id`（必須）: 添付ファイルID（`list_attachments` で確認可能）

保存先: `/tmp/redmine-attachments/{issue_id}_{attachment_id}_{filename}`

## セキュリティ

- `--project` で指定したプロジェクト以外のチケットにはアクセスできません
- 起動時にプロジェクトの存在確認を行い、存在しない場合はエラーで終了します
- 環境変数（APIキー等）は `.env` ファイルで管理し、gitにコミットしないでください