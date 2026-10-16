# Research Workspace

Research Workspace is a local-first OpenClaw tool plugin for executing and preserving evidence-backed research. It supports bounded one-shot projects, recurring topic watches, exact source subscriptions, cited findings, decisions, and versioned deliverables.

OpenClaw performs the planning, web searches, source reading, evaluation, and synthesis. The plugin supplies deterministic project state and SQLite persistence so research can span multiple turns or scheduled runs without relying on conversation history.

## Model

```text
research brief
  -> open questions and constraints
  -> multi-angle web search and subscribed sources
  -> source reading and evidence extraction
  -> cited findings
  -> versioned artifact
  -> decision or next scheduled refresh
```

Projects use one of two modes:

- `project` — bounded research that completes after a recorded run unless a refresh interval is configured.
- `watch` — recurring research that compares new evidence with the previous run and maintains a living guide or digest.

Research depth is `quick`, `standard`, or `deep`. Tool instructions recommend approximately 5–10, 10–25, or 25–60 substantive sources respectively. Persisted minimums are lower so niche topics can still complete honestly: 2, 4, or 8 sources.

## Tools

- `research_project_add` — create a one-shot or recurring research brief
- `research_project_update` — correct, pause, resume, complete, or archive a project
- `research_project_status` — inspect briefs, questions, runs, evidence, artifacts, decisions, and subscriptions
- `research_due` — list active projects due for research
- `research_question_add` / `research_question_update` — preserve missing constraints and answers
- `research_search` — execute current multi-angle OpenClaw web searches
- `research_source_read` — fetch bounded readable source text through OpenClaw's SSRF guard
- `research_run_record` — transactionally store cited sources, findings, material-change assessment, and artifacts
- `research_artifact_update` — create a new immutable artifact version
- `research_decision_add` — retain proposed, accepted, rejected, or superseded decisions
- `research_subscription_add` / `research_subscription_list` / `research_subscription_remove` — manage exact source subscriptions
- `research_subscription_scan` — SSRF-guarded RSS/Atom polling with durable entry deduplication

## Evidence policy

Research runs connect findings to sources through caller-supplied source keys. Important findings must cite at least one stored source. Sources are classified as:

- `primary`
- `established`
- `discovery`
- `excluded`

Source types distinguish official documentation, release notes, repositories, papers, independent reviews, practitioner blogs, news, forums, and other material. Search snippets are discovery hints rather than sufficient evidence; the agent is instructed to open and read important sources before recording a run.

## Example projects

### One-shot setup research

```json
{
  "title": "Home nitro cold brew setup",
  "mode": "project",
  "depth": "standard",
  "objective": "Design a safe home nitro cold brew setup under $500 for two drinks per day",
  "deliverable": "Options comparison, recommendation, bill of materials, sanitation procedure, and operating guide",
  "constraints": ["Budget under $500", "Countertop or compact refrigerator footprint"]
}
```

### Recurring AI-development research

```json
{
  "title": "AI development best practices",
  "mode": "watch",
  "depth": "standard",
  "refreshIntervalDays": 7,
  "deliverable": "Weekly material-change digest and versioned living best-practices guide",
  "preferredSources": [
    "Official model-provider documentation and release notes",
    "Maintainer repositories and releases",
    "Established engineering and practitioner blogs",
    "Relevant papers and reproducible evaluations"
  ],
  "excludedSources": ["SEO content farms", "Uncorroborated social claims"]
}
```

RSS and Atom feeds can be attached to a watch. Initial scans establish durable entries; later scans return only newly discovered items.

## Scheduling

The plugin stores due dates but does not create an automation automatically. A typical OpenClaw automation:

1. Calls `research_subscription_scan`.
2. Calls `research_due`.
3. Researches each due project with `research_search` and source-reading tools.
4. Records the completed pass with `research_run_record`.
5. Announces only initial results, material changes, or blocked research.

Projects default to no external action beyond internal research and persistence. Decisions, purchases, code changes, posts, or other consequential actions remain separate and confirmation-gated.

## Persistence and security

The default database is:

```text
<openclaw-state>/plugins/research-workspace/research.sqlite
```

Relative configured paths must remain inside the OpenClaw state directory. SQLite foreign keys, WAL mode, a busy timeout, restrictive file permissions, schema versioning, and transactional run recording are enabled. Feed retrieval requires HTTPS, rejects credential-bearing URLs, uses OpenClaw's SSRF-guarded fetch runtime, limits redirects, times out requests, and caps feed bodies at 5 MB.

## Build and verify

```bash
npm install
npm test
npm run plugin:build
npm run plugin:validate
npm audit --omit=dev
```
