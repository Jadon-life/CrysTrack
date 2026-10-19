import { 
  pgTable, uuid, varchar, text, timestamp, boolean, 
  integer, decimal, jsonb, pgEnum, index, date, bigint, primaryKey, uniqueIndex, foreignKey, pgSchema
} from 'drizzle-orm/pg-core';

// Enums
export const taskStatusEnum = pgEnum('task_status', ['pending', 'completed', 'skipped', 'missed', 'not_scheduled']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['upcoming', 'due_soon', 'due_today', 'overdue', 'completed']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);
export const moneyTypeEnum = pgEnum('money_type', ['income', 'expense', 'saving', 'transfer']);
export const reminderChannelEnum = pgEnum('reminder_channel', ['push', 'email']);
export const reminderStatusEnum = pgEnum('reminder_status', ['pending', 'sent', 'snoozed', 'cancelled']);
export const activityTypeEnum = pgEnum('activity_type', ['task_completed', 'task_skipped', 'task_missed', 'goal_checkin', 'assignment_completed', 'finance_entry', 'reminder_sent']);

// Users (extends Supabase Auth)
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  timezone: varchar('timezone', { length: 100 }).default('UTC'),
  currentTimezone: varchar('current_timezone', { length: 100 }),
  schedulingTimezone: varchar('scheduling_timezone', { length: 100 }),
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
  status: varchar('status', { length: 50 }).default('active'),
  category: varchar('category', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  userIdIdx: index('goal_user_id_idx').on(table.userId),
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

// Assignments
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  priority: priorityEnum('priority').default('medium'),
  status: assignmentStatusEnum('status').default('upcoming'),
  category: varchar('category', { length: 100 }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  revision: integer('revision').notNull().default(1),
  reminderVersion: integer('reminder_version').notNull().default(1),
  reminderConfig: jsonb('reminder_config').$type<{ enabled: boolean; channels: string[]; offsetMinutes: number[] }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdIdx: index('assignment_user_id_idx').on(table.userId),
  deadlineIdx: index('assignment_deadline_idx').on(table.deadline),
  ownerDeadlineIdx: index('assignment_owner_deadline_id_idx').on(table.userId, table.deadline, table.id),
}));

