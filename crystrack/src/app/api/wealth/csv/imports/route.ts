import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { csvImportRequestSchema, csvReceiptSchema } from '@/lib/csv/statement';
import { boundedJson, csvFailure, csvHeaders } from '@/lib/csv/server';
export async function POST(request: Request) {
  const c = await createClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: csvHeaders });
  try {
    const v = csvImportRequestSchema.parse(await boundedJson(request));
    const { data, error } = await c.rpc('wealth_csv_import', {
      p_id: v.batchId,
      p_source: v.source,
      p_file: v.fileHash,
      p_timezone: v.timezone,
      p_rows: v.rows,
      p_token: v.reviewToken,
      p_confirmed: v.confirmed,
    });
    if (error) throw error;
    return NextResponse.json(csvReceiptSchema.parse(data), { headers: csvHeaders });
  } catch (e) {
    return csvFailure(e);
  }
}
export async function GET(request: Request) {
  const c = await createClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: csvHeaders });
  try {
    const q = z
      .object({ id: z.string().uuid() })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await c.rpc('wealth_csv_receipt', { p_id: q.id });
    if (error) throw error;
    return NextResponse.json(data === null ? null : csvReceiptSchema.parse(data), {
      headers: csvHeaders,
    });
  } catch (e) {
    return csvFailure(e);
  }
}
