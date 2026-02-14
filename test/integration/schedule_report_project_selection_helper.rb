# frozen_string_literal: true

module ScheduleReportProjectSelectionHelper
  def schedule_report_contract_path
    File.expand_path('../../../specs/001-valid-version-parent/contracts/ticket-display-criteria.openapi.yaml', __dir__)
  end

  def build_project_option(id:, identifier:, name:, level:, parent_id: nil)
    {
      project_id: id,
      identifier: identifier,
      name: name,
      level: level,
      parent_project_id: parent_id,
      selectable: true
    }
  end
end