// Finance
export const financeTargets = pgTable('finance_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
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

// Durable daily records: routine_key deliberately has no FK to recurring_tasks.
export const dailyTrackingStates = pgTable('daily_tracking_states', {
 userId: uuid('user_id').primaryKey(), initialTimezone: text('initial_timezone').notNull(),
 schedulingTimezone: text('scheduling_timezone').notNull(), activatedAt: timestamp('activated_at', {withTimezone:true}).notNull(),
 activationDay: date('activation_day').notNull(), captureStartsOn: date('capture_starts_on').notNull(),
 recoveryCursor: date('recovery_cursor').notNull(), revision: integer('revision').notNull().default(1),
 dataRevision: bigint('data_revision', {mode:'number'}).notNull().default(1),
});
export const dailyTimezoneTransitions = pgTable('daily_timezone_transitions', {
 id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull(), fromTimezone: text('from_timezone').notNull(),
 toTimezone: text('to_timezone').notNull(), previousDay: date('previous_day').notNull(), firstDay: date('first_day').notNull(),
 requestedAt: timestamp('requested_at',{withTimezone:true}).notNull(), effectiveAt: timestamp('effective_at',{withTimezone:true}).notNull(),
 status: text('status').$type<'pending'|'applied'>().notNull().default('pending'), revision: integer('revision').notNull().default(1),
});
export const routineScheduleVersions = pgTable('routine_schedule_versions', {
 id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull(), routineKey: uuid('routine_key').notNull(),
 version: integer('version').notNull(), effectiveFrom: date('effective_from').notNull(), enabled: boolean('enabled').notNull(),
 title: text('title').notNull(), description: text('description'), preferredTime: text('preferred_time'), category: text('category'),
 schedule: jsonb('schedule').$type<{weekday:number;start:string|null;end:string|null}[]>().notNull(),
 createdAt: timestamp('created_at',{withTimezone:true}).notNull(),
}, t=>({versionUnique:uniqueIndex('routine_schedule_versions_user_id_routine_key_version_key').on(t.userId,t.routineKey,t.version)}));
export const dailyRecords = pgTable('daily_records', {
 id: uuid('id').notNull().unique().defaultRandom(), userId: uuid('user_id').notNull(), dayKey: date('day_key').notNull(),
 timezone: text('timezone').notNull(), policyVersion: integer('policy_version').notNull().default(1),
 evidence: text('evidence').$type<'verified'|'incomplete'>().notNull(), evidenceReason: text('evidence_reason'), expectedCount: integer('expected_count').notNull(),
 closeStatus: text('close_status').$type<'open'|'closed'>().notNull().default('open'),
 opensAt: timestamp('opens_at',{withTimezone:true}).notNull(), closesAt: timestamp('closes_at',{withTimezone:true}).notNull(),
 materializedAt: timestamp('materialized_at',{withTimezone:true}).notNull(), closedAt: timestamp('closed_at',{withTimezone:true}),
 revision: integer('revision').notNull().default(1),
},t=>({pk:primaryKey({columns:[t.userId,t.dayKey]})}));
export const dailyRoutineRecords = pgTable('daily_routine_records', {
 id: uuid('id').notNull().unique().defaultRandom(), userId: uuid('user_id').notNull(), dayKey: date('day_key').notNull(), routineKey: uuid('routine_key').notNull(),
 scheduleVersionId: uuid('schedule_version_id').notNull().references(()=>routineScheduleVersions.id),
 title: text('title').notNull(), description: text('description'), preferredTime: text('preferred_time'), category: text('category'),
 status: text('status').$type<'pending'|'completed'|'skipped'|'missed'>().notNull().default('pending'),
 completedAt: timestamp('completed_at',{withTimezone:true}), revision: integer('revision').notNull().default(1),
 compatibilityOccurrenceId: uuid('compatibility_occurrence_id'), activityEventId: uuid('activity_event_id').notNull().defaultRandom(),
 legacyConflict: boolean('legacy_conflict').notNull().default(false),
},t=>({pk:primaryKey({columns:[t.userId,t.dayKey,t.routineKey]})}));
export const dailyMutationRequests = pgTable('daily_mutation_requests', {
 userId: uuid('user_id').notNull(), requestId: uuid('request_id').notNull(), payload: jsonb('payload').notNull(), result: jsonb('result').notNull(),
 revision: integer('revision').notNull().default(1), createdAt: timestamp('created_at',{withTimezone:true}).notNull(),
},t=>({pk:primaryKey({columns:[t.userId,t.requestId]})}));
export const dailyNotes = pgTable('daily_notes', {
 userId: uuid('user_id').notNull(), dayKey: date('day_key').notNull(), body: text('body').notNull(), revision: integer('revision').notNull(),
 updatedAt: timestamp('updated_at',{withTimezone:true}).notNull(),
},t=>({pk:primaryKey({columns:[t.userId,t.dayKey]})}));
export type DailyRecord = typeof dailyRecords.$inferSelect;
export type DailyRoutineRecord = typeof dailyRoutineRecords.$inferSelect;
export type RoutineScheduleVersion = typeof routineScheduleVersions.$inferSelect;
export type DailyMutationRequest = typeof dailyMutationRequests.$inferSelect;
export type DailyNote = typeof dailyNotes.$inferSelect;
export type DailyTrackingState = typeof dailyTrackingStates.$inferSelect;
export type DailyTimezoneTransition = typeof dailyTimezoneTransitions.$inferSelect;

// September crystal ledger; separate from all legacy hosted gamification objects.
export const sep28CrystalPreferences = pgTable('sep28_crystal_preferences', {
 userId: uuid('user_id').primaryKey(), enabled: boolean('enabled').notNull().default(true),
 activatedAt: timestamp('activated_at',{withTimezone:true}).notNull(), enabledSince: timestamp('enabled_since',{withTimezone:true}).notNull(),
 revision: integer('revision').notNull().default(1),
});
export type CrystalAwardKind = 'task'|'day'|'goal'|'assignment'|'spending';
export const sep28CrystalAwards = pgTable('sep28_crystal_awards', {
 userId: uuid('user_id').notNull().references(()=>sep28CrystalPreferences.userId,{onDelete:'cascade'}),
 kind: text('kind').$type<CrystalAwardKind>().notNull(), sourceKey: text('source_key').notNull(),
 eligible: boolean('eligible').notNull(), allowedSource: boolean('allowed_source').notNull().default(true),
 balance: integer('balance').notNull(), revision: integer('revision').notNull(),
},t=>({pk:primaryKey({columns:[t.userId,t.kind,t.sourceKey]})}));
export const sep28CrystalEvents = pgTable('sep28_crystal_events', {
 id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull(), kind: text('kind').$type<CrystalAwardKind>().notNull(),
 sourceKey: text('source_key').notNull(), revision: integer('revision').notNull(), delta: integer('delta').notNull(),
 createdAt: timestamp('created_at',{withTimezone:true}).notNull(),
},t=>({eventUnique:uniqueIndex('sep28_crystal_events_user_id_kind_source_key_revision_key').on(t.userId,t.kind,t.sourceKey,t.revision), ownerIdx:index('sep28_crystal_events_owner').on(t.userId), sourceFk:foreignKey({columns:[t.userId,t.kind,t.sourceKey],foreignColumns:[sep28CrystalAwards.userId,sep28CrystalAwards.kind,sep28CrystalAwards.sourceKey]}).onDelete('cascade')}));
export const sep28CrystalMoments = pgTable('sep28_crystal_moments', {
 userId: uuid('user_id').notNull().references(()=>sep28CrystalPreferences.userId,{onDelete:'cascade'}),
 level: integer('level').notNull(), reachedAt: timestamp('reached_at',{withTimezone:true}).notNull(), claimedAt: timestamp('claimed_at',{withTimezone:true}),
},t=>({pk:primaryKey({columns:[t.userId,t.level]})}));
export type Sep28CrystalPreference = typeof sep28CrystalPreferences.$inferSelect;
export type Sep28CrystalAward = typeof sep28CrystalAwards.$inferSelect;
export type Sep28CrystalEvent = typeof sep28CrystalEvents.$inferSelect;
export type Sep28CrystalMoment = typeof sep28CrystalMoments.$inferSelect;

// Private owner-bound assignment identity tombstones: no application-role access.
export const assignmentIdentities = pgSchema('crystrack_assignments').table('identities', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
});
export type AssignmentIdentity = typeof assignmentIdentities.$inferSelect;

// Piece 6A local-only candidate: canonical NGN limits, owner SELECT/RPC writes.
export const wealthMonthlyBudgets = pgTable('wealth_monthly_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  month: date('month').notNull(),
  category: text('category').notNull(),
  currency: text('currency').notNull().default('NGN'),
  limitAmount: decimal('limit_amount', { precision: 12, scale: 2 }).notNull(),
  active: boolean('active').notNull().default(true),
  revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}, t => ({ ownerMonthCategory: uniqueIndex('wealth_budget_owner_month_category_idx').on(t.userId,t.month,t.category) }));
export const wealthBudgetRequests = pgSchema('crystrack_budgets').table('requests', {
  userId: uuid('user_id').notNull(), requestId: uuid('request_id').notNull(),
  payload: jsonb('payload').notNull(), result: jsonb('result').notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, t=>({pk:primaryKey({columns:[t.userId,t.requestId]})}));
export type WealthMonthlyBudget = typeof wealthMonthlyBudgets.$inferSelect;
export type WealthBudgetRequest = typeof wealthBudgetRequests.$inferSelect;
