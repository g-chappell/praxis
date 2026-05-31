// Praxis Postgres schema — mirrors docs/project_plan.md §9 exactly.
//
// Convention: this file is the source of truth. The SQL in §9 of the
// project plan is a one-time reference for the initial transliteration;
// once this schema diverges (via Drizzle migrations), §9 lags. New work
// edits this file and regenerates a migration via `pnpm db:generate`.
//
// 12 tables + 1 supporting index (idx_events_project_time on events).
// Anything outside this list is post-POC scope (skills, portfolio,
// subscriptions, admin) — see project_plan.md §15.

import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// ─── users ────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── auth_sessions ────────────────────────────────────────────────────
export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

// ─── magic_link_tokens ────────────────────────────────────────────────
export const magicLinkTokens = pgTable('magic_link_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

// ─── oauth_tokens ─────────────────────────────────────────────────────
// access_token_encrypted / refresh_token_encrypted are populated by
// packages/crypto (STORY-06). This schema only carries the bytes —
// encryption/decryption is the consumer's concern.
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('oauth_tokens_user_provider_unique').on(table.userId, table.provider)],
);

// ─── teams ────────────────────────────────────────────────────────────
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── team_memberships ─────────────────────────────────────────────────
export const teamMemberships = pgTable(
  'team_memberships',
  {
    teamId: uuid('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);

// ─── team_invites ─────────────────────────────────────────────────────
export const teamInvites = pgTable('team_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .references(() => teams.id, { onDelete: 'cascade' })
    .notNull(),
  inviteCode: text('invite_code').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedBy: uuid('accepted_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── projects ─────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .references(() => teams.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  templateId: text('template_id').notNull(),
  harness: text('harness').notNull().default('claude-code'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── sessions ─────────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  containerId: text('container_id'),
  previewUrl: text('preview_url'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

// ─── events ───────────────────────────────────────────────────────────
// Indexed by (project_id, created_at) — the only index in §9.
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_events_project_time').on(table.projectId, table.createdAt)],
);

// ─── agent_turns ──────────────────────────────────────────────────────
export const agentTurns = pgTable('agent_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  promptingUserId: uuid('prompting_user_id').references(() => users.id),
  promptText: text('prompt_text').notNull(),
  responseText: text('response_text'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// ─── learning_links ───────────────────────────────────────────────────
export const learningLinks = pgTable('learning_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  topic: text('topic').notNull(),
  source: text('source'),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow(),
});

// `sql` is imported above so `defaultRandom()` (which emits gen_random_uuid())
// works on PG13+ without the pgcrypto extension. PG16 ships gen_random_uuid
// in core.
export { sql };
