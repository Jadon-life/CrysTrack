import { sql } from 'drizzle-orm';
import { 
  pgTable, uuid, varchar, text, timestamp, boolean, 
  integer, decimal, jsonb, pgEnum, index, check, date, primaryKey, pgView, bigint, uniqueIndex, unique, type AnyPgColumn
} from 'drizzle-orm/pg-core';

// Enums
export const taskStatusEnum = pgEnum('task_status', ['pending', 'completed', 'missed', 'not_scheduled']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['upcoming', 'due_soon', 'due_today', 'overdue', 'completed', 'dropped']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);
export const moneyTypeEnum = pgEnum('money_type', ['income', 'expense', 'saving', 'transfer']);
export const reminderChannelEnum = pgEnum('reminder_channel', ['push', 'email']);
export const reminderStatusEnum = pgEnum('reminder_status', ['pending', 'sent', 'snoozed', 'cancelled']);
export const activityTypeEnum = pgEnum('activity_type', ['task_completed', 'task_missed', 'goal_checkin', 'assignment_completed', 'finance_entry', 'reminder_sent', 'focus_completed']);

// Users (extends Supabase Auth)
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  timezone: varchar('timezone', { length: 100 }).default('UTC'),
  locale: varchar('locale', { length: 10 }).default('en-US'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(),
  themePreference: varchar('theme_preference', { length: 50 }).default('adaptive'),
  reducedMotion: boolean('reduced_motion').default(false),
  weatherEnabled: boolean('weather_enabled').default(true),
  dndEnabled: boolean('dnd_enabled').default(false),
  dndStartTime: varchar('dnd_start_time', { length: 5 }),
  dndEndTime: varchar('dnd_end_time', { length: 5 }),
  reminderDefaults: jsonb('reminder_defaults'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Regular Tasks
export const recurringTasks = pgTable('recurring_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  active: boolean('active').default(true),
  preferredTime: varchar('preferred_time', { length: 5 }),
  category: varchar('category', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => ({
  userIdIdx: index('task_user_id_idx').on(table.userId),
}));

export const taskSchedules = pgTable('task_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => recurringTasks.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(), // 0=Sunday, 6=Saturday
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
});

export const taskOccurrences = pgTable('task_occurrences', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => recurringTasks.id, { onDelete: 'cascade' }),
  date: timestamp('date', { withTimezone: true }).notNull(),
  status: taskStatusEnum('status').default('pending'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  note: text('note'),
}, (table) => ({
  taskDateIdx: index('occurrence_task_date_idx').on(table.taskId, table.date),
}));

import type { GoalMilestone, GoalLifecycle, GoalProgressSource } from '@/types/goals';

// Goals
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  deadline: timestamp('deadline', { withTimezone: true }),
  measurable: boolean('measurable').default(false),
  targetValue: decimal('target_value', { precision: 10, scale: 2 }),
  progressValue: decimal('progress_value', { precision: 10, scale: 2 }),
  status: varchar('status', { length: 50 }).$type<GoalLifecycle | 'completed' | 'abandoned'>().default('active'),
  whyMatters: text('why_matters'),
  badge: varchar('badge', { length: 30 }).notNull().default('target'),
  reflection: text('reflection'),
  milestones: jsonb('milestones').$type<GoalMilestone[]>().notNull().default([]),
  taskIds: uuid('task_ids').array().notNull().default([]),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  routineTarget: integer('routine_target').notNull().default(10),
  financeTargetId: uuid('finance_target_id').references(() => financeTargets.id, { onDelete: 'set null' }),
  revision: integer('revision').notNull().default(0),
  progressSource: varchar('progress_source', { length: 30 }).$type<GoalProgressSource>().notNull().default('manual'),
  startingValue: decimal('starting_value', { precision: 12, scale: 2 }),
  progressMode: varchar('progress_mode', { length: 20 }).default('percentage'),
  progressUnit: varchar('progress_unit', { length: 50 }),
  aiCoaching: boolean('ai_coaching').default(false),
  checkinConfig: jsonb('checkin_config'),
  deadlineReminderConfig: jsonb('deadline_reminder_config'),
  category: varchar('category', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  userIdIdx: index('goal_user_id_idx').on(table.userId),
  routineTargetCheck: check('goals_routine_target_check', sql`${table.routineTarget} BETWEEN 1 AND 100000`),
  progressSourceCheck: check('goals_progress_source_check', sql`${table.progressSource} IN ('manual', 'milestones', 'tasks')`),
}));

