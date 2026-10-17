'use client';
import { GlassCard } from '@/components/shared/glass-card';
import { useRhythm } from '@/components/rhythm/rhythm-provider';
export function ActivityOverview() {
  const { data } = useRhythm();
  if (!data) return null;
  return (
    <section className="activity-overview" aria-label="Recorded progress">
      <div className="activity-overview-metrics">
        {[
          {
            label: 'Completions this week',
            value: data.weekly.completed,
            note: 'From recorded activity',
          },
          {
            label: 'Focused time',
            value:
              Math.round((data.weekly.focusedMinutes / 60) * 10) / 10 + 'h',
            note: 'Verified focus sessions',
          },
          {
            label: 'Goals in motion',
            value: data.goals.length,
            note: 'Your active directions',
          },
          {
            label: 'Available today',
            value: Math.max(0, data.capacity.available) + 'm',
            note: 'Within your chosen capacity',
          },
        ].map((metric) => (
          <GlassCard key={metric.label} hover>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <span>{metric.note}</span>
          </GlassCard>
        ))}
      </div>
      <GlassCard hover className="activity-area-card">
        <div>
          <h2>Your week, across life areas</h2>
          <p>Recorded completions, not a score for your life.</p>
        </div>
        <div className="activity-area-bars">
          {data.weekly.areas.length ? (
            data.weekly.areas.map((area) => (
              <div key={area.label}>
                <span>{area.label}</span>
                <div>
                  <i
                    style={{
                      width:
                        Math.max(
                          1,
                          (area.count /
                            Math.max(
                              ...data.weekly.areas.map((a) => a.count),
                            )) *
                            100,
                        ) + '%',
                    }}
                  />
                </div>
                <strong>{area.count}</strong>
              </div>
            ))
          ) : (
            <p>Your chart grows with the steps you record.</p>
          )}
        </div>
      </GlassCard>
    </section>
  );
}
