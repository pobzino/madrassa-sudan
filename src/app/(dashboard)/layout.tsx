import type { ReactNode } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { OfflineProvider } from "@/contexts/OfflineContext";
import { LearnerProvider } from "@/contexts/LearnerContext";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return (
    <OfflineProvider>
      <LearnerProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </LearnerProvider>
    </OfflineProvider>
  );
}
