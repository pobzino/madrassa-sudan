import type { ReactNode } from "react";
import BackgroundVideoUploadViewport from "@/components/BackgroundVideoUploadViewport";
import DashboardLayout from "@/components/DashboardLayout";
import { BackgroundVideoUploadProvider } from "@/contexts/BackgroundVideoUploadContext";
import { OfflineProvider } from "@/contexts/OfflineContext";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return (
    <OfflineProvider>
      <BackgroundVideoUploadProvider>
        <DashboardLayout>{children}</DashboardLayout>
        <BackgroundVideoUploadViewport />
      </BackgroundVideoUploadProvider>
    </OfflineProvider>
  );
}
