const handleResponse = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: `Error ${res.status}` }));
    throw new Error((body as { message?: string }).message || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
};

export const apiFetch = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  return handleResponse<T>(res);
};

export const apiGet = <T>(path: string) => apiFetch<T>(path);

export const apiPost = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const apiPatch = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = (path: string) =>
  apiFetch<{ ok: boolean }>(path, { method: 'DELETE' });
