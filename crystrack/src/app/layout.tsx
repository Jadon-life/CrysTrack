import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import './premium-physical-ui.css';
import './premium-physical-ui-phase2.css';
import './premium-physical-ui-phase3.css';
import './premium-physical-ui-final.css';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { AuthProvider } from '@/components/layout/auth-provider';
import { AppLayout } from '@/components/layout/app-layout';

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'CrysTrack - Personal Command Centre',
  description: 'A private adaptive personal command centre for tasks, goals, assignments, Wealth and progress intelligence.',
  keywords: ['productivity', 'goals', 'tasks', 'wealth', 'personal finance', 'tracking'],
  authors: [{ name: 'CrysTrack' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} min-h-screen overflow-x-hidden`}>
        <AuthProvider>
          <ThemeProvider>
            <AppLayout>{children}</AppLayout>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
