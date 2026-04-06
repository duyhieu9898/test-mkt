export type Locale = 'en' | 'ja' | 'vi' | 'ko';

export const locales: Locale[] = ['en', 'ja', 'vi', 'ko'];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  vi: 'Tiếng Việt',
  ko: '한국어',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇺🇸',
  ja: '🇯🇵',
  vi: '🇻🇳',
  ko: '🇰🇷',
};

const translations = {
  en: {
    // Nav
    nav_features: 'Features',
    nav_how_it_works: 'How it Works',
    nav_security: 'Security',
    nav_pricing: 'Pricing',
    nav_blog: 'Blog',
    nav_sign_in: 'Sign In',
    nav_get_started: 'Get Started',

    // Hero
    hero_badge: 'The Future of Business Automation',
    hero_title_1: 'Run Your Company with',
    hero_title_2: 'AI Agents',
    hero_desc: 'Launch and operate an entire business with just yourself. AI agents handle marketing, sales, content, and operations while you focus on strategy.',
    hero_cta: 'Start Free Trial',
    hero_demo: 'Watch Demo',

    // Dashboard preview
    preview_title: 'AI Company OS Dashboard',
    preview_agent_1: 'CEO Agent',
    preview_agent_2: 'Marketing Manager',
    preview_agent_3: 'Content Creator',
    preview_active: 'Active',
    preview_working: 'Working',

    // Features
    features_title: 'Everything You Need to Run a Company',
    features_desc: 'AI agents work together as a team, executing real tasks and delivering results.',
    feat_agents_title: 'Multi-Agent System',
    feat_agents_desc: 'CEO, Marketing, Sales, Content agents that communicate and coordinate automatically.',
    feat_commands_title: 'Natural Commands',
    feat_commands_desc: 'Just tell the system what you want in plain language or voice. No technical skills needed.',
    feat_analytics_title: 'Real-time Analytics',
    feat_analytics_desc: 'Track KPIs, budgets, and performance across all agents in a unified dashboard.',
    feat_budget_title: 'Budget Control',
    feat_budget_desc: 'Set spending limits and approval workflows. Stay in control while agents execute.',
    feat_improve_title: 'Self-Improving',
    feat_improve_desc: 'Agents learn and improve over time based on results and feedback.',
    feat_setup_title: 'Instant Setup',
    feat_setup_desc: 'Describe your business idea and get a full AI company structure in minutes.',

    // Security / Trust
    security_title: 'Your Data, Your Rules',
    security_desc: 'Enterprise-grade security with complete data sovereignty. Your business data stays private and protected.',
    sec_hash_title: 'Hashed & Encrypted',
    sec_hash_desc: 'All sensitive data is hashed with bcrypt (12 rounds) and encrypted at rest. Passwords and tokens are never stored in plain text.',
    sec_private_title: 'Private Data Storage',
    sec_private_desc: 'Your data is stored in your own isolated database — not shared cloud storage. Complete data sovereignty for your business.',
    sec_audit_title: 'Full Audit Trail',
    sec_audit_desc: 'Every agent action is logged with full context. Complete transparency and accountability for all AI decisions.',
    sec_zero_title: 'Zero Trust Architecture',
    sec_zero_desc: 'All services authenticate independently. No implicit trust between components. Human approval required for critical decisions.',
    sec_gdpr_title: 'GDPR & Compliance Ready',
    sec_gdpr_desc: 'Built with privacy-by-design principles. Data minimization, consent tracking, and right-to-deletion support.',
    sec_budget_title: 'Budget Enforcement',
    sec_budget_desc: 'Hard spending limits with automatic throttling. AI agents cannot exceed your budget — ever.',

    // CTA
    cta_title: 'Ready to Launch Your AI Company?',
    cta_desc: 'Join innovative founders running businesses with AI. Start free, scale as you grow.',
    cta_button: 'Get Started Free',

    // Footer
    footer_copyright: '2025 1Person. AI Company OS.',
    footer_privacy: 'Privacy Policy',
    footer_terms: 'Terms of Service',
    footer_blog: 'Blog',
  },

  ja: {
    nav_features: '機能',
    nav_how_it_works: '使い方',
    nav_security: 'セキュリティ',
    nav_pricing: '料金',
    nav_blog: 'ブログ',
    nav_sign_in: 'ログイン',
    nav_get_started: '始める',

    hero_badge: 'ビジネス自動化の未来',
    hero_title_1: 'AIエージェントで',
    hero_title_2: '会社を運営',
    hero_desc: 'たった一人でビジネス全体を立ち上げ、運営できます。AIエージェントがマーケティング、営業、コンテンツ、オペレーションを担当し、あなたは戦略に集中できます。',
    hero_cta: '無料トライアル開始',
    hero_demo: 'デモを見る',

    preview_title: 'AI企業OSダッシュボード',
    preview_agent_1: 'CEOエージェント',
    preview_agent_2: 'マーケティング',
    preview_agent_3: 'コンテンツ',
    preview_active: '稼働中',
    preview_working: '作業中',

    features_title: '企業運営に必要なすべて',
    features_desc: 'AIエージェントがチームとして連携し、実際のタスクを実行して結果を出します。',
    feat_agents_title: 'マルチエージェントシステム',
    feat_agents_desc: 'CEO、マーケティング、営業、コンテンツエージェントが自動的に連携・調整します。',
    feat_commands_title: '自然言語コマンド',
    feat_commands_desc: 'やりたいことを日本語や音声で伝えるだけ。技術的なスキルは不要です。',
    feat_analytics_title: 'リアルタイム分析',
    feat_analytics_desc: 'KPI、予算、パフォーマンスを統合ダッシュボードで追跡します。',
    feat_budget_title: '予算管理',
    feat_budget_desc: '支出制限と承認ワークフローを設定。エージェントが実行する中で常にコントロール。',
    feat_improve_title: '自己改善',
    feat_improve_desc: 'エージェントは結果とフィードバックに基づいて継続的に学習・改善します。',
    feat_setup_title: '即座にセットアップ',
    feat_setup_desc: 'ビジネスアイデアを説明するだけで、数分でAI企業構造が完成します。',

    security_title: 'あなたのデータ、あなたのルール',
    security_desc: 'エンタープライズグレードのセキュリティと完全なデータ主権。ビジネスデータはプライベートに保護されます。',
    sec_hash_title: 'ハッシュ化＆暗号化',
    sec_hash_desc: 'すべての機密データはbcrypt（12ラウンド）でハッシュ化され、保存時に暗号化されます。パスワードやトークンは平文で保存されません。',
    sec_private_title: 'プライベートデータストレージ',
    sec_private_desc: 'データは独自の隔離されたデータベースに保存されます。共有クラウドストレージではありません。完全なデータ主権。',
    sec_audit_title: '完全な監査証跡',
    sec_audit_desc: 'すべてのエージェントアクションは完全なコンテキストと共にログされます。すべてのAI意思決定の透明性と説明責任。',
    sec_zero_title: 'ゼロトラストアーキテクチャ',
    sec_zero_desc: 'すべてのサービスが独立して認証。コンポーネント間の暗黙の信頼なし。重要な決定には人間の承認が必要。',
    sec_gdpr_title: 'GDPR＆コンプライアンス対応',
    sec_gdpr_desc: 'プライバシー・バイ・デザインの原則で構築。データ最小化、同意追跡、削除権をサポート。',
    sec_budget_title: '予算強制',
    sec_budget_desc: '自動スロットリングによるハードな支出制限。AIエージェントは決してあなたの予算を超えません。',

    cta_title: 'AI企業を立ち上げる準備はできていますか？',
    cta_desc: 'AIでビジネスを運営する革新的な創業者に参加しましょう。無料で始めて、成長に合わせてスケール。',
    cta_button: '無料で始める',

    footer_copyright: '2025 1Person. AI企業OS。',
    footer_privacy: 'プライバシーポリシー',
    footer_terms: '利用規約',
    footer_blog: 'ブログ',
  },

  vi: {
    nav_features: 'Tính năng',
    nav_how_it_works: 'Cách hoạt động',
    nav_security: 'Bảo mật',
    nav_pricing: 'Bảng giá',
    nav_blog: 'Blog',
    nav_sign_in: 'Đăng nhập',
    nav_get_started: 'Bắt đầu',

    hero_badge: 'Tương lai của tự động hóa doanh nghiệp',
    hero_title_1: 'Vận hành công ty với',
    hero_title_2: 'AI Agents',
    hero_desc: 'Khởi nghiệp và vận hành toàn bộ doanh nghiệp chỉ với một mình bạn. AI agents xử lý marketing, bán hàng, nội dung và vận hành — bạn chỉ cần tập trung vào chiến lược.',
    hero_cta: 'Dùng thử miễn phí',
    hero_demo: 'Xem Demo',

    preview_title: 'Bảng điều khiển AI Company OS',
    preview_agent_1: 'CEO Agent',
    preview_agent_2: 'Marketing',
    preview_agent_3: 'Nội dung',
    preview_active: 'Hoạt động',
    preview_working: 'Đang làm',

    features_title: 'Mọi thứ bạn cần để vận hành công ty',
    features_desc: 'Các AI agents làm việc nhóm, thực thi tác vụ thực và mang lại kết quả.',
    feat_agents_title: 'Hệ thống Multi-Agent',
    feat_agents_desc: 'CEO, Marketing, Sales, Content agents tự động giao tiếp và phối hợp với nhau.',
    feat_commands_title: 'Lệnh tự nhiên',
    feat_commands_desc: 'Chỉ cần nói hoặc gõ yêu cầu bằng ngôn ngữ tự nhiên. Không cần kỹ năng kỹ thuật.',
    feat_analytics_title: 'Phân tích thời gian thực',
    feat_analytics_desc: 'Theo dõi KPI, ngân sách và hiệu suất của tất cả agents trên một dashboard.',
    feat_budget_title: 'Kiểm soát ngân sách',
    feat_budget_desc: 'Thiết lập giới hạn chi tiêu và quy trình phê duyệt. Luôn kiểm soát khi agents thực thi.',
    feat_improve_title: 'Tự cải thiện',
    feat_improve_desc: 'Agents học hỏi và cải thiện theo thời gian dựa trên kết quả và phản hồi.',
    feat_setup_title: 'Thiết lập ngay lập tức',
    feat_setup_desc: 'Mô tả ý tưởng kinh doanh và nhận cấu trúc công ty AI đầy đủ trong vài phút.',

    security_title: 'Dữ liệu của bạn, quy tắc của bạn',
    security_desc: 'Bảo mật cấp doanh nghiệp với chủ quyền dữ liệu hoàn toàn. Dữ liệu kinh doanh được bảo vệ riêng tư.',
    sec_hash_title: 'Hash & Mã hóa',
    sec_hash_desc: 'Tất cả dữ liệu nhạy cảm được hash bằng bcrypt (12 rounds) và mã hóa khi lưu trữ. Mật khẩu và token không bao giờ lưu dạng văn bản thuần.',
    sec_private_title: 'Lưu trữ dữ liệu riêng',
    sec_private_desc: 'Dữ liệu được lưu trong database riêng biệt — không phải cloud storage chung. Chủ quyền dữ liệu hoàn toàn cho doanh nghiệp.',
    sec_audit_title: 'Nhật ký kiểm toán đầy đủ',
    sec_audit_desc: 'Mọi hành động của agent đều được ghi log với đầy đủ ngữ cảnh. Minh bạch và có trách nhiệm giải trình.',
    sec_zero_title: 'Kiến trúc Zero Trust',
    sec_zero_desc: 'Tất cả dịch vụ xác thực độc lập. Không tin tưởng ngầm giữa các thành phần. Quyết định quan trọng cần phê duyệt của người.',
    sec_gdpr_title: 'Sẵn sàng GDPR & Compliance',
    sec_gdpr_desc: 'Xây dựng theo nguyên tắc privacy-by-design. Hỗ trợ tối thiểu hóa dữ liệu, theo dõi đồng ý và quyền xóa.',
    sec_budget_title: 'Thực thi ngân sách',
    sec_budget_desc: 'Giới hạn chi tiêu cứng với tự động throttling. AI agents không bao giờ vượt quá ngân sách của bạn.',

    cta_title: 'Sẵn sàng khởi chạy công ty AI?',
    cta_desc: 'Tham gia cùng các nhà sáng lập tiên phong vận hành doanh nghiệp với AI. Bắt đầu miễn phí, mở rộng khi phát triển.',
    cta_button: 'Bắt đầu miễn phí',

    footer_copyright: '2025 1Person. AI Company OS.',
    footer_privacy: 'Chính sách bảo mật',
    footer_terms: 'Điều khoản dịch vụ',
    footer_blog: 'Blog',
  },

  ko: {
    nav_features: '기능',
    nav_how_it_works: '작동 방식',
    nav_security: '보안',
    nav_pricing: '요금',
    nav_blog: '블로그',
    nav_sign_in: '로그인',
    nav_get_started: '시작하기',

    hero_badge: '비즈니스 자동화의 미래',
    hero_title_1: 'AI 에이전트로',
    hero_title_2: '회사를 운영하세요',
    hero_desc: '혼자서 전체 비즈니스를 시작하고 운영하세요. AI 에이전트가 마케팅, 영업, 콘텐츠, 운영을 담당하고 당신은 전략에 집중하세요.',
    hero_cta: '무료 체험 시작',
    hero_demo: '데모 보기',

    preview_title: 'AI 기업 OS 대시보드',
    preview_agent_1: 'CEO 에이전트',
    preview_agent_2: '마케팅 매니저',
    preview_agent_3: '콘텐츠 크리에이터',
    preview_active: '활성',
    preview_working: '작업 중',

    features_title: '회사 운영에 필요한 모든 것',
    features_desc: 'AI 에이전트가 팀으로 협력하여 실제 작업을 수행하고 결과를 제공합니다.',
    feat_agents_title: '멀티 에이전트 시스템',
    feat_agents_desc: 'CEO, 마케팅, 영업, 콘텐츠 에이전트가 자동으로 소통하고 조율합니다.',
    feat_commands_title: '자연어 명령',
    feat_commands_desc: '원하는 것을 자연어나 음성으로 말하세요. 기술적 스킬이 필요 없습니다.',
    feat_analytics_title: '실시간 분석',
    feat_analytics_desc: 'KPI, 예산, 성과를 통합 대시보드에서 추적합니다.',
    feat_budget_title: '예산 관리',
    feat_budget_desc: '지출 한도와 승인 워크플로우를 설정하세요. 에이전트가 실행하는 동안 항상 통제.',
    feat_improve_title: '자기 개선',
    feat_improve_desc: '에이전트는 결과와 피드백을 기반으로 지속적으로 학습하고 개선합니다.',
    feat_setup_title: '즉시 설정',
    feat_setup_desc: '비즈니스 아이디어를 설명하면 몇 분 안에 완전한 AI 기업 구조를 얻을 수 있습니다.',

    security_title: '당신의 데이터, 당신의 규칙',
    security_desc: '완전한 데이터 주권을 가진 엔터프라이즈급 보안. 비즈니스 데이터는 비공개로 보호됩니다.',
    sec_hash_title: '해시 및 암호화',
    sec_hash_desc: '모든 민감한 데이터는 bcrypt(12라운드)로 해시되고 저장 시 암호화됩니다. 비밀번호와 토큰은 절대 평문으로 저장되지 않습니다.',
    sec_private_title: '프라이빗 데이터 스토리지',
    sec_private_desc: '데이터는 공유 클라우드 스토리지가 아닌 자체 격리된 데이터베이스에 저장됩니다. 완전한 데이터 주권.',
    sec_audit_title: '완전한 감사 추적',
    sec_audit_desc: '모든 에이전트 작업이 전체 컨텍스트와 함께 기록됩니다. 모든 AI 결정에 대한 투명성과 책임.',
    sec_zero_title: '제로 트러스트 아키텍처',
    sec_zero_desc: '모든 서비스가 독립적으로 인증합니다. 컴포넌트 간 암묵적 신뢰 없음. 중요한 결정에는 사람의 승인 필요.',
    sec_gdpr_title: 'GDPR 및 컴플라이언스 준비',
    sec_gdpr_desc: '프라이버시 바이 디자인 원칙으로 구축. 데이터 최소화, 동의 추적, 삭제 권리 지원.',
    sec_budget_title: '예산 강제',
    sec_budget_desc: '자동 스로틀링이 있는 엄격한 지출 한도. AI 에이전트는 절대 예산을 초과하지 않습니다.',

    cta_title: 'AI 회사를 시작할 준비가 되셨나요?',
    cta_desc: 'AI로 비즈니스를 운영하는 혁신적인 창업자들과 함께하세요. 무료로 시작하고, 성장에 따라 확장하세요.',
    cta_button: '무료로 시작하기',

    footer_copyright: '2025 1Person. AI Company OS.',
    footer_privacy: '개인정보 처리방침',
    footer_terms: '이용약관',
    footer_blog: '블로그',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale]?.[key] || translations.en[key] || key;
}

export function getTranslations(locale: Locale) {
  return translations[locale] || translations.en;
}
