'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Coins, Loader2, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserAvatar } from '@/components/ui/avatar';
import {
  useAddCompanyMember,
  useCompanyMembers,
  useMyCompanyAccess,
  useRemoveCompanyMember,
  useUpdateCompanyMember,
} from '@/lib/api/company-access-hooks';
import {
  COMPANY_ROLE_OPTIONS,
  type CompanyAssignableRole,
  type CompanyRole,
} from '@/lib/company-access';
import { normalizeAppLanguage, type AppLanguage } from '@/lib/app-language';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';

type TeamAccessCopy = {
  title: string;
  subtitle: string;
  yourAccess: string;
  yourAccessDescription: string;
  checkingAccess: string;
  platformAdminOverride: string;
  addMember: string;
  addMemberDescription: string;
  email: string;
  role: string;
  add: string;
  companyTeam: string;
  companyTeamDescription: string;
  loadingTeam: string;
  limitedAccess: string;
  creditsUsed: string;
  owner: string;
  suspended: string;
  removeAccess: string;
  roleGuide: string;
  roleGuideDescription: string;
  enterEmail: string;
  accessUpdated: string;
  addFailed: string;
  roleUpdated: string;
  roleUpdateFailed: string;
  removed: string;
  removeFailed: string;
  roleLabels: Record<CompanyRole, string>;
  roleHelp: Record<CompanyRole, string[]>;
  roleDescriptions: Record<CompanyRole, string>;
};

