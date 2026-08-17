import { 
  pgTable, uuid, varchar, text, timestamp, boolean, 
  integer, decimal, jsonb, pgEnum, index 
} from 'drizzle-orm/pg-core';

// Enums
export const taskStatusEnum = pgEnum('task_status', ['pending', 'completed', 'missed', 'not_scheduled']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['upcoming', 'due_soon', 'due_today', 'overdue', 'completed']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);
export const moneyTypeEnum = pgEnum('money_type', ['income', 'expense', 'saving', 'transfer']);
export const reminderChannelEnum = pgEnum('reminder_channel', ['push', 'email']);
export const reminderStatusEnum = pgEnum('reminder_status', ['pending', 'sent', 'snoozed', 'cancelled']);
export const activityTypeEnum = pgEnum('activity_type', ['task_completed', 'task_missed', 'goal_checkin', 'assignment_completed', 'finance_entry', 'reminder_sent']);

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdIdx: index('assignment_user_id_idx').on(table.userId),
  deadlineIdx: index('assignment_deadline_idx').on(table.deadline),
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
