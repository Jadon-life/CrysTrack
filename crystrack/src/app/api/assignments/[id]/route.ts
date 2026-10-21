import { mutateAssignment } from '@/lib/assignment-api';
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  return mutateAssignment(request, 'edit', (await props.params).id);
}
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  return mutateAssignment(request, 'delete', (await props.params).id);
}
