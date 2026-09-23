import { AlarmDashboard } from "@/components/alarm-dashboard";

// The dashboard reads its filters and page from the URL (useSearchParams), so
// render per request: the server HTML then already shows the filtered view,
// with no Suspense fallback flashing in before the client takes over.
export const dynamic = "force-dynamic";

export default function AlarmsPage() {
  return <AlarmDashboard />;
}
