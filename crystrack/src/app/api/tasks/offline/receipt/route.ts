import { offlineOutcome } from '@/lib/offline-outcomes-server';
export async function POST(request: Request) {
  return offlineOutcome(request, 'receipt');
}
