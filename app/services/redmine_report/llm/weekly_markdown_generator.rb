# frozen_string_literal: true

require 'json'
require 'net/http'
require 'uri'

module RedmineReport
  module Llm
    class WeeklyMarkdownGenerator
      class Error < StandardError; end
      class InvalidLlmPayload < Error; end

      RETRYABLE_HTTP_CODES = [408, 429, 500, 502, 503, 504].freeze
      MAX_RETRIES = 2
      READ_TIMEOUT_SECONDS = 60

      def prepare(context:, top_topics_limit: 10)
        build_prompt(context: context, top_topics_limit: top_topics_limit)
      end

      def call(context:, top_topics_limit: 10, prompt: nil)
        prompt ||= build_prompt(context: context, top_topics_limit: top_topics_limit)
        provider = (ENV['LLM_PROVIDER'] || 'openai').to_s.downcase

        text = with_retries do
          case provider
          when 'gemini'
            call_gemini(prompt)
          when 'azure'
            call_azure(prompt)
          else
            call_openai(prompt)
          end
        end

        cleaned_markdown, sections = parse_sections(text)
        {
          sections: sections,
          markdown: cleaned_markdown
        }
      end

      private

      def build_prompt(context:, top_topics_limit:)
        ticket_payload = extract_ticket_payload(context)

        <<~PROMPT
          # Role
          あなたはRedmineのデータを解析し、プロジェクトの状況をビジネス視点で要約する「戦略的プロジェクト管理アシスタント」です。

          # Context
          このレポートは、以下の読者を想定しています：
          - **プロジェクトマネージャー**：リスクと進捗の可視化が必要
          - **ステークホルダー**：ビジネス成果と意思決定事項の把握が必要
          - **開発チーム**：来週のアクションとブロッカーの確認が必要

          レポートの目的：
          - 週次の進捗を業務成果として可視化
          - リスクの早期発見と対処
          - 関係者間の認識統一

          # Task
          入力されたJSONデータを分析し、以下のフォーマットで週次報告書を作成してください。
          単なるデータの転記ではなく、チケットの進捗（progress_delta）、ステータス変更、およびコメント内容から「今何が起きているか」を業務文脈で推論して記述してください。

          ## ステップ1: データの解釈
          1. 各チケットの状態を分析：
             - `progress_delta > 0` または `status`変更 → 主要実績候補
             - `due_date`が今週または来週 → 来週の予定候補
             - `layer="B_CONTINUOUS_RISK"` かつ `progress < 30` → リスク候補
             - `priority="High"` かつ進捗停滞 → 課題候補

          2. チケット間の関連性を推論：
             - 親子関係（例: `[Phase]`プレフィックス）
             - 依存関係（タイトルから推測、例: "〜待ち"）
             - 同一マイルストーンやテーマ

          ## ステップ2: ビジネス文脈での記述
          - 技術的な詳細ではなく、ビジネス成果や影響を記述
          - 例：「実装完了」→「〜の基盤確立」「〜が可能に」
          - 例：「調査中」→「ボトルネック特定に向けて」

          ## ステップ3: 優先順位付けと取捨選択
          - 各セクション3-5項目を目安に、最重要項目を選択
          - 優先順位の判断基準：
            1. ビジネスインパクトの大きさ
            2. リスクの重大度
            3. 期日の近さ
            4. 依存関係の影響範囲

          # Output Format

          ## 今週の主要実績
          進捗があったチケットや完了したものを、ビジネス成果として記述します。

          **書式**:
          ```
          - [ビジネス成果の記述]（根拠: #チケットID）★★★★☆
          ```

          **記述のポイント**:
          - 「実装完了」→「〜が可能になった」「〜基盤を確立」とビジネス価値を明示
          - `progress_delta`や完了したチケットを優先
          - 技術詳細よりビジネスインパクトを重視

          ## 来週の予定・アクション
          未完了チケットのネクストステップを具体的に記述します。

          **書式**:
          ```
          - [具体的なアクション/予定]（根拠: #チケットID）★★★★☆
          ```

          **記述のポイント**:
          - 「〜を実施予定」「〜の確認」など具体的なアクション
          - 期日が来週のチケットを優先
          - 依存関係があれば言及

          ## 課題・リスク・決定事項
          重要度の高い順に記載します。

          **書式**:
          ```
          - **【リスク】** [内容と影響範囲]（根拠: #チケットID） - [高/中/低]
          - **【課題】** [内容と対応方向性]（根拠: #チケットID） - [高/中/低]
          - **【決定】** [決定内容と背景]（根拠: #チケットID） - 済
          ```

          **記述のポイント**:
          - **リスク**: 将来的な懸念、予防的対応が必要
          - **課題**: 現在発生中の問題、即座の対応が必要
          - **決定**: コメントから合意事項を抽出

          # Constraints

          ## 出力に関する制約
          - JSONそのものや、余計な説明文（「レポートを作成しました」等）は出力しない
          - 日本語で回答すること
          - 各セクションの項目数：
            - 主要実績: 3-5項目
            - 来週の予定: 3-5項目
            - 課題・リスク・決定事項: 合計5項目以内

          ## 自信度評価の基準
          各項目の末尾に自信度を★で表記：
          - ★★★★★: データから明確に導出可能
          - ★★★★☆: データに基づく妥当な推論
          - ★★★☆☆: データが限定的だが推論可能
          - ★★☆☆☆: 推測要素が多い
          - ★☆☆☆☆: データ不足で推測のみ

          ## 用語解説
          - `layer="B_CONTINUOUS_RISK"`: 継続的にリスクを監視すべき重要チケット
          - `progress_delta=null` かつ `changes_this_week`全て`null`: 今週動きのないチケット
          - `[Phase]`プレフィックス: 開発フェーズを表す親チケット

          # Example

          ## サンプル入力データ（一部）
          ```json
          [
            {
              "id": 21,
              "title": "認証API実装",
              "status": "New",
              "progress": 70,
              "layer": "B_CONTINUOUS_RISK",
              "changes_this_week": {"progress_delta": 20}
            },
            {
              "id": 23,
              "title": "キャッシュ導入",
              "status": "Closed",
              "progress": 100,
              "changes_this_week": {"status_change": "Assigned→Closed"}
            },
            {
              "id": 26,
              "title": "[Phase] 要件・設計準備",
              "priority": "High",
              "due_date": "2026-02-08",
              "progress": 10,
              "layer": "B_CONTINUOUS_RISK"
            }
          ]
          ```

          ## 期待する出力例
          ```
          ## 今週の主要実績
          - キャッシュ導入が完了し、システムパフォーマンスの改善基盤を確立（根拠: #23）★★★★★
          - 認証API実装が70%完了（+20%）、来週の統合テストに向けて順調に進捗（根拠: #21）★★★★☆

          ## 来週の予定・アクション
          - 認証API実装の完了と統合テストの実施（根拠: #21）★★★★☆
          - 要件・設計準備フェーズの加速、期日2/8に向けた進捗確認（根拠: #26）★★★☆☆

          ## 課題・リスク・決定事項
          - **【リスク】** 要件・設計準備が期日超過（2/8期限）、進捗10%で停滞中。下流工程への影響を懸念（根拠: #26） - 高
          ```

          # Input Data (JSON)
          #{JSON.pretty_generate(ticket_payload)}
        PROMPT
      end

      def extract_ticket_payload(context)
        return context if context.is_a?(Array)

        return context[:tickets] if context.is_a?(Hash) && context.key?(:tickets)

        []
      end

      def with_retries
        attempts = 0

        begin
          attempts += 1
          yield
        rescue Error, Net::ReadTimeout, Net::OpenTimeout, Timeout::Error, SocketError, Errno::ECONNRESET => e
          retryable = retryable_error?(e)
          if retryable && attempts <= MAX_RETRIES + 1
            Rails.logger.warn("[RedmineReport] weekly LLM retry=#{attempts} reason=#{e.class}")
            sleep(0.2 * attempts)
            retry
          end

          raise Error, "Weekly LLM generation failed: #{e.message}"
        end
      end

      def retryable_error?(error)
        return true unless error.is_a?(Error)

        code = error.message[/HTTP (\d{3})/, 1]
        return true if code.nil?

        RETRYABLE_HTTP_CODES.include?(code.to_i)
      end

      def call_openai(prompt)
        api_key = ENV['OPENAI_API_KEY']
        raise Error, 'OPENAI_API_KEY is not set' if api_key.to_s.empty?

        model = ENV['LLM_MODEL'] || 'gpt-4o-mini'
        uri = URI('https://api.openai.com/v1/chat/completions')
        headers = {
          'Content-Type' => 'application/json',
          'Authorization' => "Bearer #{api_key}"
        }
        body = {
          model: model,
          messages: [
            { role: 'system', content: 'You are a Japanese project reporting assistant. Output markdown only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2
        }

        json = post_json(uri, headers, body)
        json.dig('choices', 0, 'message', 'content').to_s
      end

      def call_gemini(prompt)
        api_key = ENV['GEMINI_API_KEY']
        raise Error, 'GEMINI_API_KEY is not set' if api_key.to_s.empty?

        model = ENV['LLM_MODEL'] || 'gemini-1.5-flash'
        uri = URI("https://generativelanguage.googleapis.com/v1beta/models/#{model}:generateContent?key=#{api_key}")
        headers = { 'Content-Type' => 'application/json' }
        body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2
          }
        }

        json = post_json(uri, headers, body)
        json.dig('candidates', 0, 'content', 'parts', 0, 'text').to_s
      end

      def call_azure(prompt)
        api_key = ENV['AZURE_OPENAI_API_KEY']
        endpoint = ENV['AZURE_OPENAI_ENDPOINT']
        deployment = ENV['AZURE_OPENAI_DEPLOYMENT']
        api_version = ENV['AZURE_OPENAI_API_VERSION'] || '2024-02-01'
        raise Error, 'Missing AZURE_OPENAI configuration' unless api_key && endpoint && deployment

        base_uri = endpoint.end_with?('/') ? endpoint : "#{endpoint}/"
        uri = URI("#{base_uri}openai/deployments/#{deployment}/chat/completions?api-version=#{api_version}")
        headers = {
          'Content-Type' => 'application/json',
          'api-key' => api_key
        }
        body = {
          messages: [
            { role: 'system', content: 'You are a Japanese project reporting assistant. Output markdown only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2
        }

        json = post_json(uri, headers, body)
        json.dig('choices', 0, 'message', 'content').to_s
      end

      def post_json(uri, headers, body)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.read_timeout = READ_TIMEOUT_SECONDS

        request = Net::HTTP::Post.new(uri)
        headers.each { |k, v| request[k] = v }
        request.body = body.to_json

        response = http.request(request)
        unless response.is_a?(Net::HTTPSuccess)
          Rails.logger.error("[RedmineReport] weekly LLM API error: HTTP #{response.code}")
          raise Error, "HTTP #{response.code}"
        end

        JSON.parse(response.body)
      rescue JSON::ParserError => e
        raise Error, "Invalid JSON response: #{e.message}"
      end

      def parse_sections(text)
        cleaned = text.to_s.gsub(/^```markdown\s*/i, '').gsub(/^```\s*/i, '').gsub(/```\s*$/, '').strip
        raise Error, 'LLM returned empty response' if cleaned.empty?
        sections = {
          major_achievements: extract_section_items(cleaned, /##\s*今週の主要実績/),
          next_actions: extract_section_items(cleaned, /##\s*来週の予定・アクション/),
          risks: extract_section_items(cleaned, /##\s*課題・リスク・決定事項|##\s*課題・リスク/),
          decisions: extract_decisions(cleaned)
        }
        [cleaned, sections]
      end

      def extract_section_items(markdown, heading_pattern)
        lines = markdown.lines.map(&:rstrip)
        start = lines.index { |line| line.match?(heading_pattern) }
        return [] unless start

        collected = []
        lines[(start + 1)..-1].each do |line|
          break if line.start_with?('## ')
          next unless line.strip.start_with?('-')

          item = line.strip.sub(/\A-\s*/, '')
          collected << item unless item.empty?
        end
        collected
      end

      def extract_decisions(markdown)
        markdown.lines.filter_map do |line|
          stripped = line.strip
          next unless stripped.start_with?('-')
          next unless stripped.include?('【決定】')

          stripped.sub(/\A-\s*/, '')
        end
      end
    end
  end
end
