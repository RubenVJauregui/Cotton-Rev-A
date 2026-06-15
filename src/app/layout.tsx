import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cotton WISE Dashboard',
  description: 'Warehouse operations dashboard for Cotton facility',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
