import { setTaskOutcome } from '@/lib/daily-records-server';

export async function POST(request: Request, props: {params: Promise<{taskId:string;date:string}>}) {
  return setTaskOutcome(request, await props.params, 'skip');
}
