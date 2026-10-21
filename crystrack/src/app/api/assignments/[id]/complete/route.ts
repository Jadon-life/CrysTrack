import { mutateAssignment } from '@/lib/assignment-api';
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  return mutateAssignment(request, 'complete', (await props.params).id);
}
