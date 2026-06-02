'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

export default function BillingSuccessPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center px-6">
      <div className="max-w-lg w-full text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-primary" />
        </div>

        <div className="flex items-center justify-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-primary uppercase tracking-wide">
            Payment successful
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Welcome to Pro!
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Your subscription is active. You now have unlimited campaigns,
          private cloud mode, and priority support. Let's build something
          amazing.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            size="lg"
            onClick={() => router.push('/companies')}
            className="gap-2"
          >
            Go to dashboard
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Link href="/">
            <Button size="lg" variant="outline">
              Back to home
            </Button>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground mt-12">
          Need help getting started? Email us at{' '}
          <a
            href="mailto:support@1person.ai"
            className="text-primary hover:underline"
          >
            support@1person.ai
          </a>
        </p>
      </div>
    </div>
  );
}
