# Plugin's routes
# See: http://guides.rubyonrails.org/routing.html

get '/projects/:project_id/schedule_report', to: 'schedule_reports#index', as: 'project_schedule_report'
get '/projects/:project_id/schedule_report/data', to: 'schedule_reports#data', as: 'project_schedule_report_data'
post '/projects/:project_id/schedule_report/generate', to: 'schedule_reports#generate', as: 'project_schedule_report_generate'
get '/projects/:project_id/schedule_report/bundle/main.js',
    to: 'schedule_reports#bundle_js',
    as: 'project_schedule_report_bundle_js',
    format: false
get '/projects/:project_id/schedule_report/bundle/main.css',
    to: 'schedule_reports#bundle_css',
    as: 'project_schedule_report_bundle_css',
    format: false
