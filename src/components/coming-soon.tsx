import Link from "next/link";
import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ComingSoon({ title }: { title: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Construction className="size-7" />
      </span>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Tính năng này đang được phát triển và sẽ sớm ra mắt.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Về tổng quan
      </Link>
    </Card>
  );
}
