/** Bundled fictional DTOs. No SDK, environment credentials, database, clock, or outbound calls. */
import { EXPERIENCE_CONFIG } from '../../config/experience';
export const DEMO_DAY = '2026-09-28';
export const DEMO_USER = {
  id:'00000000-0000-4000-8000-000000000011', email:'demo@example.invalid',
  app_metadata:{}, user_metadata:{full_name:'Demo Explorer'},
  aud:'synthetic-demo', created_at:'2026-09-28T08:00:00Z',
};
const taskId = '00000000-0000-4000-8000-000000000012';
const goalId = '00000000-0000-4000-8000-000000000013';
const conversationId = '00000000-0000-4000-8000-000000000014';
const tasks = [{id:taskId,user_id:DEMO_USER.id,title:'Explore your calm workspace',description:'A fictional routine for this read-only demo.',
  active:true,preferred_time:'10:00',category:'Focus',created_at:DEMO_USER.created_at,archived_at:null,
  task_schedules:[{weekday:1}],scheduled_today:true,today_status:'pending',today_occurrence_id:null,
  daily_revision:1,daily_day:DEMO_DAY,scheduling_timezone:'Africa/Lagos',streak:0,
}];
const goals = [{id:goalId,user_id:DEMO_USER.id,title:'Build a steady reading rhythm',description:'Synthetic example goal.',
  status:'active',category:'Learning',measurable:true,progress_mode:'percentage',starting_value:'0',progress_value:'2',target_value:'10',
  deadline:'2026-12-31T23:00:00Z',created_at:DEMO_USER.created_at,goal_checkins:[],checkin_config:{frequency:'daily'},
}];
const profile = {user_id:DEMO_USER.id,display_name:'Demo Explorer',timezone:'Africa/Lagos',current_timezone:'Africa/Lagos',
  scheduling_timezone:'Africa/Lagos',avatar_url:null,avatar_signed_url:null,locale:'en-NG'};
const preferences = {theme_preference:'adaptive',reduced_motion:false,weather_enabled:false,dnd_enabled:false,
  default_reminder_channels:[],untimed_task_reminder_time:'10:00',incomplete_task_reminder_time:'19:00'};
const summary = {availableBalance:0,savedBalance:0,receivables:0,liabilities:0,netPosition:0,monthIncome:0,monthExpenses:0,
  monthSaved:0,netSpendableFlow:0,savingsRatePct:null,averageDailySpend:0,projectedMonthExpenses:0,priorMonthExpenses:0,
  projectedExpenseChangePct:null,safeToSpend:0,projectedMonthEndLow:0,projectedMonthEndHigh:0,dataMonths:0,
  categoryPatterns:[],spendingVelocity:'insufficient',deterministicRemark:'Synthetic demo — no financial records are connected.'};
const context = {day:DEMO_DAY,timezone:'Africa/Lagos',revision:1,captureStartsOn:DEMO_DAY};
const conversation = {id:conversationId,title:'About this synthetic demo',created_at:DEMO_USER.created_at,updated_at:DEMO_USER.created_at};

/** A closed allowlist. Unknown routes never fall through to a live implementation. */
export function demoRead(pathname: string, search = new URLSearchParams()): unknown | undefined {
  if (pathname === '/api/crystals') return {enabled:false,revision:1,total:'0',pendingMoment:false};
  if (pathname === '/api/profile') return profile;
  if (pathname === '/api/preferences') return preferences;
  if (pathname === '/api/wealth/budgets') return {month:'2026-09-01',currentMonth:'2026-09-01',minimum:'2025-09-01',timezone:'Africa/Lagos',currency:'NGN',startsAt:'2026-08-31T23:00:00Z',endsAt:'2026-09-30T23:00:00Z',items:EXPERIENCE_CONFIG.wealth.categories.map(category=>({category,id:null,revision:0,active:false,limit:null,spent:'0.00',entryCount:0,left:null,percentUsed:null,createdAt:null,updatedAt:null,removedAt:null}))};
  if (pathname === '/api/tasks/week') {
    const dates=['2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03'];
    return {context,from:dates[0],to:dates[6],minimum:dates[0],maximum:dates[0],revision:'00000000000000000000000000000000',nextCursor:null,
      days:dates.map(day=>({day,timezone:'Africa/Lagos',mode:day<DEMO_DAY?'past':day===DEMO_DAY?'today':'future',evidence:day<DEMO_DAY?'missing':day===DEMO_DAY?'incomplete':'planned',count:null})),
      rows:[{id:taskId,title:tasks[0].title,nameSource:'current',active:true,cells:dates.map(day=>({day,state:day<DEMO_DAY?'unverified':day===DEMO_DAY?'pending':'planned',title:day<DEMO_DAY?null:tasks[0].title,revision:day===DEMO_DAY?1:null,editable:day===DEMO_DAY}))}]};
  }
  if (pathname === '/api/tasks') return tasks;
  if (pathname === '/api/goals') return goals;
  if (pathname === '/api/assignments') return search.has('page') ? {items:[],hasMore:false,page:0,timezone:'Africa/Lagos',now:'2026-09-28T12:00:00Z',counts:{},week:['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04'].map(day=>({day,count:0}))} : [];
  if (pathname === '/api/daily-records/context') return context;
  if (pathname === '/api/daily-records') return {context,snapshots:[]};
  if (/^\/api\/daily-notes\/\d{4}-\d{2}-\d{2}$/.test(pathname)) return {day_key:DEMO_DAY,body:'',revision:0,updated_at:null};
  if (pathname === '/api/wealth') return {entries:[],targets:[],debts:[],expectedFlows:[],summary};
  if (['/api/finance','/api/finance/entries','/api/finance/targets','/api/wealth/debts','/api/wealth/expected','/api/reminders'].includes(pathname)) return [];
  if (pathname === '/api/history') {
    const rows = [{id:'synthetic-history',type:'task_completed',entity_type:'task',entity_id:taskId,
    created_at:DEMO_USER.created_at,metadata_json:{title:'Explore the demo',date:DEMO_DAY,status:'completed'}}];
    if (!search.has('page')) return rows;
    const page = Number(search.get('page')) || 0;
    const items = page === 0 ? rows.filter(row => (!search.get('type') || search.get('type') === row.entity_type) && (!search.get('status') || search.get('status') === row.metadata_json.status)) : [];
    return {items,hasMore:false,nextPage:page+1};
  }
  if (pathname === '/api/insights') return [{id:'synthetic-insight',type:'summary',title:'A calm place to explore',
    summary:'These are bundled examples, not personal analytics.',riskLevel:'low',recommendations:['Explore the pages and appearance switch.'],generatedAt:DEMO_USER.created_at}];
  if (pathname === '/api/ai/conversations') return [conversation];
  if (pathname === `/api/ai/conversations/${conversationId}`) return {conversation,messages:[{id:'synthetic-message',role:'assistant',
    content:'This is a bundled example. Live AI, personal context and message sending are disabled in this demo.',created_at:DEMO_USER.created_at}]};
  if (pathname === '/api/telegram/status') return {connected:false,connection:null,demo:true};
  if (pathname === '/api/push/subscribe') return {active:false,demo:true};
  return undefined;
}
