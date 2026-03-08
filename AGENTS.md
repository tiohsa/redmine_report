## Project overview

Redmine plugin (`redmine_report`) that provides schedule visualization and LLM-powered weekly report generation.  
Architecture: Redmine plugin (Ruby/Rails backend) + React SPA (TypeScript frontend built with Vite).

- Ruby 3.4.8 / Redmine 6.0
- React 18 / TypeScript / Vite / TailwindCSS v4 / Zustand
- LLM integration: OpenAI, Gemini, Azure OpenAI (configurable via `.env.local`)

## Dev environment setup

### Docker (recommended)

```bash
docker compose up -d
```

Redmine: http://localhost:3000 (MariaDB backend)

### SPA

```bash
cd spa
npm install
npm run build          # production build → assets/build/
npm run build:watch    # watch mode for development
npm run dev            # Vite dev server
```

### Plugin

1. Place plugin under Redmine `plugins/` directory
2. Restart Redmine
3. Create `.env.local` for LLM API keys (see README.md § 3)

## Architecture

```
redmine_report/
├── app/
│   ├── controllers/     # schedule_reports_controller.rb (single controller)
│   ├── services/        # Business logic (separated by domain)
│   │   └── redmine_report/
│   │       ├── schedule_report/   # Schedule report services
│   │       ├── weekly_report/     # Weekly report services
│   │       └── llm/               # LLM provider abstraction
│   ├── views/           # ERB templates (minimal, SPA handles UI)
│   └── helpers/
├── config/
│   ├── routes.rb        # All plugin routes
│   └── locales/         # en.yml, ja.yml
├── spa/                 # React SPA (separate build)
│   └── src/
│       ├── components/  # React components
│       ├── services/    # API client services
│       ├── stores/      # Zustand state stores
│       ├── types/       # TypeScript type definitions
│       ├── i18n/        # Frontend translations
│       └── utils/       # Utility functions
├── assets/build/        # SPA build output (committed)
├── init.rb              # Plugin registration & permissions
├── lib/tasks/           # Rake tasks
└── test/                # Ruby tests
```

### Key design patterns

- **Thin controller**: Controller delegates to service classes
- **Service layer**: All business logic in `app/services/redmine_report/`
- **SPA integration**: Vite builds to `assets/build/`, served via `bundle_js` / `bundle_css` controller actions
- **LLM abstraction**: Provider pattern in `app/services/redmine_report/llm/`
- **State management**: Zustand stores in `spa/src/stores/`

## Build commands

### SPA

```bash
cd spa
npm run build           # Production build
npm run build:watch     # Watch mode
npm run dev             # Dev server
```

### Redmine

```bash
bundle exec rake redmine:plugins:migrate   # Run plugin migrations
```

## Testing instructions

### SPA (Vitest)

```bash
cd spa
npm test                # Run all tests
npm run test:watch      # Watch mode
```

Test environment: jsdom. Test files in `spa/src/components/__tests__/`.

### Ruby (Minitest)

Run from **Redmine root** directory:

```bash
# All unit tests
bundle exec ruby -Itest plugins/redmine_report/test/unit/<test_file>.rb

# All integration tests
bundle exec ruby -Itest plugins/redmine_report/test/integration/<test_file>.rb

# Single test example
bundle exec ruby -Itest plugins/redmine_report/test/unit/schedule_report_aggregation_test.rb
bundle exec ruby -Itest plugins/redmine_report/test/integration/weekly_report_generation_test.rb
```

Test categories:
- `test/unit/` — Service layer unit tests (11 files)
- `test/integration/` — Controller integration tests (12 files)
- `test/system/` — Playwright system tests

## Code style

### Ruby

- Keep controller thin — move logic to `app/services/`
- Use service objects with clear single responsibility
- Follow existing naming: `RedmineReport::ScheduleReport::*`, `RedmineReport::WeeklyReport::*`
- i18n keys in `config/locales/en.yml` and `config/locales/ja.yml`

### TypeScript / React

- TailwindCSS v4 for styling (with `@tailwindcss/vite` plugin)
- Use `clsx` + `tailwind-merge` for conditional class merging
- Zustand for state management
- TypeScript strict mode enabled
- Component tests with `@testing-library/react`

## PR instructions

- Run SPA tests (`cd spa && npm test`) and Ruby tests before committing
- Contract-first: update `specs/*/contracts/*.openapi.yaml` for API changes
- Test-first for behavior changes: add/adjust unit and integration tests
- Keep fallback path when LLM is unavailable

## Security considerations

- Never commit API keys or secrets — use `.env.local` (gitignored)
- Never log sensitive data (API keys, user credentials)
- Use `Issue.visible(User.current)` for issue visibility scoping
- Validate destination issue permissions via `DestinationValidator` (visible?, editable?, project match)
- Use Redmine's `before_action :authorize` for permission checks
