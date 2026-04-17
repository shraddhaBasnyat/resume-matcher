import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-brand" });

export const metadata: Metadata = {
  title: "Resume Matcher",
  description: "Resume vs Job Description Matcher",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${jetBrainsMono.variable}`}>{children}</body>
    </html>
  );
}
