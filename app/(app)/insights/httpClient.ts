/**
 * A minimal stand-in for the axios surface the ported Insight OS UI uses.
 *
 * That component came from an app where axios was already a dependency; this one uses `fetch`
 * everywhere and has no HTTP client. Adding axios for a single component would be inconsistent
 * with the rest of the codebase, and rewriting ~8 call sites inside a 1,700-line file is a good
 * way to introduce a bug in code that currently works. So the shape it expects — `.get`/`.post`
 * returning `{ data }`, and `isAxiosError` with `err.response.data.message` — is provided instead.
 *
 * Auth needs nothing here: requests are same-origin and the session cookie rides along
 * automatically, so the `Authorization` headers the original passed are simply ignored.
 */

export interface HttpResponse<T> {
  data: T;
  status: number;
}

export class HttpError extends Error {
  readonly response: { status: number; data: { message?: string } };
  constructor(message: string, status: number, data: { message?: string }) {
    super(message);
    this.name = "HttpError";
    this.response = { status, data };
  }
}

async function request<T>(url: string, init: RequestInit): Promise<HttpResponse<T>> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();

  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : null) ?? `Request failed (${res.status})`;
    throw new HttpError(message, res.status, (payload as { message?: string }) ?? {});
  }

  return { data: payload as T, status: res.status };
}

/** axios serialises `config.params` into the query string and drops undefined values; callers here
 * rely on both, so the shim has to do the same or filters silently stop being applied. */
interface RequestConfig {
  params?: Record<string, unknown>;
  /** Accepted and ignored: requests are same-origin, so the session cookie handles auth and the
   * `Authorization` headers the original code passes have nothing to carry. */
  headers?: Record<string, string>;
}

function withParams(url: string, config?: RequestConfig): string {
  const params = config?.params;
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url;
}

const httpClient = {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<HttpResponse<T>> {
    return request<T>(withParams(url, config), { method: "GET" });
  },

  post<T = unknown>(url: string, body?: unknown, _config?: unknown): Promise<HttpResponse<T>> {
    return request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },

  isAxiosError(err: unknown): err is HttpError {
    return err instanceof HttpError;
  },
};

export default httpClient;
