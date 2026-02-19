# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class WeeklyErrorPayloadBuilderTest < ActiveSupport::TestCase
  def test_invalid_input_payload
    result = RedmineReport::WeeklyReport::ErrorPayloadBuilder.invalid_input('bad request')

    assert_equal :unprocessable_entity, result[:status]
    assert_equal({ code: 'INVALID_INPUT', message: 'bad request' }, result[:json])
  end

  def test_destination_invalid_payload
    result = RedmineReport::WeeklyReport::ErrorPayloadBuilder.destination_invalid(code: 'FORBIDDEN', message: 'not allowed', status: 403)

    assert_equal 403, result[:status]
    assert_equal({ code: 'FORBIDDEN', message: 'not allowed' }, result[:json])
  end

  def test_revision_conflict_payload
    result = RedmineReport::WeeklyReport::ErrorPayloadBuilder.revision_conflict('conflicted')

    assert_equal :conflict, result[:status]
    assert_equal({ code: 'REVISION_CONFLICT', message: 'conflicted', retryable: true }, result[:json])
  end

  def test_upstream_failure_payload
    result = RedmineReport::WeeklyReport::ErrorPayloadBuilder.upstream_failure('service down')

    assert_equal :service_unavailable, result[:status]
    assert_equal({ code: 'UPSTREAM_FAILURE', message: 'service down', retryable: true }, result[:json])
  end

  def test_unavailable_payload
    result = RedmineReport::WeeklyReport::ErrorPayloadBuilder.unavailable('unavailable')

    assert_equal :service_unavailable, result[:status]
    assert_equal({ code: 'UNAVAILABLE', message: 'unavailable' }, result[:json])
  end

  def test_upstream_unavailable_payload
    result = RedmineReport::WeeklyReport::ErrorPayloadBuilder.upstream_unavailable('temporarily unavailable')

    assert_equal :service_unavailable, result[:status]
    assert_equal({ code: 'UPSTREAM_UNAVAILABLE', message: 'temporarily unavailable', retryable: true }, result[:json])
  end
end
