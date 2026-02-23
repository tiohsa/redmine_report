# Load .env.local if it exists
env_path = File.join(File.dirname(__FILE__), '.env.local')
if File.exist?(env_path)
  File.readlines(env_path).each do |line|
    line = line.strip
    next if line.empty? || line.start_with?('#')
    key, value = line.split('=', 2)
    ENV[key.strip] = value.strip if key && value
  end
end

Redmine::Plugin.register :redmine_report do
  name 'Redmine Report plugin'
  author 'tiohsa'
  description 'Report plugin for Redmine'
  version '0.0.1'
  url 'https://github.com/tiohsa/redmine_report'
  author_url 'https://github.com/tiohsa/redmine_report'

  project_module :schedule_report do
    permission :view_schedule_report,
               schedule_reports: %i[
                 index
                 data
                 generate
                 task_details
                 task_dates
                 task_masters
                 task_update
                 update_journal
                 weekly_versions
                 weekly_validate_destination
                 weekly_prepare
                 weekly_generate
                 weekly_save
                 weekly_ai_responses
                 bundle_js
                 bundle_css
               ]
  end

  menu :project_menu, :schedule_report,
       { controller: 'schedule_reports', action: 'index' },
       caption: :label_schedule_report,
       after: :activity,
       param: :project_id
end
