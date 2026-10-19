import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csvReviewRequestSchema, csvReviewSchema } from '@/lib/csv/statement';
import { boundedJson, csvFailure, csvHeaders } from '@/lib/csv/server';
export async function POST(request: Request) {
  const c = await createClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: csvHeaders });
  try {
    const v = csvReviewRequestSchema.parse(await boundedJson(request));
    const { data, error } = await c.rpc('wealth_csv_review', {
      p_source: v.source,
      p_file: v.fileHash,
      p_timezone: v.timezone,
      p_rows: v.rows,
    });
    if (error) throw error;
    return NextResponse.json(csvReviewSchema.parse(data), { headers: csvHeaders });
  } catch (e) {
    return csvFailure(e);
  }
}
