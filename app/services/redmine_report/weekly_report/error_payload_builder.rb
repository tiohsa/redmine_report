# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class ErrorPayloadBuilder
      class << self
        def invalid_input(message)
          payload_with_message(status: :unprocessable_entity, code: 'INVALID_INPUT', message: message)
        end

        def destination_invalid(code:, message:, status:)
          payload_with_message(status: status, code: code, message: message)
        end

        def revision_conflict(message)
          payload_with_message(status: :conflict, code: 'REVISION_CONFLICT', message: message, retryable: true)
        end

        def upstream_failure(message)
          payload_with_message(status: :service_unavailable, code: 'UPSTREAM_FAILURE', message: message, retryable: true)
        end

        def unavailable(message)
          payload_with_message(status: :service_unavailable, code: 'UNAVAILABLE', message: message)
        end

        def upstream_unavailable(message)
          payload_with_message(
            status: :service_unavailable,
            code: 'UPSTREAM_UNAVAILABLE',
            message: message,
            retryable: true
          )
        end

        private

        def payload_with_message(status:, code:, message:, retryable: false)
          json = { code: code, message: message }
          json[:retryable] = true if retryable

          payload(status: status, json: json)
        end

        def payload(status:, json:)
          { status: status, json: json }
        end
      end
    end
  end
end
