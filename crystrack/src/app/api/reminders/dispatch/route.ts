import { NextResponse } from 'next/server';
import webPush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  clockMinutes,
  dateKeyForInstant,
  dueAssignmentOffset,
  isWithinDnd,
  localClock,
  minuteMatches,
  normaliseChannels,
  previousDateKey,
  weekdayForDateKey,
} from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DeliveryPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

function authorised(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === expected;
}

function defaultTaskConfig() {
  return { enabled: true, channels: ['push'], beforeMinutes: 15, atPreferredTime: true, followUpMinutes: [120], endOfDayReminder: true };
}

async function deliver(
  admin: ReturnType<typeof createAdminClient>,
  input: { userId: string; entityType: string; entityId: string; deliveryKey: string; scheduledFor: string; channels: string[]; payload: DeliveryPayload },
) {
  const { data: reserved, error: reserveError } = await admin
    .from('reminder_deliveries')
    .insert({
      user_id: input.userId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      delivery_key: input.deliveryKey,
      scheduled_for: input.scheduledFor,
      channels: input.channels,
      payload: input.payload,
      status: 'processing',
    })
    .select('id')
    .single();

  if (reserveError) {
    if (reserveError.code === '23505') return { duplicate: true, sent: [] as string[], failed: [] as string[] };
    throw reserveError;
  }

  const sent: string[] = [];
  const failed: string[] = [];
  const errors: string[] = [];

  if (input.channels.includes('push')) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      failed.push('push');
      errors.push('Push keys or VAPID subject are not configured');
    } else {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      const { data: subscriptions } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, keys_p256dh, keys_auth')
        .eq('user_id', input.userId)
        .eq('is_active', true);

      if (!subscriptions?.length) {
        failed.push('push');
        errors.push('No active push subscription');
      } else {
        let anyPush = false;
        for (const subscription of subscriptions) {
          try {
            await webPush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.keys_p256dh, auth: subscription.keys_auth },
            }, JSON.stringify(input.payload));
            anyPush = true;
          } catch (error: any) {
            if (error?.statusCode === 404 || error?.statusCode === 410) {
              await admin.from('push_subscriptions').update({ is_active: false }).eq('id', subscription.id);
            }
            errors.push(`Push: ${error?.message || 'delivery failed'}`);
          }
        }
        (anyPush ? sent : failed).push('push');
      }
    }
  }

  if (input.channels.includes('telegram')) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const { data: connection } = await admin
      .from('telegram_connections')
      .select('chat_id')
      .eq('user_id', input.userId)
      .eq('is_active', true)
      .maybeSingle();

    if (!token || !connection?.chat_id) {
      failed.push('telegram');
      errors.push(!token ? 'Telegram bot is not configured' : 'Telegram is not connected');
    } else {
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: connection.chat_id,
            text: `⏰ ${input.payload.title}\n${input.payload.body}`,
          }),
        });
        if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
        sent.push('telegram');
      } catch (error: any) {
        failed.push('telegram');
        errors.push(`Telegram: ${error?.message || 'delivery failed'}`);
      }
    }
  }

  const uniqueSent = Array.from(new Set(sent));
  const uniqueFailed = Array.from(new Set(failed));
  const status = uniqueSent.length && uniqueFailed.length ? 'partial' : uniqueSent.length ? 'sent' : 'failed';

  await admin.from('reminder_deliveries').update({
    sent_channels: uniqueSent,
    failed_channels: uniqueFailed,
    status,
    last_error: errors.join('; ') || null,
  }).eq('id', reserved.id);

  if (uniqueSent.length) {
    await admin.from('activity_events').insert({
      user_id: input.userId,
      type: 'reminder_sent',
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata_json: { title: input.payload.title, delivery_key: input.deliveryKey, channels: uniqueSent },
    });
  }

  return { duplicate: false, sent: uniqueSent, failed: uniqueFailed };
}

async function occurrenceStatus(admin: ReturnType<typeof createAdminClient>, taskId: string, dateKey: string) {
  const start = `${dateKey}T00:00:00.000Z`;
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  const { data } = await admin
    .from('task_occurrences')
    .select('id, status')
    .eq('task_id', taskId)
    .gte('date', start)
    .lt('date', next.toISOString())
    .maybeSingle();
  return data || null;
}

