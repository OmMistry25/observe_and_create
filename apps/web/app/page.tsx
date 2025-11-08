import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
      <main className="text-center space-y-8 px-4">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">Observe & Create</h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Passive browser activity intelligence and automation.
            <br />
            Discover patterns, automate workflows, save time.
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>

        <div className="pt-8 text-sm text-muted-foreground">
          <p>Privacy-first • Local processing • Full control</p>
        </div>
      </main>
    </div>
  );
}

