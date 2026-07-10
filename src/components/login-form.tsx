"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, ShieldAlert } from "lucide-react";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { login } from "@/services/auth-client";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ username, password });
      router.replace(nextPath);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không đăng nhập được");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldAlert className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand">AI Box Dashboard</p>
            <h1 className="text-xl font-semibold tracking-tight">Đăng nhập</h1>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-medium">
            Tài khoản
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}
