import type { ReactNode } from "react";
import BackgroundVideoUploadViewport from "@/components/BackgroundVideoUploadViewport";
import DashboardLayout from "@/components/DashboardLayout";
import { BackgroundVideoUploadProvider } from "@/contexts/BackgroundVideoUploadContext";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return (
    <BackgroundVideoUploadProvider>
      <DashboardLayout>{children}</DashboardLayout>
      <BackgroundVideoUploadViewport />
    </BackgroundVideoUploadProvider>
  );
}
