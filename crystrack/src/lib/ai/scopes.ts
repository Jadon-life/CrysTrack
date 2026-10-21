// Automatic provider data is constructed from these fields, never by spreading source rows.
const finite = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
export function scopedGoal(goal: any, checkins: any[], metrics: any) {
  return {
    progress_mode:
      goal.progress_mode === 'percentage' || goal.measurable ? 'numeric' : 'qualitative',
    progress_percent: finite(metrics.numeric?.progress_percent),
    timeline: {
      days_elapsed: finite(metrics.timeline?.days_elapsed),
      days_remaining: finite(metrics.timeline?.days_remaining),
      time_elapsed_percent: finite(metrics.timeline?.time_elapsed_percent),
    },
    checkin_count: checkins.length,
    recent_checkins: checkins
      .slice(0, 12)
      .map((c) => ({
        progress_percent: finite(c.progress_percent == null ? null : Number(c.progress_percent)),
        duration_minutes: finite(c.duration_minutes),
      })),
    evidence_limit:
      'Private titles, descriptions and reflections are excluded. Do not infer their contents or judge unshared qualitative evidence.',
  };
}
