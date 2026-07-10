import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  KanbanSquare,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Settings
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Coming-soon stub: shown but not yet a real feature. */
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Vietnamese labels (app UI is Vietnamese). Real pages first; the "Sắp ra mắt"
// group holds honest empty-state stubs to mirror Zenith's fuller sidebar.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Bảng điều khiển",
    items: [
      { label: "Tổng quan", href: "/", icon: LayoutDashboard },
      { label: "Cảnh báo", href: "/alarms", icon: Bell },
      { label: "Phân tích", href: "/analytics", icon: BarChart3 }
    ]
  },
  {
    label: "Hệ thống",
    items: [{ label: "Cài đặt", href: "/settings", icon: Settings }]
  },
  {
    label: "Sắp ra mắt",
    items: [
      { label: "Thư", href: "/mail", icon: Mail, soon: true },
      { label: "Trò chuyện", href: "/chat", icon: MessageSquare, soon: true },
      { label: "Lịch", href: "/calendar", icon: CalendarDays, soon: true },
      { label: "Kanban", href: "/kanban", icon: KanbanSquare, soon: true }
    ]
  }
];
