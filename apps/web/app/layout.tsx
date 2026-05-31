import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Praxis',
  description:
    'A collaborative workspace where two people build, deploy, and learn together with AI coding agents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
