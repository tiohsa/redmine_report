# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class JournalUpdateService
      def initialize(user:, journal_class: Journal)
        @user = user
        @journal_class = journal_class
      end

      def call(journal_id:, notes:)
        journal = journal_class.find_by(id: journal_id)
        return error('NOT_FOUND', 'Journal not found', :not_found) unless journal
        return error('FORBIDDEN', 'You are not authorized to edit this comment', :forbidden) unless journal.editable_by?(user)

        journal.safe_attributes = { 'notes' => notes }
        return success if journal.save

        error('VALIDATION_ERROR', journal.errors.full_messages.join(', '), :unprocessable_entity)
      end

      private

      attr_reader :user, :journal_class

      def success
        ServiceResult.success
      end

      def error(code, message, status)
        ServiceResult.error(code: code, message: message, status: status)
      end
    end
  end
end