const TEAM_ACCESS_COPY: Record<AppLanguage, TeamAccessCopy> = {
  en: {
    title: 'Team Access',
    subtitle: 'Give each person a simple work role. 1Person handles the technical permissions behind the scenes.',
    yourAccess: 'Your access',
    yourAccessDescription: 'This is what you can do inside this company.',
    checkingAccess: 'Checking your access...',
    platformAdminOverride: 'Platform admin override',
    addMember: 'Add a team member',
    addMemberDescription: 'Phase 1 supports users who already have a 1Person account. Invite email delivery can be added next.',
    email: 'Email',
    role: 'Role',
    add: 'Add',
    companyTeam: 'Company team',
    companyTeamDescription: 'Keep roles simple so non-technical users understand what they can do.',
    loadingTeam: 'Loading team...',
    limitedAccess: 'You can see your own access, but only Owner or Admin can manage the full team.',
    creditsUsed: 'Company credits used',
    owner: 'Owner',
    suspended: 'Suspended',
    removeAccess: 'Remove access',
    roleGuide: 'Role guide',
    roleGuideDescription: 'These presets keep permissions easy to explain. Custom roles can be added later for enterprise customers.',
    enterEmail: 'Enter the team member email first.',
    accessUpdated: 'Team access updated.',
    addFailed: 'Could not add team member.',
    roleUpdated: 'Role updated.',
    roleUpdateFailed: 'Could not update role.',
    removed: 'Member removed.',
    removeFailed: 'Could not remove member.',
    roleLabels: {
      owner: 'Owner',
      admin: 'Admin',
      marketing_lead: 'Marketing Lead',
      content_creator: 'Content Creator',
      analyst: 'Analyst',
      viewer: 'Viewer',
    },
    roleHelp: {
      owner: [
        'Full control over company settings, credits, members, channels, and publishing.',
        'Can remove members and make high-risk changes.',
      ],
      admin: [
        'Can manage most company settings and invite team members.',
        'Can create, launch, and publish marketing work.',
      ],
      marketing_lead: [
        'Can create campaigns, scan the market, and publish social posts.',
        'Cannot manage billing or invite/remove members.',
      ],
      content_creator: [
        'Can create and edit drafts for campaigns, blogs, banners, and landing pages.',
        'Publishing may require a lead or admin.',
      ],
      analyst: [
        'Can review strategy, market intelligence, and performance.',
        'Cannot create or publish marketing assets.',
      ],
      viewer: [
        'Can view key pages and strategy context.',
        'Cannot change data or spend credits.',
      ],
    },
    roleDescriptions: {
      owner: 'Full control over company settings, credits, members, channels, and publishing.',
      admin: 'Manage most company settings, members, and marketing work.',
      marketing_lead: 'Create, launch, and publish marketing campaigns.',
      content_creator: 'Create and edit content drafts, assets, blogs, and landing page drafts.',
      analyst: 'View strategy, market, campaign, and performance data.',
      viewer: 'View company information without changing or publishing anything.',
    },
  },
  vi: {
    title: 'Quyền truy cập nhóm',
    subtitle: 'Gán cho mỗi người một vai trò công việc đơn giản. 1Person sẽ tự xử lý các quyền kỹ thuật phía sau.',
    yourAccess: 'Quyền của bạn',
    yourAccessDescription: 'Đây là những việc bạn có thể làm trong công ty này.',
    checkingAccess: 'Đang kiểm tra quyền của bạn...',
    platformAdminOverride: 'Quyền quản trị hệ thống',
    addMember: 'Thêm thành viên',
    addMemberDescription: 'Giai đoạn 1 hỗ trợ người dùng đã có tài khoản 1Person. Gửi email mời sẽ được bổ sung sau.',
    email: 'Email',
    role: 'Vai trò',
    add: 'Thêm',
    companyTeam: 'Đội ngũ công ty',
    companyTeamDescription: 'Giữ vai trò đơn giản để người dùng non-tech dễ hiểu mình có thể làm gì.',
    loadingTeam: 'Đang tải danh sách thành viên...',
    limitedAccess: 'Bạn có thể xem quyền của mình, nhưng chỉ Owner hoặc Admin mới quản lý được toàn bộ team.',
    creditsUsed: 'Credit công ty đã dùng',
    owner: 'Chủ sở hữu',
    suspended: 'Đã tạm khóa',
    removeAccess: 'Xóa quyền truy cập',
    roleGuide: 'Hướng dẫn vai trò',
    roleGuideDescription: 'Các vai trò có sẵn giúp quyền hạn dễ hiểu. Custom role có thể bổ sung sau cho khách hàng enterprise.',
    enterEmail: 'Hãy nhập email thành viên trước.',
    accessUpdated: 'Đã cập nhật quyền truy cập.',
    addFailed: 'Không thể thêm thành viên.',
    roleUpdated: 'Đã cập nhật vai trò.',
    roleUpdateFailed: 'Không thể cập nhật vai trò.',
    removed: 'Đã xóa thành viên.',
    removeFailed: 'Không thể xóa thành viên.',
    roleLabels: {
      owner: 'Chủ sở hữu',
      admin: 'Quản trị',
      marketing_lead: 'Trưởng nhóm Marketing',
      content_creator: 'Người tạo nội dung',
      analyst: 'Phân tích',
      viewer: 'Chỉ xem',
    },
    roleHelp: {
      owner: [
        'Toàn quyền với cài đặt công ty, credit, thành viên, kênh kết nối và publish.',
        'Có thể xóa thành viên và thực hiện các thay đổi quan trọng.',
      ],
      admin: [
        'Có thể quản lý phần lớn cài đặt công ty và mời thành viên.',
        'Có thể tạo, launch và publish các hoạt động marketing.',
      ],
      marketing_lead: [
        'Có thể tạo campaign, scan thị trường và publish social posts.',
        'Không quản lý billing hoặc mời/xóa thành viên.',
      ],
      content_creator: [
        'Có thể tạo và chỉnh sửa draft campaign, blog, banner và landing page.',
        'Publish có thể cần lead hoặc admin phê duyệt.',
      ],
      analyst: [
        'Có thể xem chiến lược, market intelligence và performance.',
        'Không thể tạo hoặc publish tài sản marketing.',
      ],
      viewer: [
        'Có thể xem các trang chính và bối cảnh chiến lược.',
        'Không thể thay đổi dữ liệu hoặc tiêu credit.',
      ],
    },
    roleDescriptions: {
      owner: 'Toàn quyền với công ty, credit, thành viên, kênh kết nối và publish.',
      admin: 'Quản lý phần lớn cài đặt công ty, thành viên và công việc marketing.',
      marketing_lead: 'Tạo, launch và publish campaign marketing.',
      content_creator: 'Tạo và chỉnh sửa draft nội dung, asset, blog và landing page.',
      analyst: 'Xem chiến lược, market, campaign và performance.',
      viewer: 'Chỉ xem thông tin công ty, không thay đổi hoặc publish.',
    },
  },
  ja: {
    title: 'チーム権限',
    subtitle: '各メンバーに分かりやすい役割を設定します。技術的な権限管理は1Personが裏側で処理します。',
    yourAccess: 'あなたの権限',
    yourAccessDescription: 'この会社内であなたが実行できる内容です。',
    checkingAccess: '権限を確認しています...',
    platformAdminOverride: 'プラットフォーム管理者権限',
    addMember: 'メンバーを追加',
    addMemberDescription: 'フェーズ1では、すでに1Personアカウントを持つユーザーを追加できます。招待メール送信は次フェーズで追加できます。',
    email: 'メール',
    role: '役割',
    add: '追加',
    companyTeam: '会社チーム',
    companyTeamDescription: '非エンジニアのユーザーにも分かりやすいよう、役割はシンプルに保ちます。',
    loadingTeam: 'チームを読み込んでいます...',
    limitedAccess: '自分の権限は確認できますが、チーム全体を管理できるのはオーナーまたは管理者のみです。',
    creditsUsed: '使用済みの会社クレジット',
    owner: 'オーナー',
    suspended: '停止中',
    removeAccess: '権限を削除',
    roleGuide: '役割ガイド',
    roleGuideDescription: 'これらのプリセットにより、権限を分かりやすく説明できます。将来的にエンタープライズ向けのカスタムロールを追加できます。',
    enterEmail: 'まずメンバーのメールアドレスを入力してください。',
    accessUpdated: 'チーム権限を更新しました。',
    addFailed: 'メンバーを追加できませんでした。',
    roleUpdated: '役割を更新しました。',
    roleUpdateFailed: '役割を更新できませんでした。',
    removed: 'メンバーを削除しました。',
    removeFailed: 'メンバーを削除できませんでした。',
    roleLabels: {
      owner: 'オーナー',
      admin: '管理者',
      marketing_lead: 'マーケティング責任者',
      content_creator: 'コンテンツ担当',
      analyst: 'アナリスト',
      viewer: '閲覧のみ',
    },
    roleHelp: {
      owner: [
        '会社設定、クレジット、メンバー、連携チャネル、公開操作をすべて管理できます。',
        'メンバー削除や重要な変更を実行できます。',
      ],
      admin: [
        '会社設定の大部分とメンバー招待を管理できます。',
        'マーケティング施策の作成、開始、公開ができます。',
      ],
      marketing_lead: [
        'キャンペーン作成、市場スキャン、SNS投稿の公開ができます。',
        '請求管理やメンバーの招待・削除はできません。',
      ],
      content_creator: [
        'キャンペーン、ブログ、バナー、ランディングページの下書きを作成・編集できます。',
        '公開にはリードまたは管理者の承認が必要な場合があります。',
      ],
      analyst: [
        '戦略、市場情報、パフォーマンスを確認できます。',
        'マーケティングアセットの作成や公開はできません。',
      ],
      viewer: [
        '主要ページと戦略コンテキストを閲覧できます。',
        'データ変更やクレジット消費はできません。',
      ],
    },
    roleDescriptions: {
      owner: '会社、クレジット、メンバー、チャネル、公開操作を完全に管理できます。',
      admin: '会社設定、メンバー、マーケティング作業の大部分を管理できます。',
      marketing_lead: 'マーケティングキャンペーンの作成、開始、公開ができます。',
      content_creator: 'コンテンツ下書き、素材、ブログ、ランディングページを作成・編集できます。',
      analyst: '戦略、市場、キャンペーン、パフォーマンスデータを確認できます。',
      viewer: '会社情報を閲覧できますが、変更や公開はできません。',
    },
  },
};

