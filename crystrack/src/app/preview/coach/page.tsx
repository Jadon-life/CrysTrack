import { notFound } from "next/navigation";
import { previewEnabled } from "@/lib/coach-preview/guard";
import { CoachPreview } from "@/components/coach-preview/coach-preview";
export const dynamic = "force-dynamic";
export default function CoachPreviewPage() {
  if (!previewEnabled()) notFound();
  return <CoachPreview />;
}
