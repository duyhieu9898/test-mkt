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
import { useMemo, useState } from 'react';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';

type RegisterForm = {
  name: string;
  email: string;
  password: string;
};

const registerCopy = {
  en: {
    nameMin: 'Name must be at least 2 characters',
    invalidEmail: 'Please enter a valid email',
    passwordMin: 'Password must be at least 8 characters',
    accountCreatedToast: 'Account created!',
    failedToast: 'Registration failed',
    pendingTitle: 'Account Created!',
    pendingDesc: "Your registration is pending admin approval.\nYou'll be able to sign in once your account is approved.",
    pendingTime: 'This usually takes less than 24 hours.',
    goToSignIn: 'Go to Sign In',
    createAccountTitle: 'Create your account',
    createAccountDesc: 'Start building your AI-powered company',
    fullName: 'Full Name',
    namePlaceholder: 'John Doe',
    email: 'Email',
    password: 'Password',
    passwordPlaceholder: 'Create a strong password',
    reqLength: 'At least 8 characters',
    reqNumber: 'Contains a number',
    reqLetter: 'Contains a letter',
    createAccount: 'Create Account',
    termsPrefix: 'By creating an account, you agree to our',
    terms: 'Terms of Service',
    and: 'and',
    privacy: 'Privacy Policy',
    alreadyHave: 'Already have an account?',
    signIn: 'Sign in',
  },
  ja: {
    nameMin: '名前は2文字以上で入力してください',
    invalidEmail: '有効なメールアドレスを入力してください',
    passwordMin: 'パスワードは8文字以上で入力してください',
    accountCreatedToast: 'アカウントを作成しました',
    failedToast: '登録に失敗しました',
    pendingTitle: 'アカウントを作成しました',
    pendingDesc: '登録は管理者の承認待ちです。\n承認後にログインできるようになります。',
    pendingTime: '通常24時間以内に完了します。',
    goToSignIn: 'ログインへ',
    createAccountTitle: 'アカウントを作成',
    createAccountDesc: 'AIで動く会社づくりを始めましょう',
    fullName: '氏名',
    namePlaceholder: '山田 太郎',
    email: 'メールアドレス',
    password: 'パスワード',
    passwordPlaceholder: '安全なパスワードを作成',
    reqLength: '8文字以上',
    reqNumber: '数字を含む',
    reqLetter: '英字を含む',
    createAccount: 'アカウント作成',
    termsPrefix: 'アカウントを作成すると、以下に同意したものとみなされます。',
    terms: '利用規約',
    and: 'および',
    privacy: 'プライバシーポリシー',
    alreadyHave: 'すでにアカウントをお持ちですか？',
    signIn: 'ログイン',
  },
};

export default function RegisterPage() {
  const router = useRouter();
  const registerMutation = useRegister();
  const [pendingApproval, setPendingApproval] = useState(false);
  const [language] = usePreferredAppLanguage('en');
  const copy = registerCopy[language];
  const registerSchema = useMemo(() => z.object({
    name: z.string().min(2, copy.nameMin),
    email: z.string().email(copy.invalidEmail),
    password: z.string().min(8, copy.passwordMin),
  }), [copy.invalidEmail, copy.nameMin, copy.passwordMin]);

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
    { label: copy.reqLength, met: password.length >= 8 },
    { label: copy.reqNumber, met: /\d/.test(password) },
    { label: copy.reqLetter, met: /[a-zA-Z]/.test(password) },
  ];

  const onSubmit = async (data: RegisterForm) => {
    try {
      const res = await registerMutation.mutateAsync(data);
      if ((res as any)?.pendingApproval) {
        setPendingApproval(true);
      } else {
        toast.success(copy.accountCreatedToast);
        router.push('/welcome');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.failedToast);
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
            <h2 className="text-xl font-bold mb-2">{copy.pendingTitle}</h2>
            <p className="whitespace-pre-line text-muted-foreground mb-4">
              {copy.pendingDesc}
            </p>
            <p className="text-xs text-muted-foreground">
              {copy.pendingTime}
            </p>
            <Link href="/login">
              <Button variant="outline" className="mt-6">
                {copy.goToSignIn}
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
          <CardTitle className="text-2xl font-bold">{copy.createAccountTitle}</CardTitle>
          <CardDescription>{copy.createAccountDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{copy.fullName}</label>
              <Input
                {...register('name')}
                placeholder={copy.namePlaceholder}
                icon={<User className="w-4 h-4" />}
                disabled={isLoading}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{copy.email}</label>
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
              <label className="text-sm font-medium">{copy.password}</label>
              <Input
                {...register('password')}
                type="password"
                placeholder={copy.passwordPlaceholder}
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
              {copy.createAccount}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {copy.termsPrefix}{' '}
            <Link href="/terms" className="text-primary hover:underline">
              {copy.terms}
            </Link>{' '}
            {copy.and}{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              {copy.privacy}
            </Link>
          </p>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {copy.alreadyHave}{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              {copy.signIn}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
