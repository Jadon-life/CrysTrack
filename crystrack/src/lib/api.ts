// Client-side API helpers

export async function fetcher(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  // UI invalidation is only a fresh read; shard authority stays in source transactions.
  if (typeof window !== 'undefined' && options?.method && !['GET','HEAD'].includes(options.method) && /^\/api\/(tasks|goals|assignments|finance\/entries)(\/|$)/.test(url)) {
    window.dispatchEvent(new Event('crystrack-crystal-updated'));
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function post(url: string, body: unknown) {
  return fetcher(url, { method: 'POST', body: JSON.stringify(body) });
}

export async function patch(url: string, body: unknown) {
  return fetcher(url, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function del(url: string) {
  return fetcher(url, { method: 'DELETE' });
}
