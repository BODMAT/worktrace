import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "WorkTrace captures your development sessions in the browser - pages visited, " +
  "tags, music, and notes - then turns them into AI-generated session reports.";

export const metadata: Metadata = {
  title: {
    default: "WorkTrace - your dev sessions, captured",
    template: "%s · WorkTrace",
  },
  description: SITE_DESCRIPTION,
  applicationName: "WorkTrace",
  keywords: [
    "developer productivity",
    "session tracking",
    "chrome extension",
    "ai session report",
    "context capture",
  ],
  authors: [{ name: "WorkTrace" }],
  openGraph: {
    type: "website",
    siteName: "WorkTrace",
    title: "WorkTrace - your dev sessions, captured",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "WorkTrace - your dev sessions, captured",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#080812",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
