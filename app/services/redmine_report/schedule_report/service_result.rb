# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class ServiceResult
      attr_reader :code, :message, :status, :retryable

      def self.success(payload = {})
        new(ok: true, payload: payload)
      end

      def self.error(code:, message:, status:, retryable: nil, payload: {})
        new(ok: false, code: code, message: message, status: status, retryable: retryable, payload: payload)
      end

      def initialize(ok:, payload: {}, code: nil, message: nil, status: nil, retryable: nil)
        @ok = ok
        @payload = payload
        @code = code
        @message = message
        @status = status
        @retryable = retryable
      end

      def ok?
        @ok
      end

      def [](key)
        to_h[key]
      end

      def to_h
        base = { ok: ok? }.merge(@payload)
        return base if ok?

        base.merge(
          code: code,
          message: message,
          status: status
        ).tap do |hash|
          hash[:retryable] = retryable unless retryable.nil?
        end
      end
    end
  end
end
