# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)
require 'yaml'

class ScheduleReportContractTest < ActiveSupport::TestCase
  def test_contract_contains_required_paths
    file = File.expand_path('../../../specs/001-read-spec-md/contracts/openapi.yaml', __dir__)
    doc = YAML.load_file(file)

    assert doc['paths'].key?('/schedule_report')
    assert doc['paths'].key?('/schedule_report/data')
  end
end