export const goalCheckIns = pgTable('goal_checkins', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  durationMinutes: integer('duration_minutes'),
  responseText: text('response_text'),
  learnedText: text('learned_text'),
  blockers: text('blockers'),
  progressValue: decimal('progress_value', { precision: 12, scale: 2 }),
  progressPercent: decimal('progress_percent', { precision: 5, scale: 2 }),
  aiAnalysis: jsonb('ai_analysis'),
  occurrenceKey: text('occurrence_key'),
  occurrenceStartDate: date('occurrence_start_date'),
  occurrenceEndDate: date('occurrence_end_date'),
});

export const goalInsights = pgTable('goal_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  summary: text('summary'),
  riskLevel: varchar('risk_level', { length: 20 }),
  estimateText: text('estimate_text'),
  recommendations: text('recommendations'),
  modelVersion: varchar('model_version', { length: 50 }),
});

import type { AssignmentSubtask, AcademicKind } from '@/types/assignments';

// Assignments
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  priority: priorityEnum('priority').default('medium'),
  status: assignmentStatusEnum('status').default('upcoming'),
  courseCode: varchar('course_code', { length: 30 }),
  academicKind: varchar('academic_kind', { length: 20 }).$type<AcademicKind>().notNull().default('Assignment'),
  pointWeight: decimal('point_weight', { precision: 5, scale: 2 }),
  estimatedMinutes: integer('estimated_minutes'),
  workStartAt: timestamp('work_start_at', { withTimezone: true }),
  subtasks: jsonb('subtasks').$type<AssignmentSubtask[]>().notNull().default([]),
  finishedLate: boolean('finished_late').notNull().default(false),
  revision: integer('revision').notNull().default(0),
  reminderConfig: jsonb('reminder_config'),
  category: varchar('category', { length: 100 }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdIdx: index('assignment_user_id_idx').on(table.userId),
  deadlineIdx: index('assignment_deadline_idx').on(table.deadline),
  academicKindCheck: check('assignment_academic_kind_check', sql`${table.academicKind} IN ('Assignment','Test','Lab','Project')`),
  pointWeightCheck: check('assignment_point_weight_check', sql`${table.pointWeight} BETWEEN 0 AND 100`),
  estimatedMinutesCheck: check('assignment_estimated_minutes_check', sql`${table.estimatedMinutes} BETWEEN 0 AND 60000`),
  subtaskArrayCheck: check('assignment_subtasks_array_check', sql`jsonb_typeof(${table.subtasks}) = 'array' AND jsonb_array_length(${table.subtasks}) <= 50`),
}));

