# frozen_string_literal: true

require 'date'

module RedmineReport
  module ScheduleReport
    class FilterParams
      DEFAULT_MONTHS = 4
      MIN_MONTHS = 1
      MAX_MONTHS = 12

      attr_reader :include_subprojects, :months, :start_month, :status_scope

      def initialize(params = {})
        include_raw = params[:include_subprojects] || params['include_subprojects']
        months_raw = params[:months] || params['months']
        start_raw = params[:start_month] || params['start_month']
        status_raw = params[:status_scope] || params['status_scope']

        @include_subprojects = normalize_include_subprojects(include_raw)
        @months = normalize_months(months_raw)
        @start_month = normalize_start_month(start_raw)
        @status_scope = normalize_status_scope(status_raw)
      end

      def to_h
        {
          include_subprojects: include_subprojects,
          months: months,
          start_month: start_month,
          status_scope: status_scope
        }
      end

      private

      def normalize_include_subprojects(value)
        return true if value.nil?
        value.to_s == '1' || value == true
      end

      def normalize_months(value)
        parsed = value.to_i
        parsed = DEFAULT_MONTHS if parsed <= 0
        [[parsed, MIN_MONTHS].max, MAX_MONTHS].min
      end

      def normalize_start_month(value)
        return Date.today.strftime('%Y-%m') if value.nil? || value.to_s.strip.empty?
        Date.strptime(value.to_s, '%Y-%m').strftime('%Y-%m')
      rescue ArgumentError
        Date.today.strftime('%Y-%m')
      end

      def normalize_status_scope(value)
        scope = value.to_s.strip
        scope = 'open' if scope.empty?
        'open'
      end
    end
  end
end
