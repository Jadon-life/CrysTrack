import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const PAGE_SIZE = 50;
const MAX_PAGE = 10000;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const status = searchParams.get('status');
  // The dashboard still uses the original array response from /api/history.
  // The History page opts into bounded paging using the ?page=N parameter.
  const paged = searchParams.has('page');
  const rawPage = searchParams.get('page') || '0';
  const page = Number(rawPage);
  if (paged && (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page > MAX_PAGE)) {
    return NextResponse.json({ error: 'Invalid history page' }, { status: 400 });
  }

  let query = supabase
    .from('activity_events')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (type) query = query.eq('entity_type', type);
  if (status) query = query.eq('metadata_json->>status', status);

  // Pull one extra record to determine if another page really exists.
  const offset = page * PAGE_SIZE;
  const { data, error } = paged
    ? await query.range(offset, offset + PAGE_SIZE)
    : await query.limit(100);

  if (error) {
    return NextResponse.json({ error: 'Unable to load activity history' }, { status: 500 });
  }

  if (!paged) return NextResponse.json(data || []);
  const rows = data || [];
  return NextResponse.json({
    items: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
    nextPage: page + 1,
  });
}
