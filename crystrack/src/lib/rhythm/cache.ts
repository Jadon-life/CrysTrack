const entries = new Map<string, { expires: number; value: any }>();
export async function cachedToday(
  key: string,
  fresh: boolean,
  load: () => Promise<any>,
) {
  const hit = entries.get(key);
  if (!fresh && hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  if (entries.size >= 100) entries.delete(entries.keys().next().value!);
  entries.set(key, { expires: Date.now() + 15000, value });
  return value;
}
export function invalidateToday(userId: string) {
  for (const key of entries.keys())
    if (key.startsWith(userId + ':')) entries.delete(key);
}
