import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CSV_LIMITS, exportQuerySchema, exportRowSchema, ledgerCsv } from '@/lib/csv/statement';
import { csvFailure, csvHeaders } from '@/lib/csv/server';
export async function GET(request: Request) {
  const c = await createClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: csvHeaders });
  try {
    const q = exportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await c.rpc('wealth_csv_export', {
      p_from: q.from,
      p_to: q.to,
      p_notes: q.notes === 'true',
    });
    if (error) throw error;
    const rows = z.array(exportRowSchema).max(10000).parse(data),
      text = ledgerCsv(rows, q.notes === 'true');
    if (Buffer.byteLength(text, 'utf8') > CSV_LIMITS.exportBytes)
      throw Error('Export bounded limit');
    return new Response(text, {
      headers: {
        ...csvHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="crystrack-ledger-${q.from}-${q.to}.csv"`,
      },
    });
  } catch (e) {
    return csvFailure(e);
  }
}
