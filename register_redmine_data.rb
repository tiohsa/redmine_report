require 'json'

# JSONデータの読み込み
json_path = File.join(Rails.root, 'plugins', 'redmine_report', 'excel_data.json')
unless File.exist?(json_path)
  puts "Error: #{json_path} not found."
  exit 1
end

data = JSON.parse(File.read(json_path))

# 登録先プロジェクトとバージョンの特定 (ABC / v1.2.0)
target_project = Project.find_by(identifier: 'abc') || Project.find_by(name: 'ABC')
unless target_project
  puts "Error: Project 'ABC' not found. Please create it first."
  exit 1
end

target_version = target_project.versions.find_by(name: 'v1.2.0')
puts "Target Project: #{target_project.name} (ID: #{target_project.id})"
puts "Target Version: #{target_version.name} (ID: #{target_version.id})" if target_version

# Issuesシートのデータ登録 (チケット作成)
puts "\n--- Creating/Updating Issues ---"
data['Issues']['data'].each do |issue_data|
  # project_id, version_id が Excel 内にあるが、現在の環境の ID に差し替える
  
  # Trackerの特定
  tracker = Tracker.find_by(name: issue_data['tracker']) || target_project.trackers.first
  
  # Statusの特定
  status = IssueStatus.find_by(name: issue_data['status']) || IssueStatus.default
  
  # Priorityの特定
  priority = IssuePriority.find_by(name: issue_data['priority']) || IssuePriority.default

  # 重複登録防止
  issue = Issue.where(project_id: target_project.id, subject: issue_data['subject']).first
  
  if issue
    puts "Issue '#{issue_data['subject']}' already exists (ID: #{issue.id}). Updating..."
  else
    issue = Issue.new(project: target_project, author: User.first)
    puts "Creating new Issue: '#{issue_data['subject']}'"
  end

  issue.subject = issue_data['subject']
  issue.tracker = tracker
  issue.status = status
  issue.priority = priority
  issue.due_date = issue_data['due_date']&.split('T')&.first
  issue.estimated_hours = issue_data['estimated_hours']
  issue.done_ratio = issue_data['progress_%']
  
  # バージョンがシート内で指定されており、かつ「除外」目的でない場合
  if issue_data['version_id'] && issue_data['layer_expected'] != 'EXCLUDE'
    issue.fixed_version = target_version
  end

  issue.description = issue_data['notes']
  
  if issue.save
    puts "  Success: ID #{issue.id}"
  else
    puts "  Error: #{issue.errors.full_messages.join(', ')}"
  end
end

# IssueCommentsシートのデータ登録 (コメント投稿)
puts "\n--- Adding Comments (Journals) ---"
data['IssueComments']['data'].each do |comment_data|
  original_issue_data = data['Issues']['data'].find { |i| i['issue_id'] == comment_data['issue_id'] }
  next unless original_issue_data

  issue = Issue.where(project_id: target_project.id, subject: original_issue_data['subject']).first
  unless issue
    puts "Issue '#{original_issue_data['subject']}' not found. Skipping comment."
    next
  end

  if issue.journals.exists?(notes: comment_data['notes'])
    puts "Comment for Issue '#{issue.subject}' already exists. Skipping."
    next
  end

  puts "Adding comment to Issue ##{issue.id} (#{issue.subject})"
  author = User.where("lastname LIKE ? OR firstname LIKE ? OR login LIKE ?", "%#{comment_data['author']}%", "%#{comment_data['author']}%", "%#{comment_data['author']}%").first || User.first
  
  journal = issue.init_journal(author, comment_data['notes'])
  # created_on は DB 保存後に update_columns で強制的に書き換える（init_journal では指定しづらいため）
  if journal.save
    journal.update_columns(created_on: comment_data['journal_created_on'])
    puts "  Comment added (Date: #{comment_data['journal_created_on']})."
  else
    puts "  Error adding comment: #{journal.errors.full_messages.join(', ')}"
  end
end

puts "\nData registration complete."
