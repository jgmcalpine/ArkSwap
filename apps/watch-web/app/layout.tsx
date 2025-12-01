import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ArkWatch',
  description: 'ArkWatch - Monitor Multiple ASPs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-white antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
