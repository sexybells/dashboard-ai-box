import { ArrowLeft } from "lucide-react";
import { AlarmDetail } from "@/components/alarm-detail";
import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import { isValidObjectId } from "mongoose";
import Link from "next/link";
import { notFound } from "next/navigation";

interface AlarmDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AlarmDetailPage({ params }: AlarmDetailPageProps) {
  const { id } = await params;

  if (!isValidObjectId(id)) {
    notFound();
  }

  await connectMongo();
  const alarm = await AlarmModel.findById(id).lean();

  if (!alarm) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Chi tiết cảnh báo</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {alarm.taskSession || alarm.summary || "Cảnh báo AI Box"}
          </h2>
        </div>
        <Link
          href="/alarms"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
      </div>
      <AlarmDetail
        alarm={{
          ...JSON.parse(JSON.stringify(alarm)),
          id: String(alarm._id),
          _id: String(alarm._id)
        }}
      />
    </div>
  );
}
