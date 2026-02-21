module RedmineReport
  module Hooks
    class ViewIssuesFormDetailsBottomHook < Redmine::Hook::ViewListener
      def view_issues_form_details_bottom(context={})
        project = context[:project]
        return '' unless project
        return '' unless User.current.allowed_to?(:view_schedule_report, project)

        issue = context[:issue]

        plugin_root = Rails.root.join('plugins', 'redmine_report')
        built_css = plugin_root.join('assets', 'build', 'main.css')
        built_js = plugin_root.join('assets', 'build', 'main.js')
        fallback_css = plugin_root.join('assets', 'stylesheets', 'schedule_report.css')
        fallback_js = plugin_root.join('assets', 'javascripts', 'schedule_report.js')

        css_path = File.file?(built_css) ? built_css : fallback_css
        js_path = File.file?(built_js) ? built_js : fallback_js

        css_content = File.read(css_path) rescue ''
        js_content = File.read(js_path) rescue ''

        html = <<-HTML
          <div id="redmine-report-bulk-issue-creation-root"
               data-project-id="#{project.id}"
               data-project-identifier="#{project.identifier}"
               data-parent-issue-id="#{issue&.id}">
          </div>
          <style>#{css_content}</style>
          <script type="module">#{js_content}</script>
        HTML

        html.html_safe
      end
    end
  end
end
