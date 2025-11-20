import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'ArkSwap',
  description: 'ArkSwap Application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-white antialiased overflow-x-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

