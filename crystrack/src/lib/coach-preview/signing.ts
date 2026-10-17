import {
  createHmac,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { z } from "zod";
import { coachTool, type CoachTool } from "./contracts";
const envelope = z
  .object({
    id: z.string().uuid(),
    uid: z.string().uuid(),
    expires: z.number().int(),
    tool: coachTool,
  })
  .strict();
function signature(body: string) {
  const key = process.env.PIECE9_SIGNING_SECRET;
  if (!key || key.length < 32)
    throw new Error("Preview signing is not configured");
  return createHmac("sha256", key).update(body).digest();
}
export function secretMatches(
  actual: string | null,
  expected: string | undefined,
) {
  if (!actual || !expected) return false;
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
export function signProposal(
  uid: string,
  tool: CoachTool,
  id: string = randomUUID(),
  now = Date.now(),
) {
  const parsed = envelope.parse({ id, uid, expires: now + 15 * 60000, tool });
  const body = Buffer.from(JSON.stringify(parsed)).toString("base64url");
  return body + "." + signature(body).toString("base64url");
}
export function readProposal(token: string, uid?: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid confirmation");
  const [body, sig] = parts,
    actual = Buffer.from(sig, "base64url"),
    expected = signature(body);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Invalid confirmation");
  const parsed = envelope.parse(
    JSON.parse(Buffer.from(body, "base64url").toString()),
  );
  if (
    parsed.expires <= now ||
    parsed.expires > now + 15 * 60000 ||
    (uid && parsed.uid !== uid)
  )
    throw new Error(
      "This confirmation has expired or belongs to another workspace",
    );
  return parsed;
}
