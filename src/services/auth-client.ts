export type LoginCredentials = {
  username: string;
  password: string;
};

export type LoginResponse = {
  ok: true;
  username: string;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

function isErrorResponse(value: unknown): value is ErrorResponse {
  return Boolean(value) && typeof value === "object" && (value as Partial<ErrorResponse>).ok === false;
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials)
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(isErrorResponse(payload) ? payload.error : "Không đăng nhập được");
  }

  return payload as LoginResponse;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw new Error("Không đăng xuất được");
  }
}
