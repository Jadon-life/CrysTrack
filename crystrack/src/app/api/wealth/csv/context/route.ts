import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csvContextSchema } from '@/lib/csv/statement';
import { csvFailure, csvHeaders } from '@/lib/csv/server';
export async function GET() {
  const c = await createClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: csvHeaders });
  try {
    const { data, error } = await c.rpc('wealth_csv_context');
    if (error) throw error;
    return NextResponse.json(csvContextSchema.parse(data), { headers: csvHeaders });
  } catch (e) {
    return csvFailure(e);
  }
}
