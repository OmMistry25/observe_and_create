import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getUser } from '@/lib/auth';

export default async function Home() {
  const user = await getUser();

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
          {user ? (
            <Button asChild size="lg">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg">
                <Link href="/auth/signup">Get Started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/signin">Sign In</Link>
              </Button>
            </>
          )}
        </div>

        <div className="pt-8 text-sm text-muted-foreground">
          <p>Privacy-first • Local processing • Full control</p>
        </div>
      </main>
    </div>
  );
}

