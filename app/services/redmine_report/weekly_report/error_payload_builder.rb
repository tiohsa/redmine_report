# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class ErrorPayloadBuilder
      class << self
        def invalid_input(message)
          payload(status: :unprocessable_entity, json: { code: 'INVALID_INPUT', message: message })
        end

        def destination_invalid(code:, message:, status:)
          payload(status: status, json: { code: code, message: message })
        end

        def revision_conflict(message)
          payload(
            status: :conflict,
            json: { code: 'REVISION_CONFLICT', message: message, retryable: true }
          )
        end

        def upstream_failure(message)
          payload(
            status: :service_unavailable,
            json: { code: 'UPSTREAM_FAILURE', message: message, retryable: true }
          )
        end

        def unavailable(message)
          payload(status: :service_unavailable, json: { code: 'UNAVAILABLE', message: message })
        end

        def upstream_unavailable(message)
          payload(
            status: :service_unavailable,
            json: { code: 'UPSTREAM_UNAVAILABLE', message: message, retryable: true }
          )
        end

        private

        def payload(status:, json:)
          { status: status, json: json }
        end
      end
    end
  end
end
