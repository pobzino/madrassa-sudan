import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Parents | Amal School",
  description:
    "Learn how Amal School helps Sudanese children keep learning through free, interactive Maths and English lessons, and apply to enrol your child.",
  alternates: {
    canonical: "/parents",
  },
  openGraph: {
    title: "Help your child keep learning | Amal School",
    description:
      "Free, interactive online Maths and English lessons for Sudanese children, designed to work around family life and different internet conditions.",
    url: "/parents",
  },
};

export default function ParentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
