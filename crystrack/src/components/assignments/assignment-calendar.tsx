'use client';
import { dateKeyForInstant } from '@/lib/reminders';
import { shiftAcademicDay } from '@/lib/assignments/time';
import type { AcademicAssignment } from '@/types/assignments';
export function AssignmentCalendar({
  items,
  startDay,
  timezone,
  onMove,
  onEdit,
}: {
  items: AcademicAssignment[];
  startDay: string;
  timezone: string;
  onMove: (days: number) => void;
  onEdit: (item: AcademicAssignment) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) =>
    shiftAcademicDay(startDay, i),
  );
  const time = (instant: string) =>
    new Intl.DateTimeFormat('en-NG', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(instant));
  return (
    <section
      className="academic-calendar"
      aria-label="Timeboxed assignment calendar"
    >
      <header>
        <div>
          <h2>Your time, with room to breathe</h2>
          <p>
            {days[0]} — {days[6]} · {timezone}
          </p>
        </div>
        <div>
          <button
            aria-label="Previous calendar week"
            onClick={() => onMove(-7)}
          >
            ←
          </button>
          <button onClick={() => onMove(0)}>Today</button>
          <button aria-label="Next calendar week" onClick={() => onMove(7)}>
            →
          </button>
        </div>
      </header>
      <div className="academic-calendar-grid">
        {days.map((day) => {
          const entries = items
            .filter(
              (item) =>
                dateKeyForInstant(
                  new Date(item.work_start_at || item.deadline),
                  timezone,
                ) === day,
            )
            .sort(
              (a, b) =>
                Date.parse(a.work_start_at || a.deadline) -
                Date.parse(b.work_start_at || b.deadline),
            );
          return (
            <section
              className="academic-calendar-day"
              key={day}
              aria-label={day}
            >
              <h3>
                {new Intl.DateTimeFormat('en-NG', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(`${day}T12:00:00Z`))}
              </h3>
              {!entries.length && (
                <p className="academic-calendar-empty">Room to plan</p>
              )}
              {entries.map((item) => {
                const end =
                  item.work_start_at && item.estimated_minutes != null
                    ? new Date(
                        Date.parse(item.work_start_at) +
                          item.estimated_minutes * 60000,
                      ).toISOString()
                    : null;
                return (
                  <button
                    key={item.id}
                    className="academic-timebox"
                    onClick={() => onEdit(item)}
                  >
                    <span>{item.course_code || item.academic_kind}</span>
                    <strong>{item.title}</strong>
                    {item.work_start_at ? (
                      <>
                        <span>
                          {time(item.work_start_at)}
                          {end ? ` → ${time(end)}` : ' · add duration'}
                        </span>
                        {end &&
                          dateKeyForInstant(new Date(end), timezone) !==
                            day && (
                            <span>
                              Ends {dateKeyForInstant(new Date(end), timezone)}
                            </span>
                          )}
                        {end && Date.parse(end) > Date.parse(item.deadline) && (
                          <span className="academic-timebox-warning">
                            This block extends past the deadline. An earlier
                            slot may help.
                          </span>
                        )}
                      </>
                    ) : (
                      <span>Due {time(item.deadline)} · timebox to plan</span>
                    )}
                    <small>
                      {item.estimated_minutes == null
                        ? 'Estimate when ready'
                        : `${Number((item.estimated_minutes / 60).toFixed(2))}h planned effort`}
                    </small>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
      <p className="academic-help">
        Blocks use your chosen start and estimated duration. Items without a
        block appear on their deadline day. Select one to adjust it.
      </p>
    </section>
  );
}
