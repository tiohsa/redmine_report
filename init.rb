Redmine::Plugin.register :redmine_report do
  name 'Redmine Report plugin'
  author 'Author name'
  description 'This is a plugin for Redmine'
  version '0.0.1'
  url 'http://example.com/path/to/plugin'
  author_url 'http://example.com/about'

  project_module :schedule_report do
    permission :view_schedule_report, schedule_reports: %i[index data bundle_js bundle_css]
  end

  menu :project_menu, :schedule_report,
       { controller: 'schedule_reports', action: 'index' },
       caption: :label_schedule_report,
       after: :activity,
       param: :project_id
end
