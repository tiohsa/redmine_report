# Plugin's routes
# See: http://guides.rubyonrails.org/routing.html

get '/projects/:project_id/schedule_report', to: 'schedule_reports#index', as: 'project_schedule_report'
get '/projects/:project_id/schedule_report/data', to: 'schedule_reports#data', as: 'project_schedule_report_data'
post '/projects/:project_id/schedule_report/generate', to: 'schedule_reports#generate', as: 'project_schedule_report_generate'
get '/projects/:project_id/schedule_report/weekly/versions',
    to: 'schedule_reports#weekly_versions',
    as: 'project_schedule_report_weekly_versions'
post '/projects/:project_id/schedule_report/weekly/destination/validate',
     to: 'schedule_reports#weekly_validate_destination',
     as: 'project_schedule_report_weekly_validate_destination'
post '/projects/:project_id/schedule_report/weekly/generate',
     to: 'schedule_reports#weekly_generate',
     as: 'project_schedule_report_weekly_generate'
post '/projects/:project_id/schedule_report/weekly/prepare',
     to: 'schedule_reports#weekly_prepare',
     as: 'project_schedule_report_weekly_prepare'
post '/projects/:project_id/schedule_report/weekly/save',
     to: 'schedule_reports#weekly_save',
     as: 'project_schedule_report_weekly_save'
get '/projects/:project_id/schedule_report/bundle/main.js',
    to: 'schedule_reports#bundle_js',
    as: 'project_schedule_report_bundle_js',
    format: false
get '/projects/:project_id/schedule_report/bundle/main.css',
    to: 'schedule_reports#bundle_css',
    as: 'project_schedule_report_bundle_css',
    format: false
