let accessToken: string | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

export const getAccessToken = () => accessToken;

/** Unggah berkas (multipart) — dipakai sebagai jalur cadangan unggah logo. */
export async function uploadFile<T = unknown>(path: string, file: File, field = 'file'): Promise<T> {
  const form = new FormData();
  form.append(field, file, file.name || 'logo');
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(payload));
  return payload as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.message)) return (p.message as string[]).join(', ');
    if (typeof p.message === 'string') return p.message;
    if (typeof p.error === 'string') return p.error;
  }
  return 'Terjadi kesalahan, coba lagi';
}

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

export async function api<T = unknown>(
  path: string,
  { method = 'GET', body, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const doFetch = () =>
    fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

  let res = await doFetch();
  if (res.status === 401 && auth) {
    // Access token kedaluwarsa -> coba refresh sekali via HttpOnly cookie
    if (await doRefresh()) {
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      res = await doFetch();
    }
  }

  if (res.status === 401 && auth) {
    setAccessToken(null);
    if (typeof window !== 'undefined') window.location.assign('/login');
    throw new ApiError(401, 'Sesi berakhir, silakan login ulang');
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(res.status, errorMessage(payload));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function logout() {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // abaikan
  }
  setAccessToken(null);
}
