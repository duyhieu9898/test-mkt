import { normalizeAppLanguage, type AppLanguage } from '@/lib/app-language';

type PermissionErrorCode =
  | 'PERMISSION_COMPANY_MANAGE_MEMBERS_DENIED'
  | 'PERMISSION_CHANNELS_CONNECT_DENIED'
  | 'PERMISSION_BRAND_IQ_EDIT_DENIED'
  | 'PERMISSION_MARKET_SCAN_DENIED'
  | 'PERMISSION_CAMPAIGN_PUBLISH_SOCIAL_DENIED'
  | 'PERMISSION_CAMPAIGN_LAUNCH_DENIED'
  | 'PERMISSION_CAMPAIGN_CREATE_DENIED'
  | 'PERMISSION_CAMPAIGN_GENERATE_AI_DENIED'
  | 'PERMISSION_CAMPAIGN_EDIT_DENIED'
  | 'PERMISSION_KNOWLEDGE_UPLOAD_DENIED'
  | 'PERMISSION_KNOWLEDGE_VIEW_INTERNAL_DENIED'
  | 'PERMISSION_KNOWLEDGE_APPROVE_DENIED'
  | 'PERMISSION_CEO_ADVISOR_REFRESH_DENIED'
  | 'PERMISSION_LANDING_PAGE_CREATE_DENIED'
  | 'PERMISSION_LANDING_PAGE_EDIT_DENIED'
  | 'PERMISSION_LANDING_PAGE_PUBLISH_REQUEST_DENIED'
  | 'PERMISSION_LANDING_PAGE_PUBLISH_DIRECT_DENIED'
  | 'PERMISSION_CREDITS_SPEND_DENIED'
  | 'PERMISSION_CREDITS_MANAGE_DENIED'
  | 'PERMISSION_CREDITS_VIEW_DENIED'
  | 'PERMISSION_DENIED';

