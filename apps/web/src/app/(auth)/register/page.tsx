'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRegister } from '@/lib/api/hooks';
import { Mail, Lock, User, ArrowRight, Check, Clock } from 'lucide-react';
import { useState } from 'react';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const registerMutation = useRegister();
  const [pendingApproval, setPendingApproval] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch('password', '');

  const passwordRequirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(password) },
    { label: 'Contains a letter', met: /[a-zA-Z]/.test(password) },
  ];

  const onSubmit = async (data: RegisterForm) => {
    try {
      const res = await registerMutation.mutateAsync(data);
      if ((res as any)?.pendingApproval) {
        setPendingApproval(true);
      } else {
        toast.success('Account created!');
        router.push('/welcome');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Registration failed');
    }
  };

  const isLoading = registerMutation.isPending;

  if (pendingApproval) {
    return (
      <div className="space-y-6">
        <Card className="border-0 shadow-none lg:border lg:shadow-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Account Created!</h2>
            <p className="text-muted-foreground mb-4">
              Your registration is pending admin approval.<br />
              You'll be able to sign in once your account is approved.
            </p>
            <p className="text-xs text-muted-foreground">
              This usually takes less than 24 hours.
            </p>
            <Link href="/login">
              <Button variant="outline" className="mt-6">
                Go to Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mobile logo */}
      <div className="lg:hidden text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-white text-xl">1</span>
          </div>
          <span className="text-2xl font-bold">1Person</span>
        </Link>
      </div>

      <Card className="border-0 shadow-none lg:border lg:shadow-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
          <CardDescription>Start building your AI-powered company</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                {...register('name')}
                placeholder="John Doe"
                icon={<User className="w-4 h-4" />}
                disabled={isLoading}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                {...register('email')}
                type="email"
                placeholder="name@company.com"
                icon={<Mail className="w-4 h-4" />}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                {...register('password')}
                type="password"
                placeholder="Create a strong password"
                icon={<Lock className="w-4 h-4" />}
                disabled={isLoading}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}

              {/* Password requirements */}
              <div className="space-y-1 pt-2">
                {passwordRequirements.map((req) => (
                  <div
                    key={req.label}
                    className={`flex items-center gap-2 text-xs ${
                      req.met ? 'text-green-600' : 'text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center ${
                        req.met ? 'bg-green-500' : 'bg-muted'
                      }`}
                    >
                      {req.met && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {req.label}
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isLoading}>
              Create Account
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
