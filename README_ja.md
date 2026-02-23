# Redmine Report Plugin

Redmine上で以下を提供するプラグインです。

- スケジュール可視化（プロジェクト/サブプロジェクト横断）
- バージョン単位の週報生成（LLM利用）
- 生成した週報のチケット保存（履歴管理）

## 1. プラグイン仕様

### 1.1 提供機能

- **スケジュール可視化とガントチャート**
  - `Schedule Report` 画面で、対象プロジェクトのチケット進捗を集計して表示
  - チケットの親子関係に基づく階層的（ツリー状）なタイムライン表示
  - タイムライン（矢印）上でのチケット開始日・期日のインライン表示とテキスト同士の重複回避
  - タスク行の高さなど、表示のカスタマイズ機能
- **チケットの高度な操作と編集**
  - **インライン編集**: チケット一覧画面から、担当者、ステータス、優先度、バージョンなどを直接編集可能（期日なしのバージョンへの割り当てもサポート）
  - **詳細パネルでの編集**: チケット詳細をパネルで確認しながら、コメント（注記）をその場で編集可能
  - **子チケットの一括登録**: 専用のダイアログから複数の子チケットを効率的に登録可能
  - 便利なUI機能: 豊富なカラムフィルタ、スクロール対応、エラー発生時のポップアップ通知など機能性を重視したインターフェース
- **LLMを活用した週報自動生成**
  - バージョン単位で週報を生成（`prepare -> generate -> save` の3段階）
  - 保存先チケットの妥当性チェック（存在/可視性/編集可否/プロジェクト一致）
  - 週報保存時に `revision` を自動採番し、同一週の追記履歴を管理

### 1.2 主要エンドポイント

- `GET /projects/:project_id/schedule_report`
- `GET /projects/:project_id/schedule_report/data`
- `POST /projects/:project_id/schedule_report/generate`
- `GET /projects/:project_id/schedule_report/weekly/versions`
- `POST /projects/:project_id/schedule_report/weekly/destination/validate`
- `POST /projects/:project_id/schedule_report/weekly/prepare`
- `POST /projects/:project_id/schedule_report/weekly/generate`
- `POST /projects/:project_id/schedule_report/weekly/save`

### 1.3 権限

- プロジェクト権限 `view_schedule_report` が必要です。

## 2. セットアップ

1. Redmine の `plugins` 配下へ配置
2. Redmine を再起動
3. 必要に応じて `.env.local` を配置（`init.rb` で読み込み）

`.env.local` の記述例:
```bash
# OpenAI の場合
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
OPENAI_API_KEY=your_api_key_here

# または Gemini の場合
# LLM_PROVIDER=gemini
# GEMINI_API_KEY=your_gemini_api_key

# または Azure OpenAI の場合
# LLM_PROVIDER=azure
# AZURE_OPENAI_API_KEY=your_azure_api_key
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
# AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

## 3. LLM 設定

### 3.1 共通

- `LLM_PROVIDER`: `openai` / `gemini` / `azure`（省略時 `openai`）
- `LLM_MODEL`: 利用モデル（未指定時は実装側デフォルト）

### 3.2 OpenAI

- `OPENAI_API_KEY`

### 3.3 Gemini

- `GEMINI_API_KEY`

### 3.4 Azure OpenAI

- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION`（任意）

## 4. 週報機能のデータ取得ルール

`weekly/prepare` と `weekly/generate` は、同じ抽出ロジックで入力データを作成します。

### 4.1 取得対象（TicketExtractor）

- 対象プロジェクト + 指定 `version_id` の Issue を母集団にする
- 抽出レイヤー A: `updated_on` が対象週内（`week_from..week_to`）
- 抽出レイヤー B: 継続リスク
- 条件: 未クローズ かつ `期限超過` または `高優先度`
- A/B を結合し重複除外後、スコア順で `top_tickets_limit` 件まで採用（上限30）

### 4.2 スコアリング

- `期限超過` +100
- `高優先度` +50
- `週内更新` +25
- `done_ratio` を加算

