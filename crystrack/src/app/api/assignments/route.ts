import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { assignmentError, mutateAssignment } from '@/lib/assignment-api';
import { z } from 'zod';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const paged = params.has('page');
  const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
  const parsed = z
    .object({
      page: z.coerce.number().int().min(0).max(10000),
      limit: z.coerce.number().int().min(1).max(200),
      state: z.enum([
        'active',
        'all',
        'completed',
        'overdue',
        'due_today',
        'due_soon',
        'upcoming',
        'finished_late',
        'completed_on_time',
        'completion_unknown',
      ]),
      search: z.string().max(200),
      category: z.string().max(100),
      priority: z.enum(['', 'low', 'medium', 'high', 'urgent']),
      from: z.union([z.literal(''), day]),
      to: z.union([z.literal(''), day]),
      sort: z.enum(['asc', 'desc']),
    })
    .safeParse({
      page: params.get('page') || 0,
      limit: paged ? params.get('limit') || 30 : 200,
      state: paged ? params.get('state') || 'active' : 'active',
      search: params.get('search') || '',
      category: params.get('category') || '',
      priority: params.get('priority') || '',
      from: params.get('from') || '',
      to: params.get('to') || '',
      sort: params.get('sort') || 'asc',
    });
  if (!parsed.success) return NextResponse.json({ error: 'Choose valid filters.' }, { status: 400 });
  const { data, error } = await supabase.rpc('assignment_list', { p_filter: parsed.data });
  if (error) return assignmentError(error);
  // Preserve the established Today/Plan array contract; the academic view uses a paged envelope.
  const activeItems = data.items.map((assignment: Record<string, unknown>) => ({
    ...assignment,
    scheduling_timezone: data.timezone,
    days_until: Math.ceil((Date.parse(String(assignment.deadline)) - Date.parse(data.now)) / 86400000),
  }));
  return NextResponse.json(paged ? data : activeItems, {
    headers: { 'Cache-Control': 'private, no-store', 'X-Assignments-Truncated': String(data.hasMore) },
  });
}
export async function POST(request: Request) {
  return mutateAssignment(request, 'create');
}