// Finance: all stored amounts are NGN DECIMAL(12,2), including USD wallet valuations.
export const wealthAccounts = pgTable('wealth_accounts', {
 id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull(), name: varchar('name',{length:100}).notNull(), kind: varchar('kind',{length:20}).notNull(), openingBalance: decimal('opening_balance',{precision:12,scale:2}).notNull().default('0'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, (t)=>({userIdx:index('wealth_accounts_user_idx').on(t.userId),nameCheck:check('wealth_accounts_name_check',sql`length(btrim(${t.name}))>0`),kindCheck:check('wealth_accounts_kind_check',sql`${t.kind} IN ('cash','bank','savings','usd_wallet')`)}));
export const wealthBudgetCaps = pgTable('wealth_budget_caps', {
 id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull(),month:date('month').notNull(),category:varchar('category',{length:100}).notNull(),cap:decimal('cap',{precision:12,scale:2}).notNull(),
}, (t)=>({monthCheck:check('wealth_budget_caps_month_check',sql`extract(day from ${t.month})=1`),categoryCheck:check('wealth_budget_caps_category_check',sql`length(btrim(${t.category}))>0`),capCheck:check('wealth_budget_caps_cap_check',sql`${t.cap}>=0`),ownerCategory:unique('wealth_budget_caps_user_id_month_category_key').on(t.userId,t.month,t.category)}));
export const wealthBills = pgTable('wealth_bills', {
 id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull(),title:varchar('title',{length:150}).notNull(),amount:decimal('amount',{precision:12,scale:2}).notNull(),nextDue:date('next_due').notNull(),frequency:varchar('frequency',{length:20}).notNull(),category:varchar('category',{length:100}).notNull().default('Bills'),active:boolean('active').notNull().default(true),lastPaidOn:date('last_paid_on'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, (t)=>({titleCheck:check('wealth_bills_title_check',sql`length(btrim(${t.title}))>0`),amountCheck:check('wealth_bills_amount_check',sql`${t.amount}>0`),frequencyCheck:check('wealth_bills_frequency_check',sql`${t.frequency} IN ('weekly','monthly','quarterly','yearly')`)}));
export const wealthCircles = pgTable('wealth_circles', {
 id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull(),title:varchar('title',{length:150}).notNull(),contribution:decimal('contribution',{precision:12,scale:2}).notNull(),startsOn:date('starts_on').notNull(),intervalDays:integer('interval_days').notNull(),members:jsonb('members').$type<string[]>().notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, (t)=>({titleCheck:check('wealth_circles_title_check',sql`length(btrim(${t.title}))>0`),amountCheck:check('wealth_circles_contribution_check',sql`${t.contribution}>0`),daysCheck:check('wealth_circles_interval_days_check',sql`${t.intervalDays} BETWEEN 1 AND 366`),membersCheck:check('wealth_circles_members_check',sql`jsonb_typeof(${t.members})='array' AND jsonb_array_length(${t.members}) BETWEEN 2 AND 50`)}));
export const wealthCircleContributions = pgTable('wealth_circle_contributions', {
 id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull(),circleId:uuid('circle_id').notNull().references(()=>wealthCircles.id,{onDelete:'cascade'}),memberIndex:integer('member_index').notNull(),round:integer('round').notNull(),amount:decimal('amount',{precision:12,scale:2}).notNull(),paidOn:date('paid_on').notNull(),
}, (t)=>({memberCheck:check('wealth_circle_contributions_member_index_check',sql`${t.memberIndex}>=0`),roundCheck:check('wealth_circle_contributions_round_check',sql`${t.round}>=1`),amountCheck:check('wealth_circle_contributions_amount_check',sql`${t.amount}>0`),memberTurn:unique('wealth_circle_contributions_circle_id_member_index_round_key').on(t.circleId,t.memberIndex,t.round)}));
export const financeTargets = pgTable('finance_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  lockedUntil: date('locked_until'),
  targetAmount: decimal('target_amount', { precision: 12, scale: 2 }).notNull(),
  currentAmount: decimal('current_amount', { precision: 12, scale: 2 }).default('0'),
  deadline: timestamp('deadline', { withTimezone: true }),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdIdx: index('finance_target_user_id_idx').on(table.userId),
}));

export const moneyEntries = pgTable('money_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: moneyTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  date: timestamp('date', { withTimezone: true }).defaultNow(),
  source: varchar('source', { length: 255 }),
  category: varchar('category', { length: 100 }),
  note: text('note'),
  targetId: uuid('target_id').references(() => financeTargets.id, { onDelete: 'set null' }),
  billId:uuid('bill_id').references(()=>wealthBills.id,{onDelete:'restrict'}),billDueOn:date('bill_due_on'),
  flowKind: varchar('flow_kind',{length:40}), debtId:uuid('debt_id'), expectedFlowId:uuid('expected_flow_id'),
  accountId:uuid('account_id').references(()=>wealthAccounts.id,{onDelete:'restrict'}),destinationAccountId:uuid('destination_account_id').references(()=>wealthAccounts.id,{onDelete:'restrict'}),parentEntryId:uuid('parent_entry_id').references(():AnyPgColumn=>moneyEntries.id,{onDelete:'restrict'}),importKey:varchar('import_key',{length:200}),deletedAt:timestamp('deleted_at',{withTimezone:true}),revision:integer('revision').notNull().default(1),savingsBps:integer('savings_bps').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  importUnique:uniqueIndex('money_import_unique').on(table.userId,table.accountId,table.importKey).where(sql`${table.importKey} IS NOT NULL`),
  childUnique:uniqueIndex('money_child_unique').on(table.parentEntryId).where(sql`${table.parentEntryId} IS NOT NULL`),
  billUnique:uniqueIndex('money_bill_unique').on(table.billId,table.billDueOn).where(sql`${table.billId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  savingsRateCheck:check('money_entries_savings_bps_check',sql`${table.savingsBps} BETWEEN 0 AND 10000`),
  userIdIdx: index('money_entry_user_id_idx').on(table.userId),
}));

// Notifications
export const reminders = pgTable('reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(), // task, goal, assignment
  entityId: uuid('entity_id').notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  channel: reminderChannelEnum('channel').default('push'),
  status: reminderStatusEnum('status').default('pending'),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  dndRespected: boolean('dnd_respected').default(true),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('keys_p256dh').notNull(),
  auth: text('keys_auth').notNull(),
  deviceLabel: varchar('device_label', { length: 255 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
});

// Activity / History
export const activityEvents = pgTable('activity_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: activityTypeEnum('type').notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  metadataJson: jsonb('metadata_json'),
}, (table) => ({
  userIdIdx: index('activity_user_id_idx').on(table.userId),
  createdAtIdx: index('activity_created_at_idx').on(table.createdAt),
}));

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type RecurringTask = typeof recurringTasks.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type FinanceTarget = typeof financeTargets.$inferSelect;
export type MoneyEntry = typeof moneyEntries.$inferSelect;
export type GoalCheckIn = typeof goalCheckIns.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;

// Daily rhythm: each table is owner-scoped by migration 0008.
import type { RitualRef } from '@/types/rhythm';
export const dailyRituals = pgTable('daily_rituals', {
 userId:uuid('user_id').notNull(),day:date('day').notNull(),topThree:jsonb('top_three').$type<RitualRef[]>().notNull().default([]),deferred:jsonb('deferred').$type<RitualRef[]>().notNull().default([]),deferredTo:date('deferred_to'),capacityMinutes:integer('capacity_minutes').notNull().default(480),wins:text('wins').notNull().default(''),reflection:text('reflection').notNull().default(''),weeklyReflection:text('weekly_reflection').notNull().default(''),nextFocus:uuid('next_focus').array().notNull().default([]),morningAt:timestamp('morning_at',{withTimezone:true}),eveningAt:timestamp('evening_at',{withTimezone:true}),reviewAt:timestamp('review_at',{withTimezone:true}),revision:integer('revision').notNull().default(0)
},t=>({pk:primaryKey({columns:[t.userId,t.day]})}));
export const taskTimeboxes=pgTable('task_timeboxes',{id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull(),taskId:uuid('task_id').notNull().references(()=>recurringTasks.id,{onDelete:'cascade'}),occurrenceDay:date('occurrence_day').notNull(),startsAt:timestamp('starts_at',{withTimezone:true}).notNull(),endsAt:timestamp('ends_at',{withTimezone:true}).notNull()},t=>({taskDay:uniqueIndex('task_timeboxes_user_id_task_id_occurrence_day_key').on(t.userId,t.taskId,t.occurrenceDay)}));
export const taskFocusSessions=pgTable('task_focus_sessions',{id:uuid('id').primaryKey(),userId:uuid('user_id').notNull(),taskId:uuid('task_id').notNull().references(()=>recurringTasks.id,{onDelete:'cascade'}),plannedMinutes:integer('planned_minutes').notNull(),elapsedSeconds:integer('elapsed_seconds').notNull().default(0),status:varchar('status',{length:20}).$type<'running'|'paused'|'completed'|'cancelled'>().notNull().default('running'),startedAt:timestamp('started_at',{withTimezone:true}).notNull().default(sql`clock_timestamp()`),resumedAt:timestamp('resumed_at',{withTimezone:true}).default(sql`clock_timestamp()`),completedAt:timestamp('completed_at',{withTimezone:true})},t=>({oneActive:uniqueIndex('one_active_focus_per_user').on(t.userId).where(sql`${t.status} IN ('running','paused')`),ownerCompleted:index('focus_owner_completed').on(t.userId,t.completedAt)}));
export type DailyRitualRow=typeof dailyRituals.$inferSelect;
export type TaskTimeboxRow=typeof taskTimeboxes.$inferSelect;
export type TaskFocusRow=typeof taskFocusSessions.$inferSelect;

export const taskFocusTotals=pgView('task_focus_totals',{userId:uuid('user_id'),taskId:uuid('task_id'),minutes:bigint('minutes',{mode:'number'})}).existing();
export type TaskFocusTotal=typeof taskFocusTotals.$inferSelect;

export const wealthSettings = pgTable('wealth_settings', {
 userId:uuid('user_id').primaryKey(),spendSaveBps:integer('spend_save_bps').notNull().default(0),targetId:uuid('target_id').references(()=>financeTargets.id,{onDelete:'restrict'}),lowBalance:decimal('low_balance',{precision:12,scale:2}).notNull().default('0'),
}, (t)=>({rateCheck:check('wealth_settings_spend_save_bps_check',sql`${t.spendSaveBps} BETWEEN 0 AND 10000`),lowCheck:check('wealth_settings_low_balance_check',sql`${t.lowBalance}>=0`)}));
