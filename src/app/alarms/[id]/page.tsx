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
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Chi tiết cảnh báo</p>
          <h1>{alarm.taskSession || alarm.summary || "Cảnh báo AI Box"}</h1>
        </div>
        <Link className="button secondary" href="/">
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
    </main>
  );
}
