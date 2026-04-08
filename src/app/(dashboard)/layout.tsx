import type { ReactNode } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { OfflineProvider } from "@/contexts/OfflineContext";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return (
    <OfflineProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </OfflineProvider>
  );
}
