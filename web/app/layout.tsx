import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillLens — Audit your Agent Skill",
  description:
    "Upload an Agent Skill (Cursor / Claude / OpenClaw) and get a quantitative, rubric-based audit with actionable improvements.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