### 4.3 チケットごとの取得項目

- 基本: `id`, `subject`, `status`, `priority`, `due_date`, `done_ratio`
- 分類: `layer`（`A_WEEKLY_CHANGE` / `B_CONTINUOUS_RISK`）
- 週内変更差分（`journals.details`）: `status_change`, `progress_delta`, `due_date_change`, `priority_change`, `assignee_change`
- 週内コメント（`journals.notes`）: `journal_id`, `created_on`, `author`, `content`, `excerpt(先頭200文字)`

### 4.4 KPI 算出（ContextBuilder）

- `completed`: status が Closed/終了相当
- `wip`: 未クローズ件数
- `overdue`: 期限超過件数
- `high_priority_open`: 高優先度かつ未クローズ件数

## 5. LLMへ送信する情報

週報LLM（`WeeklyMarkdownGenerator`）には、主に `tickets` 配列（JSON）を渡します。各要素は以下を含みます。

- チケット識別情報（ID/タイトル）
- 状態情報（`status`, `priority`, `progress`, `due_date`）
- 変化情報（`progress_delta`, `status_change` など）
- コメント情報（週内コメント本文と抜粋）
- 分類情報（`A_WEEKLY_CHANGE` または `B_CONTINUOUS_RISK`）

補足:

- `prepare` は「送信前のプロンプト確認」に使います（プロンプト本文と抽出チケットを返す）
- `generate` は上記データをLLMへ送信し、Markdown週報を受け取ります
- LLM失敗時はサーバ側でフォールバック週報を生成します

## 6. データ取得方法（どこから・どう取るか）

- Issue本体: `Issue.where(project_id:, fixed_version_id:)`
- 可視性: `Issue.visible(User.current)` を適用
- 変更履歴: `issue.journals.details`
- コメント: `issue.journals.notes`
- 期日や進捗: Issueカラム (`due_date`, `done_ratio`, `updated_on`)
- 保存先妥当性: `DestinationValidator` で `visible?`, `editable?`, `project_id一致` を確認
- ブラウザ保存値: `localStorage` に `project_id + version_id` 単位で保存先Issue IDを保持

## 7. チケットに記述すべき内容（週報品質を上げる運用ルール）

LLMの要約品質は、週内コメントと差分の質に強く依存します。

### 7.1 コメント記述テンプレート（推奨）

- 実施内容: 何を実施したか
- 変化: 先週比で何が進んだか（%・状態変化）
- 根拠: 判断根拠（テスト結果、レビュー結果、関連チケット）
- 次アクション: 次に何をするか
- リスク: ブロッカー、依存待ち、期限影響

### 7.2 記述例（短文）

- `API認証処理を実装し、結合テスト3/5ケース合格。来週は失敗2ケースの原因切り分けを実施。`
- `外部API待ちで実装着手不可。期限に2営業日影響見込み。代替案A/Bを検討中。`

### 7.3 避けるべき記述

- 「対応中」「確認中」だけで内容がない
- 進捗率だけ更新して根拠コメントがない
- 誰が何をいつまでに行うか不明

## 8. 開発ベストプラクティス

- 契約優先: API変更時は `specs/*/contracts/*.openapi.yaml` を更新
- テスト優先: ロジック変更時は unit/integration を追加
- 責務分離: Controller は薄く、集計/検証/保存は Service に集約
- セキュリティ: APIキーをコードへ埋め込まない、機密をログ出力しない
- フォールバック設計: LLM障害時でも週報生成を継続可能にする
- 可観測性: 失敗ログは原因追跡可能な粒度で記録（ただし機密は除く）

## 9. テスト

SPA 側:

```bash
cd spa
npm test
```

Ruby 側（例）:

```bash
bundle exec ruby -Itest test/integration/weekly_report_generation_test.rb
bundle exec ruby -Itest test/integration/weekly_report_save_flow_test.rb
bundle exec ruby -Itest test/unit/weekly_report_logging_test.rb
```

## License

GNU General Public License v2.0 (GPLv2)
