# Redmine Report Plugin

A Redmine plugin that provides:

- Schedule visualization across projects/subprojects
- Version-based weekly report generation with LLM
- Saving generated weekly reports to issues with revision history

## 1. Plugin Specification

### 1.1 Features

- Shows ticket progress in the `Schedule Report` screen
- Generates weekly reports per version with a 3-step flow: `prepare -> generate -> save`
- Validates destination issue before save (existence/visibility/editability/project match)
- Auto-increments weekly report `revision` when saving to the same destination issue/week

### 1.2 Main Endpoints

- `GET /projects/:project_id/schedule_report`
- `GET /projects/:project_id/schedule_report/data`
- `POST /projects/:project_id/schedule_report/generate`
- `GET /projects/:project_id/schedule_report/weekly/versions`
- `POST /projects/:project_id/schedule_report/weekly/destination/validate`
- `POST /projects/:project_id/schedule_report/weekly/prepare`
- `POST /projects/:project_id/schedule_report/weekly/generate`
- `POST /projects/:project_id/schedule_report/weekly/save`

### 1.3 Permission

- Requires project permission: `view_schedule_report`

## 2. Setup

1. Place this plugin under Redmine `plugins` directory.
2. Run migrations if needed:
```bash
bundle exec rake redmine:plugins:migrate NAME=redmine_report RAILS_ENV=production
```
3. Restart Redmine.
4. Optionally create `.env.local` in plugin root (`init.rb` loads it).

## 3. LLM Configuration

### 3.1 Common

- `LLM_PROVIDER`: `openai` / `gemini` / `azure` (default: `openai`)
- `LLM_MODEL`: model name (implementation defaults are used when omitted)

### 3.2 OpenAI

- `OPENAI_API_KEY`

### 3.3 Gemini

- `GEMINI_API_KEY`

### 3.4 Azure OpenAI

- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION` (optional)

## 4. Weekly Report Data Retrieval Rules

`weekly/prepare` and `weekly/generate` use the same extraction logic.

### 4.1 Selection Rules (TicketExtractor)

- Base scope: Issues in selected project and selected `version_id`
- Layer A: `updated_on` is within target week (`week_from..week_to`)
- Layer B: continuous risk
- Condition: issue is not closed and either overdue or high priority
- Merge A/B, deduplicate, then keep top `top_tickets_limit` by score (max 30)

### 4.2 Scoring

- Overdue: +100
- High priority: +50
- Updated in week: +25
- Add `done_ratio`

### 4.3 Data Fields per Ticket

- Core: `id`, `subject`, `status`, `priority`, `due_date`, `done_ratio`
- Layer: `A_WEEKLY_CHANGE` or `B_CONTINUOUS_RISK`
- Weekly changes from `journals.details`: `status_change`, `progress_delta`, `due_date_change`, `priority_change`, `assignee_change`
- Weekly comments from `journals.notes`: `journal_id`, `created_on`, `author`, `content`, `excerpt` (first 200 chars)

### 4.4 KPI Calculation (ContextBuilder)

- `completed`: status closed-like (`Closed` / `終了`)
- `wip`: not closed
- `overdue`: due date < today
- `high_priority_open`: high priority and not closed

## 5. What Is Sent to LLM

Weekly LLM (`WeeklyMarkdownGenerator`) receives mainly the `tickets` JSON array. Each item includes:

- Ticket identity (ID/title)
- State (`status`, `priority`, `progress`, `due_date`)
- Weekly deltas (`progress_delta`, `status_change`, etc.)
- Weekly comments (full text and excerpt)
- Layer (`A_WEEKLY_CHANGE` / `B_CONTINUOUS_RISK`)

Notes:

- `prepare` returns prompt preview and extracted tickets before LLM call
- `generate` sends the prepared prompt/data to LLM and returns markdown
- If LLM fails, server fallback markdown is generated

## 6. How Data Is Collected

- Issue base: `Issue.where(project_id:, fixed_version_id:)`
- Visibility: apply `Issue.visible(User.current)`
- Change logs: `issue.journals.details`
- Comments: `issue.journals.notes`
- Dates/progress: issue columns (`due_date`, `done_ratio`, `updated_on`)
- Destination validation: `DestinationValidator` checks `visible?`, `editable?`, and project match
- Browser persistence: destination issue mapping is stored in `localStorage` by `project_id + version_id`

## 7. What to Write in Tickets (for Better Weekly Reports)

LLM quality strongly depends on weekly comments and change history quality.

### 7.1 Recommended Comment Template

- Action: what was done
- Delta: what changed from last week (%/status)
- Evidence: why this is true (tests/review/related issue)
- Next action: what happens next
- Risk: blocker/dependency/schedule impact

### 7.2 Short Examples

- `Implemented API authentication. 3/5 integration test cases passed. Next week: investigate 2 failing cases.`
- `Blocked by external API response. Estimated 2 business days delay. Evaluating fallback options A/B.`

### 7.3 Avoid These

- Vague notes like "working on it" only
- Progress updates without evidence comments
- Missing owner or due date in action notes

## 8. Development Best Practices

- Contract-first: update `specs/*/contracts/*.openapi.yaml` for API changes
- Test-first for behavior changes: add/adjust unit and integration tests
- Separation of concerns: keep controller thin, move logic to services
- Security: never hardcode or log secrets
- Resilience: keep fallback path when LLM is unavailable
- Observability: log failures with diagnostic value (without sensitive data)

## 9. Tests

SPA:

```bash
cd spa
npm test
```

Ruby (examples):

```bash
bundle exec ruby -Itest test/integration/weekly_report_generation_test.rb
bundle exec ruby -Itest test/integration/weekly_report_save_flow_test.rb
bundle exec ruby -Itest test/unit/weekly_report_logging_test.rb
```

## License

GNU General Public License v2.0 (GPLv2)
