import type { ReactNode } from "react";
import DashboardLayout from "@/components/DashboardLayout";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
