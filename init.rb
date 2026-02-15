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
  author 'Author name'
  description 'This is a plugin for Redmine'
  version '0.0.1'
  url 'http://example.com/path/to/plugin'
  author_url 'http://example.com/about'

  project_module :schedule_report do
    permission :view_schedule_report,
               schedule_reports: %i[
                 index
                 data
                 generate
                 weekly_versions
                 weekly_validate_destination
                 weekly_prepare
                 weekly_generate
                 weekly_save
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
