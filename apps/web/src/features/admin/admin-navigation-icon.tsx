import {
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardList,
  ContactRound,
  FileText,
  Folder,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Mail,
  PanelsTopLeft,
  Settings,
  Sparkles,
  Star,
  Upload,
  Users,
} from "lucide-react";

const navigationIcons: Readonly<Record<string, LucideIcon>> = {
  agenda: CalendarDays,
  communications: Mail,
  crm: ContactRound,
  deliverables: Upload,
  embeds: PanelsTopLeft,
  events: CalendarDays,
  files: Folder,
  form: FileText,
  members: Users,
  overview: LayoutDashboard,
  remix: Sparkles,
  reports: ChartNoAxesColumn,
  reviews: ListChecks,
  settings: Settings,
  speakers: Star,
  submissions: ClipboardList,
};

export function AdminNavigationIcon({ name }: Readonly<{ name: string }>) {
  const Icon = navigationIcons[name] ?? PanelsTopLeft;
  return <Icon aria-hidden="true" />;
}
