import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "TCT SignalSieve — Alert Noise Reducer for Lean Ops & Security Teams",
  description:
    "Ingest alerts from PagerDuty, Datadog, and AWS. Cluster related alerts with shared context summaries, rank by blast radius & urgency, and suppress noisy patterns for 24 hours.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body className={`${jetbrainsMono.className} min-h-screen bg-background text-foreground font-mono antialiased selection:bg-primary/20 selection:text-primary transition-colors duration-200`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
