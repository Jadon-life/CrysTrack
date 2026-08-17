import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { AuthProvider } from '@/components/layout/auth-provider';
import { AppLayout } from '@/components/layout/app-layout';

export const metadata: Metadata = {
  title: 'CrysTrack - Personal Progress Companion',
  description: 'A premium, futuristic personal progress companion. Track tasks, goals, assignments, and finances in one immersive environment.',
  keywords: ['productivity', 'goals', 'tasks', 'finance', 'tracking'],
  authors: [{ name: 'CrysTrack' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen overflow-x-hidden">
        <AuthProvider>
          <ThemeProvider>
            <AppLayout>{children}</AppLayout>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
