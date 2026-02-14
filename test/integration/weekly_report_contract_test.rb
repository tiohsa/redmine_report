# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)
require 'yaml'

class WeeklyReportContractTest < ActiveSupport::TestCase
  CONTRACT_PATH = File.expand_path('../../specs/001-weekly-version-report/contracts/weekly-version-report.openapi.yaml', __dir__)

  def test_weekly_contract_contains_required_paths
    doc = YAML.load_file(CONTRACT_PATH)

    assert doc['paths'].key?('/versions')
    assert doc['paths'].key?('/destination/validate')
    assert doc['paths'].key?('/generate')
    assert doc['paths'].key?('/save')

    save_required = doc.dig('components', 'schemas', 'SaveRequest', 'required')
    assert_includes save_required, 'destination_issue_id'
    assert_includes save_required, 'markdown'
  end
end
