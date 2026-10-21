import { buildWealthReport } from './wealth-report';
export async function readWealthReport(client: any, owner: string) {
  try {
    const { data, error } = await client.rpc('wealth_overview_read');
    if (error) throw Error('Read failed');
    const report = buildWealthReport(data, owner);
    if (new TextEncoder().encode(JSON.stringify(report)).length > 4194304)
      throw Error('Coverage exceeded');
    return report;
  } catch {
    // Never expose raw RPC or validator output through an AI/API error handler.
    throw Error('Financial read unavailable');
  }
}
export const wealthReadHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
