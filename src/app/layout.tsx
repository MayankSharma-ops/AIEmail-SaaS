import "@/styles/globals.css";
import Kbar from "@/app/mail/components/kbar";
import { ClerkProvider } from "@clerk/nextjs";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

import { TRPCReactProvider } from "@/trpc/react";
import { ThemeProvider } from "@/components/theme-provicer";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Mailor - Where Email Management Becomes Effortless",
  description: "Experience the next generation of email management with Mailor.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    title: "Mailor - Where Email Management Becomes Effortless",
    description: "Experience the next generation of email management with Mailor.",
    url: "https://mailor.gathor.online",
    siteName: "Mailor",
    images: [
      {
        url: "https://mailor.gathor.online/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Mailor - Email Management",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mailor - Where Email Management Becomes Effortless",
    description: "Experience the next generation of email management with Mailor.",
    images: ["https://mailor.gathor.online/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${GeistSans.variable}`}>
        <body>
          <ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
            <TRPCReactProvider>
              <Kbar>
                {children}
              </Kbar>
            </TRPCReactProvider>
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
