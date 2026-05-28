create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists subscriptions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  tier text not null check (tier in ('free', 'creator', 'studio')),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_workspace_status_idx
  on subscriptions (workspace_id, status, current_period_end desc);

create table if not exists projects (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_workspace_idx
  on projects (workspace_id);

create table if not exists media_assets (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  uploaded_by_user_id text not null references users(id),
  source_key text not null,
  filename text not null,
  content_type text,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_project_idx
  on media_assets (project_id);

create table if not exists transcripts (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id),
  source_asset_id text not null references media_assets(id) on delete cascade,
  schema_version text not null check (schema_version = 'content_ops.transcript.v1'),
  language text,
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  segments jsonb not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists transcripts_source_created_idx
  on transcripts (workspace_id, project_id, source_asset_id, created_at desc);

create table if not exists edit_briefs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id),
  source_asset_id text references media_assets(id),
  active_version_number integer not null default 0 check (active_version_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists edit_briefs_project_idx
  on edit_briefs (project_id, updated_at desc);

create table if not exists edit_brief_versions (
  id text primary key,
  edit_brief_id text not null references edit_briefs(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id),
  source_asset_id text references media_assets(id),
  version_number integer not null check (version_number > 0),
  schema_version text not null check (schema_version = 'content_ops.edit_brief.v1'),
  settings jsonb not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  unique (edit_brief_id, version_number)
);

create index if not exists edit_brief_versions_brief_created_idx
  on edit_brief_versions (edit_brief_id, created_at desc);

create table if not exists edit_decision_lists (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  source_asset_id text not null references media_assets(id),
  edit_brief_id text not null references edit_briefs(id) on delete cascade,
  edit_brief_version_id text not null references edit_brief_versions(id) on delete cascade,
  schema_version text not null check (schema_version = 'content_ops.edit_decision_list.v1'),
  decision_list jsonb not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists edit_decision_lists_project_created_idx
  on edit_decision_lists (project_id, created_at desc);

create table if not exists render_jobs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id),
  source_asset_id text not null references media_assets(id),
  status text not null check (
    status in (
      'created',
      'uploaded',
      'transcribing',
      'transcribed',
      'render_queued',
      'rendering',
      'ready',
      'failed',
      'canceled'
    )
  ),
  estimated_render_minutes integer not null check (estimated_render_minutes >= 0),
  storage_keys jsonb not null,
  idempotency_key text not null unique,
  queue_job jsonb not null,
  output_manifest jsonb,
  failure_code text,
  failure_message text,
  render_started_at timestamptz,
  render_completed_at timestamptz,
  render_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists render_jobs_workspace_status_idx
  on render_jobs (workspace_id, status, updated_at desc);

create index if not exists render_jobs_project_created_idx
  on render_jobs (project_id, created_at desc);

create index if not exists render_jobs_workspace_started_idx
  on render_jobs (workspace_id, render_started_at desc)
  where render_started_at is not null;

create index if not exists render_jobs_workspace_completed_idx
  on render_jobs (workspace_id, render_completed_at desc)
  where render_completed_at is not null;

create table if not exists usage_ledger (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  render_job_id text references render_jobs(id) on delete set null,
  event_type text not null,
  render_minutes integer not null check (render_minutes >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists usage_ledger_workspace_period_idx
  on usage_ledger (workspace_id, period_start, period_end);

create table if not exists webhook_events (
  id text primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);
