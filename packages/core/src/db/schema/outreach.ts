import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  boolean,
  integer,
  decimal,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { agents } from './agents';

// ============================================
// LEADS
// ============================================

export const leadSourceEnum = pgEnum('lead_source', [
  'landing_page',
  'form_submission',
  'import',
  'linkedin',
  'referral',
  'cold_outreach',
  'ad_campaign',
  'organic',
]);

export const outreachLeadStatusEnum = pgEnum('outreach_lead_status', [
  'new',
  'contacted',
  'engaged',
  'qualified',
  'meeting_scheduled',
  'proposal_sent',
  'won',
  'lost',
  'unsubscribed',
]);

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  // Contact info
  email: text('email').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),
  company: text('company'),
  jobTitle: text('job_title'),
  linkedinUrl: text('linkedin_url'),
  website: text('website'),

  // Lead management
  source: leadSourceEnum('source').notNull().default('organic'),
  status: outreachLeadStatusEnum('status').notNull().default('new'),
  score: integer('score').notNull().default(0), // 0-100 lead score

  // Tracking
  lastContactedAt: timestamp('last_contacted_at'),
  lastRespondedAt: timestamp('last_responded_at'),
  totalEmailsSent: integer('total_emails_sent').notNull().default(0),
  totalEmailsOpened: integer('total_emails_opened').notNull().default(0),
  totalEmailsClicked: integer('total_emails_clicked').notNull().default(0),

  // Custom data
  tags: jsonb('tags').$type<string[]>().default([]),
  customFields: jsonb('custom_fields').$type<Record<string, string>>().default({}),

  // Source tracking
  sourceId: text('source_id'), // Landing page ID, campaign ID, etc.
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),

  // Notes
  notes: text('notes'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// EMAIL SEQUENCES
// ============================================

export const sequenceStatusEnum = pgEnum('sequence_status', [
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
]);

export const emailSequences = pgTable('email_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  description: text('description'),
  status: sequenceStatusEnum('status').notNull().default('draft'),

  // Sequence settings
  triggerType: text('trigger_type').notNull().default('manual'), // manual, lead_captured, tag_added
  triggerConditions: jsonb('trigger_conditions').$type<Record<string, unknown>>().default({}),

  // Stats
  totalEnrolled: integer('total_enrolled').notNull().default(0),
  totalCompleted: integer('total_completed').notNull().default(0),
  totalReplied: integer('total_replied').notNull().default(0),

  // Created by
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// SEQUENCE STEPS (Email templates in sequence)
// ============================================

export const sequenceSteps = pgTable('sequence_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id')
    .notNull()
    .references(() => emailSequences.id, { onDelete: 'cascade' }),

  stepNumber: integer('step_number').notNull(),
  delayDays: integer('delay_days').notNull().default(0), // Days to wait after previous step
  delayHours: integer('delay_hours').notNull().default(0),

  // Email content
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text'),

  // Personalization variables
  // Supports: {{firstName}}, {{lastName}}, {{company}}, {{customField.xyz}}
  variables: jsonb('variables').$type<string[]>().default([]),

  // Conditions to skip this step
  skipConditions: jsonb('skip_conditions').$type<Record<string, unknown>>().default({}),

  // Stats for this step
  totalSent: integer('total_sent').notNull().default(0),
  totalOpened: integer('total_opened').notNull().default(0),
  totalClicked: integer('total_clicked').notNull().default(0),
  totalReplied: integer('total_replied').notNull().default(0),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// SEQUENCE ENROLLMENTS (Lead in a sequence)
// ============================================

export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'active',
  'paused',
  'completed',
  'replied',
  'bounced',
  'unsubscribed',
  'cancelled',
]);

export const sequenceEnrollments = pgTable('sequence_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id')
    .notNull()
    .references(() => emailSequences.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  status: enrollmentStatusEnum('status').notNull().default('active'),
  currentStep: integer('current_step').notNull().default(0),
  nextStepAt: timestamp('next_step_at'), // When to send next email

  // Tracking
  enrolledAt: timestamp('enrolled_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  pausedAt: timestamp('paused_at'),
  pauseReason: text('pause_reason'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// OUTREACH EMAILS (Individual emails sent)
// ============================================

export const emailStatusEnum = pgEnum('email_status', [
  'queued',
  'sending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'bounced',
  'failed',
  'unsubscribed',
]);

export const outreachEmails = pgTable('outreach_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),

  // Sequence info (optional - can be standalone email)
  sequenceId: uuid('sequence_id').references(() => emailSequences.id),
  enrollmentId: uuid('enrollment_id').references(() => sequenceEnrollments.id),
  stepNumber: integer('step_number'),

  // Email content
  fromEmail: text('from_email').notNull(),
  fromName: text('from_name'),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text'),

  // Status
  status: emailStatusEnum('status').notNull().default('queued'),
  scheduledFor: timestamp('scheduled_for'),
  sentAt: timestamp('sent_at'),

  // Tracking
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
  repliedAt: timestamp('replied_at'),
  bouncedAt: timestamp('bounced_at'),
  openCount: integer('open_count').notNull().default(0),
  clickCount: integer('click_count').notNull().default(0),

  // Provider response
  providerId: text('provider_id'), // Resend/SendGrid message ID
  providerResponse: jsonb('provider_response').$type<Record<string, unknown>>(),

  // Error handling
  lastError: text('last_error'),
  retryCount: integer('retry_count').notNull().default(0),

  // Created by
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// EMAIL PROVIDER CONNECTIONS
// ============================================

export const emailProviderEnum = pgEnum('email_provider', [
  'resend',
  'sendgrid',
  'mailgun',
  'ses',
  'smtp',
]);

export const emailConnections = pgTable('email_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  provider: emailProviderEnum('provider').notNull(),
  isDefault: boolean('is_default').notNull().default(false),

  // Connection settings
  apiKey: text('api_key'), // Encrypted in production
  fromEmail: text('from_email').notNull(),
  fromName: text('from_name'),
  replyToEmail: text('reply_to_email'),

  // Domain verification
  domain: text('domain'),
  domainVerified: boolean('domain_verified').notNull().default(false),

  // SMTP settings (if provider is 'smtp')
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpUser: text('smtp_user'),
  smtpPassword: text('smtp_password'),
  smtpSecure: boolean('smtp_secure').default(true),

  // Rate limits
  dailySendLimit: integer('daily_send_limit').default(1000),
  hourlySendLimit: integer('hourly_send_limit').default(100),
  sentToday: integer('sent_today').notNull().default(0),
  sentThisHour: integer('sent_this_hour').notNull().default(0),
  lastResetAt: timestamp('last_reset_at').notNull().defaultNow(),

  // Status
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at'),
  lastError: text('last_error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Type exports
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type EmailSequence = typeof emailSequences.$inferSelect;
export type NewEmailSequence = typeof emailSequences.$inferInsert;
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type NewSequenceStep = typeof sequenceSteps.$inferInsert;
export type SequenceEnrollment = typeof sequenceEnrollments.$inferSelect;
export type NewSequenceEnrollment = typeof sequenceEnrollments.$inferInsert;
export type OutreachEmail = typeof outreachEmails.$inferSelect;
export type NewOutreachEmail = typeof outreachEmails.$inferInsert;
export type EmailConnection = typeof emailConnections.$inferSelect;
export type NewEmailConnection = typeof emailConnections.$inferInsert;
