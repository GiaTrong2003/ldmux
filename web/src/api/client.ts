// Thin fetch wrapper. Throws on non-2xx with server-provided error message when available.

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = undefined;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && data.error) || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'DELETE',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
