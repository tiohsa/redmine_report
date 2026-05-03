# frozen_string_literal: true

require_relative '../playwright_system_test_case'

class TaskDetailsInlineDatePickerTest < PlaywrightSystemTestCase
  fixtures :projects, :enabled_modules, :versions,
           :users, :members, :roles, :member_roles,
           :trackers, :projects_trackers, :enumerations, :issue_statuses, :issues

  def setup
    @project = Project.find_by(identifier: 'ecookbook') || Project.first
    skip 'project fixture required' unless @project
    EnabledModule.find_or_create_by!(project: @project, name: 'schedule_report')

    @admin = User.find_by(login: 'admin') || User.first
    skip 'admin fixture required' unless @admin

    @version = @project.versions.find_by(name: 'E2E Task Details Version') || @project.versions.create!(
      name: 'E2E Task Details Version',
      status: 'open'
    )
    @tracker = @project.trackers.first || Tracker.first
    @open_status = IssueStatus.where(is_closed: false).first || IssueStatus.first
    @priority = IssuePriority.find_by(is_default: true) || IssuePriority.first

    @issue = Issue.where(project: @project, subject: 'E2E task details date picker issue').first_or_initialize
    @issue.assign_attributes(
      tracker: @tracker,
      author: @admin,
      status: @open_status,
      priority: @priority,
      fixed_version: @version,
      start_date: Date.new(2026, 5, 10),
      due_date: Date.new(2028, 12, 31),
      done_ratio: 40
    )
    @issue.save!
  end

  def test_inline_date_picker_supports_day_today_clear_and_month_year_selection
    log_user('admin', 'admin')
    page.execute_script('localStorage.clear()')
    visit "/projects/#{@project.identifier}/schedule_report"

    bar_selector = %(rect[data-step-issue-id="#{@issue.id}"])
    assert page.has_css?(bar_selector, wait: 20)
    find(bar_selector).double_click

    start_date_display = "[data-testid=\"start-date-display-#{@issue.id}\"]"
    assert page.has_css?(start_date_display, wait: 20)

    open_start_date_picker(start_date_display)
    select_picker_date('2026-05-12')
    assert_picker_closed
    assert_equal '2026/05/12', find(start_date_display).text

    open_start_date_picker(start_date_display)
    within_date_picker do
      find(%(button[data-testid="date-today-footer-start_date-#{@issue.id}"])).click
    end
    assert_picker_closed
    assert_equal Date.current.strftime('%Y/%m/%d'), find(start_date_display).text

    open_start_date_picker(start_date_display)
    within_date_picker do
      select_picker_month(10)
      select_picker_year(2027)
      assert_equal '10', find('select.react-datepicker__month-select').value
      assert_equal '2027', find('select.react-datepicker__year-select').value
      find(%(span[data-inline-date-picker-day][data-date="2027-11-15"])).click
    end
    assert_picker_closed
    assert_equal '2027/11/15', find(start_date_display).text

    open_start_date_picker(start_date_display)
    within_date_picker do
      find(%(button[data-testid="date-clear-footer-start_date-#{@issue.id}"])).click
    end
    assert_picker_closed
    assert_equal '-', find(start_date_display).text
  end

  private

  def open_start_date_picker(display_selector)
    find(display_selector).double_click
    assert page.has_css?('[role="dialog"][aria-label="Choose Date"]', wait: 10)
  end

  def within_date_picker(&block)
    within('[role="dialog"][aria-label="Choose Date"]', &block)
  end

  def select_picker_date(iso_date)
    within_date_picker do
      find(%(span[data-inline-date-picker-day][data-date="#{iso_date}"])).click
    end
  end

  def select_picker_month(month_index)
    find('select.react-datepicker__month-select').find(%(option[value="#{month_index}"])).select_option
  end

  def select_picker_year(year)
    find('select.react-datepicker__year-select').find(%(option[value="#{year}"])).select_option
  end

  def assert_picker_closed
    assert page.has_no_css?('[role="dialog"][aria-label="Choose Date"]', wait: 10)
  end
end
