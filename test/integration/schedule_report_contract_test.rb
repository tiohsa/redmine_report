# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)
require 'yaml'
require File.expand_path('./schedule_report_project_selection_helper', __dir__)

class ScheduleReportContractTest < ActiveSupport::TestCase
  include ScheduleReportProjectSelectionHelper

  def test_contract_contains_required_paths
    doc = YAML.load_file(schedule_report_contract_path)

    assert doc['paths'].key?('/data')
    assert_equal 'Get schedule report snapshot with ticket display decisions', doc['paths']['/data']['get']['summary']
    assert doc.dig('components', 'schemas', 'ReportSnapshot')
    assert doc.dig('components', 'schemas', 'SelectionSummary')
    required_meta_filters = doc.dig(
      'components',
      'schemas',
      'ReportSnapshot',
      'properties',
      'meta',
      'properties',
      'applied_filters',
      'required'
    )
    assert_includes required_meta_filters, 'filter_rule'
  end

  def test_project_option_helper_shape
    option = build_project_option(
      id: 1,
      identifier: 'ecookbook',
      name: 'eCookbook',
      level: 0
    )

    assert_equal true, option[:selectable]
    assert_equal 'ecookbook', option[:identifier]
  end
end
