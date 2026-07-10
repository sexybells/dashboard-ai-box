// Minimal className joiner (avoids a clsx dependency for our simple needs).
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
