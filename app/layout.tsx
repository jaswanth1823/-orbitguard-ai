import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { PageTitleProvider } from '@/components/layout/PageTitleContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OrbitGuard AI — Mission Monitoring Platform',
  description: 'AI-powered spacecraft mission monitoring and decision-support platform',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-[#080d1a] text-slate-100 antialiased`}
      >
        <PageTitleProvider>
          <div className="flex h-screen overflow-hidden">
            {/* Sidebar persists across all navigations */}
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* TopBar persists — title updates via context */}
              <TopBar />
              <main className="flex-1 overflow-y-auto p-6 bg-[#080d1a]">
                {children}
              </main>
            </div>
          </div>
        </PageTitleProvider>
      </body>
    </html>
  );
}
