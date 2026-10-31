import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Application metadata for SEO and browser display
export const metadata: Metadata = {
  title: {
    default: "SubsTrack | Smart Subscription Management",
    template: "%s | SubsTrack",
  },
  description:
    "Simplify subscription management with SubsTrack. Track recurring expenses, manage team subscriptions, monitor billing, and gain better control over your spending.",
  applicationName: "SubsTrack",
  keywords: [
    "SubsTrack",
    "subscription management",
    "subscription tracker",
    "billing management",
    "recurring payments",
    "expense tracking",
    "team subscription management",
  ],
  authors: [{ name: "SubsTrack Team" }],
  creator: "SubsTrack",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "SubsTrack | Smart Subscription Management",
    description:
      "Track subscriptions, manage recurring expenses, and simplify billing with SubsTrack.",
    siteName: "SubsTrack",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SubsTrack | Smart Subscription Management",
    description:
      "Manage subscriptions, track expenses, and stay in control of recurring payments with SubsTrack.",
  },
};

// Main layout component that wraps all application pages
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <AuthProvider>
          <div className="pointer-events-none fixed right-4 top-4 z-[100]">
            <div className="pointer-events-auto">
              <NotificationBell />
            </div>
          </div>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
