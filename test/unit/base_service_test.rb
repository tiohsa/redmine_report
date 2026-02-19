# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class BaseServiceTest < ActiveSupport::TestCase
  FakeVersions = Struct.new(:version) do
    def find_by(id:)
      return version if version.id == id

      nil
    end
  end

  FakeProject = Struct.new(:id, :versions)
  FakeVersion = Struct.new(:id)

  class DummyService < RedmineReport::WeeklyReport::BaseService
    def resolve(project_id:, version_id:)
      ensure_project_and_find_version!(project_id: project_id, version_id: version_id)
    end
  end

  def setup
    @version = FakeVersion.new(9)
    @project = FakeProject.new(5, FakeVersions.new(@version))
    @service = DummyService.new(project: @project, user: Object.new)
  end

  def test_resolve_returns_version_when_project_and_version_match
    resolved = @service.resolve(project_id: 5, version_id: 9)

    assert_equal @version, resolved
  end

  def test_resolve_raises_when_project_id_mismatches
    error = assert_raises(RedmineReport::WeeklyReport::RequestValidator::ValidationError) do
      @service.resolve(project_id: 999, version_id: 9)
    end

    assert_equal 'project_id mismatch', error.message
  end

  def test_resolve_raises_when_version_not_found
    error = assert_raises(RedmineReport::WeeklyReport::RequestValidator::ValidationError) do
      @service.resolve(project_id: 5, version_id: 100)
    end

    assert_equal 'version_id not found in selected project', error.message
  end
end