export default function TeamAccessPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [language] = usePreferredAppLanguage('en');
  const copy = TEAM_ACCESS_COPY[normalizeAppLanguage(language)];
  const access = useMyCompanyAccess(companyId);
  const members = useCompanyMembers(companyId);
  const addMember = useAddCompanyMember(companyId);
  const updateMember = useUpdateCompanyMember(companyId);
  const removeMember = useRemoveCompanyMember(companyId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyAssignableRole>('content_creator');

  const currentRole = access.data?.role ?? 'viewer';
  const roleHelp = copy.roleHelp[currentRole] ?? copy.roleHelp.viewer;
  const activeMembers = useMemo(() => members.data?.members ?? [], [members.data?.members]);

  const handleAddMember = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      toast.error(copy.enterEmail);
      return;
    }
    try {
      await addMember.mutateAsync({ email: cleanEmail, role });
      setEmail('');
      setRole('content_creator');
      toast.success(copy.accessUpdated);
    } catch (error) {
      toast.error((error as Error).message || copy.addFailed);
    }
  };

  const handleRoleChange = async (memberId: string, nextRole: CompanyAssignableRole) => {
    try {
      await updateMember.mutateAsync({ memberId, role: nextRole });
      toast.success(copy.roleUpdated);
    } catch (error) {
      toast.error((error as Error).message || copy.roleUpdateFailed);
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await removeMember.mutateAsync(memberId);
      toast.success(copy.removed);
    } catch (error) {
      toast.error((error as Error).message || copy.removeFailed);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-1">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{copy.title}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy.subtitle}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {copy.yourAccess}
          </CardTitle>
          <CardDescription>
            {copy.yourAccessDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {access.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.checkingAccess}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                  {copy.roleLabels[currentRole]}
                </Badge>
                {access.data?.isPlatformAdmin && (
                  <Badge variant="outline">{copy.platformAdminOverride}</Badge>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {roleHelp.map((item) => (
                  <div key={item} className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {access.data?.canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" />
              {copy.addMember}
            </CardTitle>
            <CardDescription>
              {copy.addMemberDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
              <div className="space-y-1.5">
                <Label>{copy.email}</Label>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="teammate@company.com"
                  type="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{copy.role}</Label>
                <Select value={role} onValueChange={(value) => setRole(value as CompanyAssignableRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option.role} value={option.role}>
                        {copy.roleLabels[option.role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddMember} disabled={addMember.isPending} className="gap-2">
                {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {copy.add}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {copy.companyTeam}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.loadingTeam}
            </div>
          ) : members.error ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {copy.limitedAccess}
            </div>
          ) : (
            activeMembers.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar src={member.user.avatarUrl ?? undefined} name={member.user.name} size="sm" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{member.user.name}</p>
                      {member.isOwner && <Badge variant="secondary">{copy.owner}</Badge>}
                      {member.status === 'suspended' && <Badge variant="destructive">{copy.suspended}</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                      <Coins className="h-3.5 w-3.5" />
                      <span>{copy.creditsUsed}: {(member.creditsUsed ?? 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {member.editable && access.data?.canManageMembers ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) => handleRoleChange(member.id, value as CompanyAssignableRole)}
                      disabled={updateMember.isPending}
                    >
                      <SelectTrigger className="w-[190px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPANY_ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.role} value={option.role}>
                            {copy.roleLabels[option.role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{copy.roleLabels[member.role]}</Badge>
                  )}

                  {member.editable && access.data?.canManageMembers && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(member.id)}
                      disabled={removeMember.isPending}
                      title={copy.removeAccess}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">{copy.roleGuide}</CardTitle>
          <CardDescription>
            {copy.roleGuideDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {[
            { role: 'owner' as const },
            ...COMPANY_ROLE_OPTIONS,
          ].map((item) => (
            <div key={item.role} className="rounded-lg bg-muted/30 p-3">
              <div className="font-medium">{copy.roleLabels[item.role]}</div>
              <p className="mt-1 text-sm text-muted-foreground">{copy.roleDescriptions[item.role]}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
