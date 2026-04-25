# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class GenerateService < BaseService
      def prepare(payload)
        validated, version, context = resolve_context(payload)
        prompt = weekly_llm.prepare(context: context, top_topics_limit: validated[:top_topics_limit])
        build_response(validated: validated, version: version, context: context, prompt: prompt)
      end

      def call(payload)
        validated, version, context = resolve_context(payload)
        composed = MarkdownComposer.new(
          context: context,
          top_topics_limit: validated[:top_topics_limit],
          prompt: payload[:prompt].to_s.strip.presence,
          llm: weekly_llm
        ).call
        build_response(
          validated: validated,
          version: version,
          context: context,
          markdown: composed[:markdown],
          llm_response: composed[:sections] || {}
        )
      end

      private

      def resolve_context(payload)
        validated = validator.validate_generate!(payload)
        version = ensure_project_and_find_version!(
          project_id: validated[:project_id],
          version_id: validated[:version_id]
        )
        context = ContextBuilder.new(
          project: project,
          version: version,
          week_from: validated[:week_from],
          week_to: validated[:week_to],
          top_tickets_limit: validated[:top_tickets_limit]
        ).call

        [validated, version, context]
      end

      def build_response(validated:, version:, context:, prompt: nil, markdown: nil, llm_response: nil)
        response = {
          header_preview: build_header_preview(validated, version),
          kpi: context[:kpi],
          tickets: context[:tickets]
        }
        response[:prompt] = prompt if prompt
        response[:markdown] = markdown if markdown
        response[:llm_response] = llm_response if llm_response
        response
      end

      def build_header_preview(validated, version)
        {
          project_id: project.id,
          version_id: version.id,
          week: week_key(validated[:week_from]),
          generated_at: Time.current.iso8601
        }
      end

      def weekly_llm
        @weekly_llm ||= RedmineReport::Llm::WeeklyMarkdownGenerator.new
      end

      def week_key(date)
        date.strftime('%G-W%V')
      end
    end
  end
end
