puts "TRACKERS:" + Tracker.all.map{|t| "#{t.id}:#{t.name}"}.join(',')
puts "STATUSES:" + IssueStatus.all.map{|s| "#{s.id}:#{s.name}"}.join(',')
puts "USERS:" + User.where(status: 1).limit(5).map{|u| "#{u.id}:#{u.login}"}.join(',')
puts "PROJECT:" + Project.find_by_identifier('user-mgmt-system').try(:id).to_s
