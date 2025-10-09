import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Observe & Create',
  description: 'Passive browser activity intelligence and automation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