async function closeMissedTasks(admin: ReturnType<typeof createAdminClient>, userId: string, todayKey: string) {
  const yesterdayKey = previousDateKey(todayKey);
  const yesterdayWeekday = weekdayForDateKey(yesterdayKey);
  const { data: tasks } = await admin
    .from('recurring_tasks')
    .select('id, title, task_schedules(weekday)')
    .eq('user_id', userId)
    .eq('active', true)
    .is('archived_at', null);

  for (const task of tasks || []) {
    if (!(task.task_schedules || []).some((item: any) => item.weekday === yesterdayWeekday)) continue;
    const existing = await occurrenceStatus(admin, task.id, yesterdayKey);
    if (existing) continue;

    const { data: occurrence, error } = await admin.from('task_occurrences').insert({
      task_id: task.id,
      date: `${yesterdayKey}T00:00:00.000Z`,
      status: 'missed',
    }).select('id').single();

    if (!error && occurrence) {
      await admin.from('activity_events').insert({
        user_id: userId,
        type: 'task_missed',
        entity_type: 'task',
        entity_id: task.id,
        metadata_json: { title: task.title, date: yesterdayKey, status: 'missed' },
      });
    }
  }
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized scheduler' }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('user_id, timezone, current_timezone, current_city');
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const summary = { users: 0, attempted: 0, sent: 0, failed: 0 };

  for (const profile of profiles || []) {
    summary.users += 1;
    const userId = profile.user_id;
    const timezone = profile.current_timezone || profile.timezone || 'UTC';
    const clock = localClock(now, timezone);
    const { data: preferences } = await admin.from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
    const inDnd = isWithinDnd(clock.minuteOfDay, Boolean(preferences?.dnd_enabled), preferences?.dnd_start_time, preferences?.dnd_end_time);
    const defaultChannels = normaliseChannels(preferences?.default_reminder_channels, ['push']);

    if (clock.minuteOfDay < 10) await closeMissedTasks(admin, userId, clock.dateKey);

    const { data: tasks } = await admin
      .from('recurring_tasks')
      .select('id, title, preferred_time, reminder_config, task_schedules(weekday)')
      .eq('user_id', userId)
      .eq('active', true)
      .is('archived_at', null);

    for (const task of tasks || []) {
      if (!(task.task_schedules || []).some((item: any) => item.weekday === clock.weekday)) continue;
      const occurrence = await occurrenceStatus(admin, task.id, clock.dateKey);
      if (occurrence && ['completed', 'skipped', 'missed'].includes(occurrence.status)) continue;

      const config = { ...defaultTaskConfig(), ...(task.reminder_config || {}) };
      if (config.enabled === false || inDnd) continue;
      const channels = normaliseChannels(config.channels, defaultChannels);
      const preferred = clockMinutes(task.preferred_time);
      const slots: Array<{ key: string; minute: number; body: string }> = [];

      if (preferred != null) {
        if (Number(config.beforeMinutes) > 0) slots.push({ key: `before-${config.beforeMinutes}`, minute: Math.max(0, preferred - Number(config.beforeMinutes)), body: `${task.title} is coming up at ${task.preferred_time}.` });
        if (config.atPreferredTime !== false) slots.push({ key: 'preferred', minute: preferred, body: `${task.title} — ready when you are.` });
        for (const follow of Array.isArray(config.followUpMinutes) ? config.followUpMinutes : []) {
          const minute = preferred + Number(follow);
          if (minute < 24 * 60) slots.push({ key: `follow-${follow}`, minute, body: `${task.title} is still open for today.` });
        }
      } else {
        const untimed = clockMinutes(preferences?.untimed_task_reminder_time) ?? 10 * 60;
        slots.push({ key: 'untimed', minute: untimed, body: `${task.title} is on your list for today.` });
      }

      if (config.endOfDayReminder !== false) {
        const evening = clockMinutes(preferences?.incomplete_task_reminder_time) ?? 19 * 60;
        slots.push({ key: 'end-of-day', minute: evening, body: `${task.title} is still incomplete today.` });
      }

      for (const slot of slots) {
        if (!minuteMatches(clock.minuteOfDay, slot.minute)) continue;
        summary.attempted += 1;
        const result = await deliver(admin, {
          userId,
          entityType: 'task',
          entityId: task.id,
          deliveryKey: `task:${task.id}:${clock.dateKey}:${slot.key}`,
          scheduledFor: now.toISOString(),
          channels,
          payload: { title: task.title, body: slot.body, url: '/tasks', tag: `task-${task.id}-${clock.dateKey}` },
        });
        summary.sent += result.sent.length ? 1 : 0;
        summary.failed += !result.sent.length && !result.duplicate ? 1 : 0;
      }
    }

    const { data: assignments } = await admin
      .from('assignments')
      .select('id, title, deadline, priority, reminder_config')
      .eq('user_id', userId)
      .neq('status', 'completed');

    for (const assignment of assignments || []) {
      const config = assignment.reminder_config || { enabled: true, channels: defaultChannels, offsetMinutes: [1440, 120, 0] };
      if (config.enabled === false) continue;
      const channels = normaliseChannels(config.channels, defaultChannels);
      const deadline = new Date(assignment.deadline);
      const diffMinutes = (deadline.getTime() - now.getTime()) / 60_000;
      const urgent = assignment.priority === 'urgent';

      for (const rawOffset of Array.isArray(config.offsetMinutes) ? config.offsetMinutes : [1440, 120, 0]) {
        const offset = Number(rawOffset);
        if (!Number.isFinite(offset) || !dueAssignmentOffset(diffMinutes, offset)) continue;
        if (inDnd && !urgent) continue;
        const label = offset === 0 ? 'due now' : offset >= 1440 ? `${Math.round(offset / 1440)} day${offset >= 2880 ? 's' : ''} remaining` : `${Math.round(offset / 60)} hours remaining`;
        summary.attempted += 1;
        const result = await deliver(admin, {
          userId,
          entityType: 'assignment',
          entityId: assignment.id,
          deliveryKey: `assignment:${assignment.id}:offset:${offset}`,
          scheduledFor: now.toISOString(),
          channels,
          payload: { title: assignment.title, body: `Assignment ${label}.`, url: '/assignments', tag: `assignment-${assignment.id}-${offset}` },
        });
        summary.sent += result.sent.length ? 1 : 0;
        summary.failed += !result.sent.length && !result.duplicate ? 1 : 0;
      }
    }

    const { data: goals } = await admin
      .from('goals')
      .select('id, title, deadline, checkin_config, deadline_reminder_config')
      .eq('user_id', userId)
      .eq('status', 'active');

    for (const goal of goals || []) {
      const checkinConfig = goal.checkin_config || {};
      const frequency = checkinConfig.frequency || 'weekly';
      const days = Array.isArray(checkinConfig.days) ? checkinConfig.days.map(Number) : [];
      const checkinDue = frequency === 'daily' || ((frequency === 'weekly' || frequency === 'specific') && days.includes(clock.weekday));
      const checkinMinute = clockMinutes(checkinConfig.time) ?? 20 * 60;

      if (checkinDue && minuteMatches(clock.minuteOfDay, checkinMinute) && !inDnd) {
        const start = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
        const { data: recentCheckins } = await admin.from('goal_checkins').select('created_at').eq('goal_id', goal.id).gte('created_at', start).order('created_at', { ascending: false }).limit(5);
        const alreadyDone = (recentCheckins || []).some((item: any) => dateKeyForInstant(new Date(item.created_at), timezone) === clock.dateKey);
        if (!alreadyDone) {
          summary.attempted += 1;
          const result = await deliver(admin, {
            userId,
            entityType: 'goal',
            entityId: goal.id,
            deliveryKey: `goal:${goal.id}:checkin:${clock.dateKey}`,
            scheduledFor: now.toISOString(),
            channels: normaliseChannels(checkinConfig.channels, defaultChannels),
            payload: { title: `Goal check-in: ${goal.title}`, body: 'What did you move forward today?', url: '/goals', tag: `goal-${goal.id}-${clock.dateKey}` },
          });
          summary.sent += result.sent.length ? 1 : 0;
          summary.failed += !result.sent.length && !result.duplicate ? 1 : 0;
        }
      }

      if (goal.deadline) {
        const deadlineConfig = goal.deadline_reminder_config || {};
        if (deadlineConfig.enabled !== false) {
          const diffMinutes = (new Date(goal.deadline).getTime() - now.getTime()) / 60_000;
          for (const rawOffset of Array.isArray(deadlineConfig.offsetMinutes) ? deadlineConfig.offsetMinutes : [10080, 4320, 1440]) {
            const offset = Number(rawOffset);
            if (!Number.isFinite(offset) || !dueAssignmentOffset(diffMinutes, offset) || inDnd) continue;
            const days = Math.max(1, Math.round(offset / 1440));
            summary.attempted += 1;
            const result = await deliver(admin, {
              userId,
              entityType: 'goal',
              entityId: goal.id,
              deliveryKey: `goal:${goal.id}:deadline:${offset}`,
              scheduledFor: now.toISOString(),
              channels: normaliseChannels(deadlineConfig.channels, defaultChannels),
              payload: { title: goal.title, body: `${days} day${days === 1 ? '' : 's'} until your goal deadline.`, url: '/goals', tag: `goal-deadline-${goal.id}-${offset}` },
            });
            summary.sent += result.sent.length ? 1 : 0;
            summary.failed += !result.sent.length && !result.duplicate ? 1 : 0;
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...summary, at: now.toISOString() });
}
