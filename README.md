# Redmine Report Plugin

This plugin provides structured project status reports for Redmine.

## Features

- **Project Status Report**: Visualizes project progress and status.
- **AI Report Generation**: Automatically generate report text using LLM (OpenAI).

## Installation

1. Copy the plugin to your Redmine `plugins` directory.
2. Run database migrations:
   ```bash
   bundle exec rake redmine:plugins:migrate NAME=redmine_report RAILS_ENV=production
   ```
3. Restart Redmine.

## Usage

### AI Report Generation

To use the AI report generation feature, configure the environment variables for your preferred provider:

#### Common Configuration
- `LLM_PROVIDER`: `openai` (default), `gemini`, or `azure`.
- `LLM_MODEL`: The model to use (specific to the provider).

#### OpenAI Configuration
- `OPENAI_API_KEY`: Your OpenAI API key.
- `LLM_MODEL`: (Optional) e.g., `gpt-3.5-turbo` (default), `gpt-4o`.

#### Gemini Configuration
- `GEMINI_API_KEY`: Your Google Gemini API key.
- `LLM_MODEL`: (Optional) e.g., `gemini-1.5-flash` (default), `gemini-1.5-pro`.

#### Azure OpenAI Configuration
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key.
- `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint.
- `AZURE_OPENAI_DEPLOYMENT`: Your deployment name.
- `AZURE_OPENAI_API_VERSION`: (Optional) e.g., `2024-02-01`.

#### Steps:
1. Navigate to the "Schedule Report" menu in your project.
2. Click the **"AI Generate Report"** button in the header.
3. The AI will analyze the project's task data and automatically generate the "Weekly Highlights", "Next Steps", and "Risks/Issues" sections.

## License

GNU General Public License v2.0 (GPLv2)
