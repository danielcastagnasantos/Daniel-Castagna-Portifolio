const TOKEN_KEY = "mv-token";

const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const doFetch = () =>
    fetch(`/api${path}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}) },
      body: init.method && init.method !== "GET" ? JSON.stringify(init.body ?? {}) : undefined,
    });
  let res = await doFetch();
  if (res.status === 401) {
    const t = window.prompt("Este servidor exige um token (API_TOKEN do .env). Informe:");
    if (t) {
      try {
        localStorage.setItem(TOKEN_KEY, t);
      } catch {
        /* sem armazenamento */
      }
      res = await doFetch();
    }
  }
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let code = "HTTP";
    try {
      const j = (await res.json()) as { error?: { message?: string; code?: string } };
      message = j.error?.message ?? message;
      code = j.error?.code ?? code;
    } catch {
      /* corpo não é JSON */
    }
    throw new ApiError(message, res.status, code);
  }
  return (await res.json()) as T;
}

export const eventsUrl = (id: string) => `/api/projects/${id}/events${getToken() ? `?token=${encodeURIComponent(getToken())}` : ""}`;
export const downloadUrl = (id: string) => `/api/projects/${id}/download${getToken() ? `?token=${encodeURIComponent(getToken())}` : ""}`;
