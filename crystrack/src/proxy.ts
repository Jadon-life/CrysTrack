import { type NextRequest } from "next/server";
import { previewEnabled } from "@/lib/coach-preview/guard";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    (path === "/preview/coach" ||
      path.startsWith("/preview/coach/") ||
      path.startsWith("/api/preview/")) &&
    !previewEnabled()
  ) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
