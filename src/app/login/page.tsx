import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { getSafeRedirectPath } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Đăng nhập | AI Box Dashboard"
};

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;

  return <LoginForm nextPath={getSafeRedirectPath(nextValue)} />;
}
