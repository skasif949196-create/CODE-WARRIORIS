export const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;
const SESSION_KEY = "hc-session";

export const getToken = () => localStorage.getItem(SESSION_KEY);
export const setToken = (token: string | null) =>
  token ? localStorage.setItem(SESSION_KEY, "active") : localStorage.removeItem(SESSION_KEY);

async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: method || (body === undefined ? "GET" : path.startsWith("/auth/") ? "POST" : "PUT"),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Cannot reach the HealthCopilot API on port 8000. Start the backend and check your network connection.");
    }
    throw error;
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof result?.detail === "string" ? result.detail : `The service returned an error (${response.status}).`;
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const account = (path: "register" | "login", email: string, password: string) =>
  request<{ authenticated: boolean }>(`/auth/${path}`, { email, password });
export const loadHealthData = () => request<Record<string, unknown>>("/api/data");
export const saveHealthData = (data: object) => request<{ saved: boolean }>("/api/data", { data });
export const deleteHealthData = () => request<{ deleted: boolean }>("/api/data", undefined, "DELETE");
export const endSession = () => request<{ signed_out: boolean }>("/auth/logout", {});
export const sendChat = (messages: { role: "user" | "assistant"; content: string }[]) =>
  request<{ reply: string }>("/api/chat", { messages }, "POST");
