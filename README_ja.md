# Redmine Report Plugin

Redmineのための構造化されたプロジェクト進捗報告書プラグインです。

## 主な機能

- **プロジェクト進捗報告書**: プロジェクトの進捗状況とステータスを可視化します。
- **AIレポート生成**: LLM（OpenAI）を使用して、報告内容を自動生成します。

## インストール

1. プラグインをRedmineの `plugins` ディレクトリにコピーします。
2. データベースのマイグレーションを実行します：
   ```bash
   bundle exec rake redmine:plugins:migrate NAME=redmine_report RAILS_ENV=production
   ```
3. Redmineを再起動します。

## 使い方

### AIレポート生成機能

AIレポート生成機能を使用するには、好みのプロバイダーに合わせて環境変数を設定してください。プラグインのルートディレクトリに `.env.local` ファイルを作成して、これらの変数をローカルに保存することもできます。

#### 共通設定
- `LLM_PROVIDER`: `openai` (デフォルト), `gemini`, または `azure`。
- `LLM_MODEL`: 使用するモデル（プロバイダーごとに異なります）。

#### OpenAI 設定
- `OPENAI_API_KEY`: OpenAIのAPIキー。
- `LLM_MODEL`: (任意) 例: `gpt-3.5-turbo` (デフォルト), `gpt-4o`。

#### Gemini 設定
- `GEMINI_API_KEY`: Google GeminiのAPIキー。
- `LLM_MODEL`: (任意) 例: `gemini-1.5-flash` (デフォルト), `gemini-1.5-pro`。

#### Azure OpenAI 設定
- `AZURE_OPENAI_API_KEY`: Azure OpenAIのAPIキー。
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAIのエンドポイント。
- `AZURE_OPENAI_DEPLOYMENT`: デプロイメント名。
- `AZURE_OPENAI_API_VERSION`: (任意) 例: `2024-02-01`。

#### 操作手順：
1. プロジェクトの「スケジュールレポート」メニューに移動します。
2. ヘッダーにある **「AIレポート生成」** ボタンをクリックします。
3. AIがプロジェクトのタスクデータを分析し、「今週の主要実績」、「来週の予定・アクション」、「課題・リスク・決定事項」セクションを自動的に生成します。

## ライセンス

GNU General Public License v2.0 (GPLv2)