const messages: Record<AppLanguage, Record<PermissionErrorCode, string>> = {
  en: {
    PERMISSION_DENIED: 'You do not have access to perform this action in this company.',
    PERMISSION_COMPANY_MANAGE_MEMBERS_DENIED: 'Only the company Owner or Admin can manage team access.',
    PERMISSION_CHANNELS_CONNECT_DENIED: 'Only the company Owner or Admin can connect external channels because this grants publishing access.',
    PERMISSION_BRAND_IQ_EDIT_DENIED: 'You can view Brand IQ, but only the company Owner, Admin, or Marketing Lead can edit it.',
    PERMISSION_MARKET_SCAN_DENIED: 'You can review market insights, but your role cannot add competitors or run market scans.',
    PERMISSION_CAMPAIGN_PUBLISH_SOCIAL_DENIED: 'You can review this campaign, but only an Owner, Admin, or Marketing Lead can publish it.',
    PERMISSION_CAMPAIGN_LAUNCH_DENIED: 'You can review this campaign, but only an Owner, Admin, or Marketing Lead can launch it.',
    PERMISSION_CAMPAIGN_CREATE_DENIED: 'You can review campaigns, but your role cannot create campaigns or spend AI credits.',
    PERMISSION_CAMPAIGN_GENERATE_AI_DENIED: 'You can review campaigns, but your role cannot generate AI campaign content.',
    PERMISSION_CAMPAIGN_EDIT_DENIED: 'You can review this campaign, but your role cannot edit campaign assets or social posts.',
    PERMISSION_KNOWLEDGE_UPLOAD_DENIED: 'You can view company knowledge, but your role cannot upload documents or meetings.',
    PERMISSION_KNOWLEDGE_VIEW_INTERNAL_DENIED: 'Your role cannot view internal company knowledge or meeting records.',
    PERMISSION_KNOWLEDGE_APPROVE_DENIED: 'You can review knowledge items, but your role cannot approve them into the company brain.',
    PERMISSION_CEO_ADVISOR_REFRESH_DENIED: 'You can view CEO Advisor, but only the company Owner or Admin can generate or refresh advice.',
    PERMISSION_LANDING_PAGE_CREATE_DENIED: 'You can review landing pages, but your role cannot create new pages.',
    PERMISSION_LANDING_PAGE_EDIT_DENIED: 'You can review landing pages, but your role cannot edit them.',
    PERMISSION_LANDING_PAGE_PUBLISH_REQUEST_DENIED: 'Your role cannot request landing page publishing.',
    PERMISSION_LANDING_PAGE_PUBLISH_DIRECT_DENIED: 'Only an Owner or Admin can publish or take landing pages offline directly.',
    PERMISSION_CREDITS_SPEND_DENIED: 'Your role cannot spend company credits. Ask an Owner or Admin to change your access.',
    PERMISSION_CREDITS_MANAGE_DENIED: 'Only the company Owner or Admin can manage company credits and billing.',
    PERMISSION_CREDITS_VIEW_DENIED: 'You do not have access to view company credits.',
  },
  vi: {
    PERMISSION_DENIED: 'Bạn không có quyền thực hiện thao tác này trong công ty.',
    PERMISSION_COMPANY_MANAGE_MEMBERS_DENIED: 'Chỉ Chủ sở hữu hoặc Quản trị viên công ty mới có thể quản lý quyền truy cập nhóm.',
    PERMISSION_CHANNELS_CONNECT_DENIED: 'Chỉ Chủ sở hữu hoặc Quản trị viên công ty mới có thể kết nối kênh bên ngoài vì thao tác này cấp quyền đăng tải.',
    PERMISSION_BRAND_IQ_EDIT_DENIED: 'Bạn có thể xem Brand IQ, nhưng chỉ Owner, Admin hoặc Marketing Lead của công ty mới có thể chỉnh sửa.',
    PERMISSION_MARKET_SCAN_DENIED: 'Bạn có thể xem insight thị trường, nhưng vai trò của bạn không thể thêm đối thủ hoặc chạy quét thị trường.',
    PERMISSION_CAMPAIGN_PUBLISH_SOCIAL_DENIED: 'Bạn có thể xem chiến dịch này, nhưng chỉ Chủ sở hữu, Quản trị viên hoặc Marketing Lead mới có thể đăng bài.',
    PERMISSION_CAMPAIGN_LAUNCH_DENIED: 'Bạn có thể xem chiến dịch này, nhưng chỉ Chủ sở hữu, Quản trị viên hoặc Marketing Lead mới có thể launch chiến dịch.',
    PERMISSION_CAMPAIGN_CREATE_DENIED: 'Bạn có thể xem chiến dịch, nhưng vai trò của bạn không thể tạo chiến dịch hoặc dùng credit AI.',
    PERMISSION_CAMPAIGN_GENERATE_AI_DENIED: 'Bạn có thể xem chiến dịch, nhưng vai trò của bạn không thể tạo nội dung AI cho campaign.',
    PERMISSION_CAMPAIGN_EDIT_DENIED: 'Bạn có thể xem chiến dịch này, nhưng vai trò của bạn không thể chỉnh sửa asset hoặc bài social.',
    PERMISSION_KNOWLEDGE_UPLOAD_DENIED: 'Bạn có thể xem kiến thức công ty, nhưng vai trò của bạn không thể tải tài liệu hoặc meeting lên.',
    PERMISSION_KNOWLEDGE_VIEW_INTERNAL_DENIED: 'Vai trò của bạn không thể xem kiến thức nội bộ hoặc bản ghi meeting của công ty.',
    PERMISSION_KNOWLEDGE_APPROVE_DENIED: 'Bạn có thể xem các mục kiến thức, nhưng vai trò của bạn không thể duyệt chúng vào company brain.',
    PERMISSION_CEO_ADVISOR_REFRESH_DENIED: 'Bạn có thể xem CEO Advisor, nhưng chỉ Owner hoặc Admin của công ty mới có thể tạo mới hoặc refresh advice.',
    PERMISSION_LANDING_PAGE_CREATE_DENIED: 'Bạn có thể xem landing page, nhưng vai trò của bạn không thể tạo page mới.',
    PERMISSION_LANDING_PAGE_EDIT_DENIED: 'Bạn có thể xem landing page, nhưng vai trò của bạn không thể chỉnh sửa.',
    PERMISSION_LANDING_PAGE_PUBLISH_REQUEST_DENIED: 'Vai trò của bạn không thể gửi yêu cầu publish landing page.',
    PERMISSION_LANDING_PAGE_PUBLISH_DIRECT_DENIED: 'Chỉ Chủ sở hữu hoặc Quản trị viên mới có thể publish hoặc take offline landing page trực tiếp.',
    PERMISSION_CREDITS_SPEND_DENIED: 'Vai trò của bạn không thể dùng credit công ty. Hãy nhờ Chủ sở hữu hoặc Quản trị viên cập nhật quyền truy cập.',
    PERMISSION_CREDITS_MANAGE_DENIED: 'Chỉ Chủ sở hữu hoặc Quản trị viên công ty mới có thể quản lý credit và billing.',
    PERMISSION_CREDITS_VIEW_DENIED: 'Bạn không có quyền xem credit của công ty.',
  },
  ja: {
    PERMISSION_DENIED: 'この会社でこの操作を実行する権限がありません。',
    PERMISSION_COMPANY_MANAGE_MEMBERS_DENIED: 'チームアクセスを管理できるのは、会社のオーナーまたは管理者のみです。',
    PERMISSION_CHANNELS_CONNECT_DENIED: '外部チャネルの接続は投稿権限を付与するため、会社のオーナーまたは管理者のみ実行できます。',
    PERMISSION_BRAND_IQ_EDIT_DENIED: 'Brand IQは閲覧できますが、編集できるのは会社のOwner、Admin、またはMarketing Leadのみです。',
    PERMISSION_MARKET_SCAN_DENIED: '市場インサイトは確認できますが、あなたの権限では競合の追加や市場スキャンは実行できません。',
    PERMISSION_CAMPAIGN_PUBLISH_SOCIAL_DENIED: 'このキャンペーンは確認できますが、投稿できるのはオーナー、管理者、またはMarketing Leadのみです。',
    PERMISSION_CAMPAIGN_LAUNCH_DENIED: 'このキャンペーンは確認できますが、ローンチできるのはオーナー、管理者、またはMarketing Leadのみです。',
    PERMISSION_CAMPAIGN_CREATE_DENIED: 'キャンペーンは確認できますが、あなたの権限ではキャンペーン作成やAIクレジットの使用はできません。',
    PERMISSION_CAMPAIGN_GENERATE_AI_DENIED: 'キャンペーンは確認できますが、あなたの権限ではAIキャンペーンコンテンツを生成できません。',
    PERMISSION_CAMPAIGN_EDIT_DENIED: 'このキャンペーンは確認できますが、あなたの権限ではキャンペーン素材やSNS投稿を編集できません。',
    PERMISSION_KNOWLEDGE_UPLOAD_DENIED: '会社ナレッジは確認できますが、あなたの権限ではドキュメントやミーティングをアップロードできません。',
    PERMISSION_KNOWLEDGE_VIEW_INTERNAL_DENIED: 'あなたの権限では社内ナレッジやミーティング記録を閲覧できません。',
    PERMISSION_KNOWLEDGE_APPROVE_DENIED: 'ナレッジ項目は確認できますが、あなたの権限では会社のBrainへ承認できません。',
    PERMISSION_CEO_ADVISOR_REFRESH_DENIED: 'CEO Advisorは閲覧できますが、アドバイスの生成または更新は会社のOwnerまたはAdminのみ実行できます。',
    PERMISSION_LANDING_PAGE_CREATE_DENIED: 'ランディングページは確認できますが、あなたの権限では新しいページを作成できません。',
    PERMISSION_LANDING_PAGE_EDIT_DENIED: 'ランディングページは確認できますが、あなたの権限では編集できません。',
    PERMISSION_LANDING_PAGE_PUBLISH_REQUEST_DENIED: 'あなたの権限ではランディングページの公開申請はできません。',
    PERMISSION_LANDING_PAGE_PUBLISH_DIRECT_DENIED: 'ランディングページを直接公開またはオフライン化できるのは、オーナーまたは管理者のみです。',
    PERMISSION_CREDITS_SPEND_DENIED: 'あなたの権限では会社のクレジットを使用できません。オーナーまたは管理者にアクセス権の変更を依頼してください。',
    PERMISSION_CREDITS_MANAGE_DENIED: '会社のクレジットと請求を管理できるのは、オーナーまたは管理者のみです。',
    PERMISSION_CREDITS_VIEW_DENIED: '会社のクレジットを表示する権限がありません。',
  },
};

export function translatePermissionErrorCode(code?: unknown, language?: unknown) {
  if (typeof code !== 'string' || !code.startsWith('PERMISSION_')) return undefined;
  const key = code as PermissionErrorCode;
  const locale = normalizeAppLanguage(language);
  return messages[locale][key] ?? messages.en[key] ?? messages[locale].PERMISSION_DENIED;
}
