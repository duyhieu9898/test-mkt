export type Locale = 'en' | 'ja' | 'ko';

export const locales: Locale[] = ['en', 'ja', 'ko'];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇺🇸',
  ja: '🇯🇵',
  ko: '🇰🇷',
};

// =============================================================================
// Positioning (post-Claude-Managed-Agents rewrite)
// =============================================================================
// After Anthropic launched Claude Managed Agents (2026-04), the infrastructure
// layer of "running AI agents" is commoditized. 1Person's moat is what
// Managed Agents deliberately does NOT do:
//   1. Data sovereignty (Cloud / Private / On-Prem modes)
//   2. Business Brain (structured, editable brand/persona/product memory)
//   3. Tamper-evident audit chain
//   4. Vertical marketing execution (ads, landing pages, tracking)
//   5. Non-technical end-user UX
//
// Every string below leads with one of those five — never with "AI agents".
// "AI agents" is now a commodity word and users recognize it.
// =============================================================================

const translations = {
  en: {
    // Nav
    nav_features: 'Features',
    nav_how_it_works: 'How it Works',
    nav_security: 'Trust',
    nav_pricing: 'Pricing',
    nav_blog: 'Blog',
    nav_sign_in: 'Sign In',
    nav_get_started: 'Get Started',

    // Hero
    hero_badge: 'Your AI marketing team — with receipts',
    hero_title_1: 'AI that knows your brand.',
    hero_title_2: 'Data that stays yours.',
    hero_desc:
      "Generic AI doesn't know your business. 1Person builds a living Business Brain of your brand voice, products, and customers — then runs your marketing on infrastructure you can audit, verify, or self-host on your own hardware.",
    hero_cta: 'Start free — your data never leaves',
    hero_demo: 'See it in action',

    // Dashboard preview
    preview_title: 'Live campaign workflow',
    preview_agent_1: 'Reading your business',
    preview_agent_2: 'Designing banners',
    preview_agent_3: 'Writing social posts',
    preview_active: 'Done 2.1s',
    preview_working: 'Running…',

    // Features — each maps to a concrete moat over Managed Agents
    features_title: 'Built for business owners who value their time.',
    features_desc:
      'Five things generic AI tools will never give you — and the five things that make your brand distinguishable from everyone else using ChatGPT.',
    feat_agents_title: 'Business Brain',
    feat_agents_desc:
      'A structured, editable memory of your brand voice, customer personas, products, and what has worked before. Every AI output uses it. You can open it and edit it.',
    feat_commands_title: 'One button, see it work',
    feat_commands_desc:
      'Click Generate Campaign. Watch each step tick off in real time — read business, design banners, write posts, ready. No black box.',
    feat_analytics_title: 'Tamper-evident audit',
    feat_analytics_desc:
      'Every action is hash-chained like a blockchain. Click one button to verify nothing has been changed since it was recorded. Share a public proof link.',
    feat_budget_title: 'Your data, three modes',
    feat_budget_desc:
      'Cloud for speed. Private Cloud with your own keys. On-Premise on your own hardware — nothing leaves your network. Switch any time.',
    feat_improve_title: 'Vertical, not generic',
    feat_improve_desc:
      'Pre-built for marketing. Campaigns, banners, ads, landing pages, tracking, attribution. Not a generic agent loop — the entire outcome loop built for you.',
    feat_setup_title: 'Works with your stack',
    feat_setup_desc:
      'Publishes to Meta, Google, LinkedIn, TikTok, X, YouTube. Deploys landing pages to Vercel or Cloudflare. Connects to your existing tools, not the other way around.',

    // Comparison section — NEW. Directly addresses the "why not just use Claude/ChatGPT?" question.
    compare_title: "Why not just use Claude or ChatGPT?",
    compare_desc:
      "Generic AI is a model. 1Person is a complete product — built on the best models, with everything a busy founder needs to run marketing and nothing that wastes your time.",
    compare_col_generic: 'Generic AI (Claude, ChatGPT, Managed Agents)',
    compare_col_us: '1Person',
    compare_row1: 'Knows your brand',
    compare_row1_generic: 'You re-paste context every prompt',
    compare_row1_us: 'Business Brain remembers, you edit it in the UI',
    compare_row2: 'Where your data lives',
    compare_row2_generic: 'Vendor cloud only',
    compare_row2_us: 'Cloud, your cloud, or your own hardware',
    compare_row3: 'Proof nothing was tampered with',
    compare_row3_generic: 'None',
    compare_row3_us: 'Tamper-evident chain + one-click verify',
    compare_row4: 'Marketing outcome loop',
    compare_row4_generic: 'Build it yourself',
    compare_row4_us: 'Crawl → Brain → Generate → Publish → Track → Learn',
    compare_row5: 'Who it is for',
    compare_row5_generic: 'Developers, API users',
    compare_row5_us: 'Non-technical founders, full UI, no code',
    compare_row6: 'Publishes to ad platforms',
    compare_row6_generic: 'Not included',
    compare_row6_us: '7 platforms wired in, more coming',
    compare_row7: 'Pricing',
    compare_row7_generic: 'Per token + org rate limits',
    compare_row7_us: 'Predictable per company, your own keys if you want',

    // Trust section — lead with what Managed Agents deliberately doesn't have
    security_title: 'Data sovereignty, built in',
    security_desc:
      "Your customers ask where their data lives. We give you a one-sentence answer: 'Wherever you decide — and we can prove it hasn't been touched.' The three things below are what generic AI platforms will never build.",
    sec_hash_title: 'Tamper-evident audit chain',
    sec_hash_desc:
      "Every action is hash-linked to the one before it, like a blockchain. Modify any past entry and the chain breaks — instantly. Click 'Verify' and see a green checkmark you can trust.",
    sec_private_title: 'Per-tenant file isolation',
    sec_private_desc:
      "Your documents live in a directory no other customer can see. Every query is filtered by tenant ID at the database level. We built this into the core — it's not a setting you can forget to turn on.",
    sec_audit_title: 'Three deployment modes',
    sec_audit_desc:
      "Cloud: shared infra, fastest to start. Private Cloud: your own OpenAI/Anthropic keys, data still on our infra. On-Premise: point to your own vLLM/Ollama — nothing leaves your network.",
    sec_zero_title: 'Public proof links',
    sec_zero_desc:
      "Every company gets a public /proof/:id page showing document count, audit entries, and an integrity check. Share the URL with any customer, auditor, or investor. They can verify without logging in.",
    sec_gdpr_title: 'Your key, your bill',
    sec_gdpr_desc:
      "Bring your own OpenAI, Anthropic, Gemini, or OpenRouter API key. Your LLM bills go directly to you. No markup. No lock-in. Switch providers with one click.",
    sec_budget_title: 'Data export, always',
    sec_budget_desc:
      "One click exports your entire Business Brain, documents, campaigns, and audit log as JSON + ZIP. If you ever leave, you take everything with you. It's your data — we just help you use it.",

    // CTA
    cta_title: 'Stop renting generic AI. Own your marketing team.',
    cta_desc:
      "Built for founders who want AI that actually knows their brand, and trust they can verify. Start free — your data never leaves your control.",
    cta_button: 'Start free — no credit card',

    // Credits section (landing page)
    credits_section_title: 'One simple thing to learn: Credits',
    credits_section_subtitle:
      'Everything in 1Person runs on credits. No per-feature pricing rabbit holes. Just one balance.',
    credits_tier_fast: 'Fast',
    credits_tier_fast_desc: 'Quick draft — good enough',
    credits_tier_balanced: 'Balanced',
    credits_tier_balanced_desc: 'Default quality',
    credits_tier_premium: 'Premium',
    credits_tier_premium_desc: 'Best model, slower',
    credits_examples_title: 'What things cost',
    credits_example_banner: 'Banner copywriting',
    credits_example_social: 'Social post',
    credits_example_seo: 'SEO article',
    credits_example_campaign: 'Full campaign',
    credits_example_dashboard: 'View dashboard',
    credits_example_export: 'Export your data',
    credits_label_credit: 'credit',
    credits_label_credits: 'credits',
    credits_label_free: 'free',
    credits_section_cta: 'See pricing',
    credits_section_footnote:
      'Pick the quality you need per action. Self-host the models you trust to drop costs near zero.',

    // Footer
    footer_copyright: '2026 1Person. Trust-first AI for business owners.',
    footer_privacy: 'Privacy Policy',
    footer_terms: 'Terms of Service',
    footer_blog: 'Blog',
  },

  vi: {
    nav_features: 'Tính năng',
    nav_how_it_works: 'Cách vận hành',
    nav_security: 'Bảo mật',
    nav_pricing: 'Bảng giá',
    nav_blog: 'Blog',
    nav_sign_in: 'Đăng nhập',
    nav_get_started: 'Bắt đầu ngay',

    hero_badge: 'Đội marketing AI của riêng bạn — minh bạch từng bước',
    hero_title_1: 'AI hiểu rõ thương hiệu bạn.',
    hero_title_2: 'Dữ liệu luôn nằm trong tay bạn.',
    hero_desc:
      'AI đại trà không thể hiểu doanh nghiệp của bạn. 1Person xây riêng cho bạn một Business Brain (bộ não doanh nghiệp) — ghi nhớ giọng thương hiệu, sản phẩm và chân dung khách hàng — rồi chạy toàn bộ marketing trên hạ tầng bạn có thể kiểm tra, xác minh, thậm chí đặt ngay tại văn phòng mình.',
    hero_cta: 'Dùng thử miễn phí — dữ liệu không đi đâu cả',
    hero_demo: 'Xem thử 1 phút',

    preview_title: 'Chiến dịch đang chạy trực tiếp',
    preview_agent_1: 'Đang tìm hiểu doanh nghiệp',
    preview_agent_2: 'Đang thiết kế banner',
    preview_agent_3: 'Đang viết bài đăng',
    preview_active: 'Xong sau 2.1 giây',
    preview_working: 'Đang xử lý…',

    features_title: 'Dành cho người bận kinh doanh — AI phải phục vụ bạn.',
    features_desc:
      'Năm điều mà AI đại trà không bao giờ làm được cho bạn — cũng chính là năm điều khiến thương hiệu của bạn không lẫn vào đâu giữa hàng triệu người đang xài ChatGPT.',
    feat_agents_title: 'Business Brain — bộ não doanh nghiệp',
    feat_agents_desc:
      'Một bộ nhớ sống về giọng thương hiệu, khách hàng mục tiêu, sản phẩm và những gì đã từng hiệu quả. Mọi nội dung AI tạo ra đều dựa trên đây — và bạn có thể mở ra chỉnh sửa bất cứ lúc nào.',
    feat_commands_title: 'Một cú bấm, thấy AI làm việc',
    feat_commands_desc:
      'Bấm "Tạo chiến dịch". Từng bước hiện ra ngay trước mắt: hiểu doanh nghiệp, thiết kế banner, viết bài, sẵn sàng đăng. Không có gì là hộp đen.',
    feat_analytics_title: 'Lịch sử minh bạch, không thể chỉnh sửa',
    feat_analytics_desc:
      'Mọi hành động đều được khoá lại theo chuỗi an toàn như blockchain. Một cú bấm là xác minh được không ai động vào. Bạn có thể chia sẻ bằng chứng công khai cho khách hàng hoặc đối tác.',
    feat_budget_title: 'Ba lựa chọn cho dữ liệu của bạn',
    feat_budget_desc:
      'Cloud để khởi động thật nhanh. Private Cloud dùng tài khoản riêng của bạn. On-Premise chạy ngay trên máy chủ công ty — không một byte nào rời khỏi văn phòng. Chuyển đổi lúc nào cũng được.',
    feat_improve_title: 'Chuyên sâu cho marketing, không lan man',
    feat_improve_desc:
      'Thiết kế riêng cho marketing: chiến dịch, banner, quảng cáo, landing page, đo lường, phân tích hiệu quả. Không phải công cụ chung chung — đây là quy trình khép kín từ ý tưởng tới kết quả.',
    feat_setup_title: 'Ăn khớp với công cụ bạn đang dùng',
    feat_setup_desc:
      'Đăng trực tiếp lên Meta, Google, LinkedIn, TikTok, X, YouTube. Xuất landing page lên Vercel hoặc Cloudflare. Ghép nối với công cụ sẵn có của bạn — không bắt bạn phải đổi theo ai.',

    compare_title: 'Tại sao không chỉ dùng Claude hay ChatGPT?',
    compare_desc:
      'Claude hay ChatGPT là "bộ óc" AI. 1Person là sản phẩm hoàn chỉnh — dùng những bộ óc AI tốt nhất, có sẵn mọi thứ để bạn tập trung kinh doanh thay vì loay hoay với công nghệ.',
    compare_col_generic: 'AI đại trà (Claude, ChatGPT, Managed Agents)',
    compare_col_us: '1Person',
    compare_row1: 'Hiểu thương hiệu bạn',
    compare_row1_generic: 'Phải nhắc lại từ đầu mỗi lần hỏi',
    compare_row1_us: 'Business Brain tự nhớ, bạn chỉnh sửa trực tiếp',
    compare_row2: 'Dữ liệu lưu ở đâu',
    compare_row2_generic: 'Chỉ trên server của nhà cung cấp',
    compare_row2_us: 'Cloud chung, cloud riêng, hoặc máy chủ của bạn',
    compare_row3: 'Bằng chứng không bị chỉnh sửa',
    compare_row3_generic: 'Không có',
    compare_row3_us: 'Chuỗi khoá an toàn, xác minh chỉ 1 cú bấm',
    compare_row4: 'Quy trình marketing khép kín',
    compare_row4_generic: 'Bạn phải tự ghép nối',
    compare_row4_us: 'Tìm hiểu → Ghi nhớ → Tạo → Đăng → Đo → Học',
    compare_row5: 'Ai dùng được',
    compare_row5_generic: 'Cần biết lập trình hoặc gọi API',
    compare_row5_us: 'Bất kỳ ai — giao diện trực quan, bấm là chạy',
    compare_row6: 'Đăng lên kênh quảng cáo',
    compare_row6_generic: 'Không có sẵn',
    compare_row6_us: 'Đã kết nối 7 nền tảng, còn thêm nữa',
    compare_row7: 'Chi phí',
    compare_row7_generic: 'Tính theo lượt dùng, khó dự đoán',
    compare_row7_us: 'Giá cố định mỗi công ty, dùng tài khoản riêng nếu muốn',

    security_title: 'Dữ liệu là của bạn — ngay từ đầu',
    security_desc:
      'Khi khách hàng hỏi dữ liệu của họ đang ở đâu, bạn có thể trả lời gọn một câu: "Nơi tôi quyết định — và tôi có thể chứng minh không ai động vào." Ba điều dưới đây là những thứ các nền tảng AI đại trà sẽ không bao giờ xây cho bạn.',
    sec_hash_title: 'Chuỗi khoá chống chỉnh sửa',
    sec_hash_desc:
      'Mỗi hành động được khoá chặt vào hành động trước đó, giống như blockchain. Chỉ cần ai đó sửa một dòng lịch sử, cả chuỗi sẽ gãy ngay. Bấm "Xác minh" là thấy dấu tick xanh đáng tin.',
    sec_private_title: 'Tài liệu của bạn — chỉ mình bạn thấy',
    sec_private_desc:
      'Tài liệu của bạn nằm trong khu vực riêng biệt, không khách hàng nào khác nhìn thấy được. Cơ chế này được xây vào lõi hệ thống — không phải một nút gạt mà người ta có thể quên bật.',
    sec_audit_title: 'Ba cách triển khai',
    sec_audit_desc:
      'Cloud: dùng chung hạ tầng, khởi động ngay. Private Cloud: dùng tài khoản AI riêng của bạn, dữ liệu vẫn trên hạ tầng của chúng tôi. On-Premise: chạy trên máy chủ của bạn — không một byte nào rời khỏi mạng nội bộ.',
    sec_zero_title: 'Trang bằng chứng công khai',
    sec_zero_desc:
      'Mỗi công ty có một trang công khai riêng: hiển thị số tài liệu, lịch sử thao tác và kết quả kiểm tra tính toàn vẹn. Bạn chia sẻ đường dẫn này cho khách hàng, kiểm toán viên hay nhà đầu tư — họ xem được mà không cần đăng nhập.',
    sec_gdpr_title: 'Tài khoản của bạn, hoá đơn của bạn',
    sec_gdpr_desc:
      'Bạn có thể dùng tài khoản OpenAI, Anthropic, Gemini hoặc OpenRouter của riêng mình. Hoá đơn AI về thẳng bạn — chúng tôi không cộng thêm đồng nào, không giữ chân bạn. Đổi nhà cung cấp chỉ trong một cú bấm.',
    sec_budget_title: 'Lấy dữ liệu ra, bất cứ lúc nào',
    sec_budget_desc:
      'Một cú bấm là tải về toàn bộ Business Brain, tài liệu, chiến dịch và lịch sử thao tác dưới dạng JSON và ZIP. Nếu một ngày bạn muốn rời đi, bạn mang theo tất cả. Đây là dữ liệu của bạn — chúng tôi chỉ giúp bạn dùng nó tốt hơn.',

    cta_title: 'Đừng thuê AI chung — hãy sở hữu đội marketing AI của riêng bạn.',
    cta_desc:
      'Dành cho những chủ doanh nghiệp muốn một AI thật sự hiểu thương hiệu của mình, và một niềm tin có thể tự tay kiểm chứng. Dùng thử miễn phí — dữ liệu không bao giờ rời khỏi bạn.',
    cta_button: 'Dùng thử miễn phí — không cần thẻ',

    // Credits section
    credits_section_title: 'Chỉ cần hiểu một thứ: Credit',
    credits_section_subtitle:
      'Mọi thứ trong 1Person đều chạy bằng credit. Không bảng giá rối rắm từng tính năng. Chỉ một số dư duy nhất.',
    credits_tier_fast: 'Nhanh',
    credits_tier_fast_desc: 'Bản nháp nhanh — đủ dùng',
    credits_tier_balanced: 'Cân bằng',
    credits_tier_balanced_desc: 'Chất lượng mặc định',
    credits_tier_premium: 'Cao cấp',
    credits_tier_premium_desc: 'Model tốt nhất, chậm hơn',
    credits_examples_title: 'Mỗi thao tác tốn bao nhiêu',
    credits_example_banner: 'Viết nội dung banner',
    credits_example_social: 'Bài đăng mạng xã hội',
    credits_example_seo: 'Bài SEO',
    credits_example_campaign: 'Chiến dịch đầy đủ',
    credits_example_dashboard: 'Xem dashboard',
    credits_example_export: 'Xuất dữ liệu',
    credits_label_credit: 'credit',
    credits_label_credits: 'credit',
    credits_label_free: 'miễn phí',
    credits_section_cta: 'Xem bảng giá',
    credits_section_footnote:
      'Chọn mức chất lượng bạn cần cho từng thao tác. Tự host model bạn tin tưởng để chi phí gần như bằng không.',

    footer_copyright: '2026 1Person. AI đáng tin cho chủ doanh nghiệp.',
    footer_privacy: 'Chính sách bảo mật',
    footer_terms: 'Điều khoản sử dụng',
    footer_blog: 'Blog',
  },

  ja: {
    nav_features: '機能',
    nav_how_it_works: '使い方',
    nav_security: '信頼',
    nav_pricing: '料金',
    nav_blog: 'ブログ',
    nav_sign_in: 'ログイン',
    nav_get_started: '始める',

    hero_badge: 'あなた専用のAIマーケティングチーム — 全行動を検証可能',
    hero_title_1: 'あなたのブランドを理解するAI。',
    hero_title_2: 'あなたのデータはあなたのもの。',
    hero_desc:
      '汎用AIはあなたのビジネスを知りません。1Personはブランドボイス、製品、顧客についての生きたBusiness Brainを構築し、監査・検証・自社ハードウェアでの運用が可能なインフラ上でマーケティングを実行します。',
    hero_cta: '無料で開始 — データは手元に',
    hero_demo: '動作を見る',

    preview_title: 'リアルタイム・キャンペーン・ワークフロー',
    preview_agent_1: 'ビジネスを読み取り中',
    preview_agent_2: 'バナーをデザイン中',
    preview_agent_3: '投稿を執筆中',
    preview_active: '完了 2.1秒',
    preview_working: '実行中…',

    features_title: '経営に集中する方のために。AIがあなたに合わせます。',
    features_desc:
      '汎用AIツールが決して提供しない5つのこと — そしてあなたのブランドをChatGPTを使う他の誰とも区別する5つのこと。',
    feat_agents_title: 'Business Brain',
    feat_agents_desc:
      'ブランドボイス、顧客ペルソナ、製品、過去に効果があったことの構造化された編集可能なメモリ。すべてのAI出力がこれを使用します。UIで直接編集できます。',
    feat_commands_title: 'ワンクリックで動作を確認',
    feat_commands_desc:
      'キャンペーン生成をクリック。各ステップがリアルタイムでチェックされるのを見る — ビジネス読み取り、バナーデザイン、投稿執筆、完了。ブラックボックスなし。',
    feat_analytics_title: '改ざん検出可能な監査',
    feat_analytics_desc:
      'すべての行動がブロックチェーンのようにハッシュチェーンされます。ボタン一つで記録後に何も変更されていないことを検証。公開プルーフリンクを共有。',
    feat_budget_title: 'あなたのデータ、3つのモード',
    feat_budget_desc:
      '速度のためのCloud。独自APIキーでのPrivate Cloud。自社ハードウェアのOn-Premise — ネットワーク外に何も出ません。いつでも切り替え可能。',
    feat_improve_title: '汎用ではなく、垂直特化',
    feat_improve_desc:
      'マーケティング専用に事前構築。キャンペーン、バナー、広告、ランディングページ、トラッキング、アトリビューション。汎用エージェントループではなく、完全なアウトカムループを事前構築。',
    feat_setup_title: '既存スタックと連携',
    feat_setup_desc:
      'Meta、Google、LinkedIn、TikTok、X、YouTubeに公開。VercelまたはCloudflareにランディングページをデプロイ。既存ツールに接続 — 逆ではなく。',

    compare_title: 'なぜClaudeやChatGPTをそのまま使わないのか？',
    compare_desc:
      '汎用AIはモデルです。1Personは完成された製品です — 最高のモデルを活用し、経営に集中できるようすべてが揃っています。技術の手間はかかりません。',
    compare_col_generic: '汎用AI（Claude、ChatGPT、Managed Agents）',
    compare_col_us: '1Person',
    compare_row1: 'ブランドを理解',
    compare_row1_generic: '毎回コンテキストを貼り直し',
    compare_row1_us: 'Business Brainが記憶、UIで編集',
    compare_row2: 'データの保管場所',
    compare_row2_generic: 'ベンダークラウドのみ',
    compare_row2_us: 'クラウド、自社クラウド、または自社ハードウェア',
    compare_row3: '改ざんされていない証明',
    compare_row3_generic: 'なし',
    compare_row3_us: 'ハッシュチェーン + ワンクリック検証',
    compare_row4: 'マーケティング・アウトカム・ループ',
    compare_row4_generic: '自分で構築',
    compare_row4_us: 'クロール → Brain → 生成 → 公開 → トラッキング → 学習',
    compare_row5: '対象者',
    compare_row5_generic: '開発者、APIユーザー',
    compare_row5_us: 'どなたでも — 直感的なUI、ワンクリック操作',
    compare_row6: '広告プラットフォーム連携',
    compare_row6_generic: '含まれない',
    compare_row6_us: '7プラットフォーム配線済み、追加中',
    compare_row7: '料金',
    compare_row7_generic: 'トークン単位 + 組織レート制限',
    compare_row7_us: '会社単位で予測可能、独自キー使用可',

    security_title: 'データ主権、標準装備',
    security_desc:
      '顧客はデータの保管場所を尋ねます。一言で答えられます：「あなたが決めた場所 — そして触れられていないことを証明できます」。以下の3つは汎用AIプラットフォームが決して構築しないものです。',
    sec_hash_title: '改ざん検出ハッシュチェーン',
    sec_hash_desc:
      'すべての行動は前の行動にハッシュリンクされます、ブロックチェーンのように。過去のエントリを変更すると、チェーンが即座に壊れます。「検証」をクリックして信頼できる緑のチェックマークを確認。',
    sec_private_title: 'テナント別ファイル分離',
    sec_private_desc:
      'ドキュメントは他の顧客が見ることのできないディレクトリに保存されます。すべてのクエリはデータベースレベルでテナントIDによってフィルタリングされます。コアに組み込み済み — 忘れてオフにできる設定ではありません。',
    sec_audit_title: '3つのデプロイモード',
    sec_audit_desc:
      'Cloud: 共有インフラ、最速開始。Private Cloud: 独自OpenAI/Anthropicキー、データは当社インフラ。On-Premise: 独自のvLLM/Ollamaを指す — ネットワーク外に何も出ない。',
    sec_zero_title: '公開プルーフリンク',
    sec_zero_desc:
      'すべての会社に公開の /proof/:id ページがあり、ドキュメント数、監査エントリ、整合性チェックを表示。顧客、監査人、投資家にURLを共有。ログインなしで検証可能。',
    sec_gdpr_title: 'あなたのキー、あなたの請求',
    sec_gdpr_desc:
      'OpenAI、Anthropic、Gemini、OpenRouterの独自APIキーを持ち込み。LLMの請求は直接あなたに。マークアップなし。ロックインなし。ワンクリックでプロバイダを切り替え。',
    sec_budget_title: 'データエクスポート、常に',
    sec_budget_desc:
      'ワンクリックで全Business Brain、ドキュメント、キャンペーン、監査ログをJSON + ZIPでエクスポート。退会してもすべて持ち出せます。あなたのデータです — 私たちは使い方を助けるだけ。',

    cta_title: '汎用AIのレンタルを止める。自分のマーケティングチームを所有する。',
    cta_desc:
      'ブランドを本当に理解するAIと、検証できる信頼を求める創業者のために構築。無料で開始 — データはあなたのコントロール下から出ません。',
    cta_button: '無料で始める — クレジットカード不要',

    // Credits section
    credits_section_title: '覚えるのは一つだけ：クレジット',
    credits_section_subtitle:
      '1Personのすべてはクレジットで動きます。機能ごとの複雑な料金体系はありません。残高は一つだけ。',
    credits_tier_fast: 'Fast',
    credits_tier_fast_desc: '素早い下書き — 十分な品質',
    credits_tier_balanced: 'Balanced',
    credits_tier_balanced_desc: '標準品質',
    credits_tier_premium: 'Premium',
    credits_tier_premium_desc: '最高品質、やや遅め',
    credits_examples_title: '各アクションのコスト',
    credits_example_banner: 'バナーコピー作成',
    credits_example_social: 'ソーシャル投稿',
    credits_example_seo: 'SEO記事',
    credits_example_campaign: 'フルキャンペーン',
    credits_example_dashboard: 'ダッシュボード閲覧',
    credits_example_export: 'データエクスポート',
    credits_label_credit: 'クレジット',
    credits_label_credits: 'クレジット',
    credits_label_free: '無料',
    credits_section_cta: '料金を見る',
    credits_section_footnote:
      'アクションごとに必要な品質を選べます。信頼できるモデルをセルフホストすればコストをほぼゼロに。',

    footer_copyright: '2026 1Person. ビジネスオーナーのための信頼第一AI。',
    footer_privacy: 'プライバシーポリシー',
    footer_terms: '利用規約',
    footer_blog: 'ブログ',
  },

  ko: {
    nav_features: '기능',
    nav_how_it_works: '작동 방식',
    nav_security: '신뢰',
    nav_pricing: '요금',
    nav_blog: '블로그',
    nav_sign_in: '로그인',
    nav_get_started: '시작하기',

    hero_badge: '당신만의 AI 마케팅 팀 — 모든 행동 검증 가능',
    hero_title_1: '당신의 브랜드를 아는 AI.',
    hero_title_2: '당신의 데이터는 당신 것.',
    hero_desc:
      '일반 AI는 당신의 비즈니스를 모릅니다. 1Person은 브랜드 보이스, 제품, 고객에 대한 살아있는 Business Brain을 구축하고, 감사, 검증, 또는 자체 하드웨어에서 실행할 수 있는 인프라에서 마케팅을 운영합니다.',
    hero_cta: '무료로 시작 — 데이터는 떠나지 않음',
    hero_demo: '작동 보기',

    preview_title: '실시간 캠페인 워크플로우',
    preview_agent_1: '비즈니스 읽는 중',
    preview_agent_2: '배너 디자인 중',
    preview_agent_3: '포스트 작성 중',
    preview_active: '완료 2.1초',
    preview_working: '실행 중…',

    features_title: '경영에 집중하는 분을 위해. AI가 당신에게 맞춥니다.',
    features_desc:
      '일반 AI 도구가 절대 제공하지 않는 다섯 가지 — 그리고 ChatGPT를 사용하는 다른 모든 사람과 당신의 브랜드를 구별시키는 다섯 가지.',
    feat_agents_title: 'Business Brain',
    feat_agents_desc:
      '브랜드 보이스, 고객 페르소나, 제품 및 과거에 효과가 있었던 것에 대한 구조화된 편집 가능한 메모리. 모든 AI 출력이 이것을 사용합니다. UI에서 직접 편집 가능.',
    feat_commands_title: '원클릭으로 작동 확인',
    feat_commands_desc:
      '캠페인 생성 클릭. 각 단계가 실시간으로 체크되는 것을 봄 — 비즈니스 읽기, 배너 디자인, 포스트 작성, 준비 완료. 블랙박스 없음.',
    feat_analytics_title: '변조 감지 가능한 감사',
    feat_analytics_desc:
      '모든 행동이 블록체인처럼 해시 체인됨. 버튼 하나로 기록 후 변경된 것이 없음을 검증. 공개 증명 링크 공유.',
    feat_budget_title: '당신의 데이터, 세 가지 모드',
    feat_budget_desc:
      '속도를 위한 Cloud. 자체 API 키로 Private Cloud. 자체 하드웨어의 On-Premise — 네트워크 외부로 아무것도 나가지 않음. 언제든지 전환.',
    feat_improve_title: '수직 전문화, 일반이 아님',
    feat_improve_desc:
      '마케팅 전용으로 미리 구축. 캠페인, 배너, 광고, 랜딩 페이지, 트래킹, 어트리뷰션. 일반 에이전트 루프가 아닌 전체 결과 루프를 미리 구축.',
    feat_setup_title: '기존 스택과 연동',
    feat_setup_desc:
      'Meta, Google, LinkedIn, TikTok, X, YouTube에 게시. Vercel 또는 Cloudflare에 랜딩 페이지 배포. 기존 도구에 연결 — 반대가 아님.',

    compare_title: '왜 Claude나 ChatGPT를 그냥 사용하지 않나요?',
    compare_desc:
      '일반 AI는 모델입니다. 1Person은 완성된 제품입니다 — 최고의 모델을 활용하여, 경영에 집중할 수 있도록 모든 것이 갖추어져 있습니다.',
    compare_col_generic: '일반 AI (Claude, ChatGPT, Managed Agents)',
    compare_col_us: '1Person',
    compare_row1: '브랜드 이해',
    compare_row1_generic: '매 프롬프트마다 컨텍스트 재붙여넣기',
    compare_row1_us: 'Business Brain이 기억, UI에서 편집',
    compare_row2: '데이터 저장 위치',
    compare_row2_generic: '공급업체 클라우드만',
    compare_row2_us: '클라우드, 자체 클라우드 또는 자체 하드웨어',
    compare_row3: '변조되지 않았다는 증명',
    compare_row3_generic: '없음',
    compare_row3_us: '해시 체인 + 원클릭 검증',
    compare_row4: '마케팅 결과 루프',
    compare_row4_generic: '직접 구축',
    compare_row4_us: '크롤 → Brain → 생성 → 게시 → 트래킹 → 학습',
    compare_row5: '대상',
    compare_row5_generic: '개발자, API 사용자',
    compare_row5_us: '누구나 — 직관적 UI, 클릭만으로 실행',
    compare_row6: '광고 플랫폼 게시',
    compare_row6_generic: '포함되지 않음',
    compare_row6_us: '7개 플랫폼 연결, 더 추가 중',
    compare_row7: '가격',
    compare_row7_generic: '토큰당 + 조직 속도 제한',
    compare_row7_us: '회사별 예측 가능, 원하면 자체 키 사용',

    security_title: '내장된 데이터 주권',
    security_desc:
      '고객이 데이터가 어디에 있는지 물어봅니다. 한 문장으로 답할 수 있습니다: "당신이 결정한 곳 — 그리고 건드려지지 않았음을 증명할 수 있습니다". 아래 세 가지는 일반 AI 플랫폼이 절대 구축하지 않을 것들입니다.',
    sec_hash_title: '변조 감지 해시 체인',
    sec_hash_desc:
      '모든 행동이 이전 행동에 해시 링크됨, 블록체인처럼. 과거 항목을 수정하면 체인이 즉시 끊어짐. "검증" 클릭하여 믿을 수 있는 녹색 체크 표시 확인.',
    sec_private_title: '테넌트별 파일 격리',
    sec_private_desc:
      '문서는 다른 고객이 볼 수 없는 디렉토리에 저장됨. 모든 쿼리는 데이터베이스 레벨에서 테넌트 ID로 필터링됨. 코어에 내장됨 — 끄는 것을 잊을 수 있는 설정이 아님.',
    sec_audit_title: '세 가지 배포 모드',
    sec_audit_desc:
      'Cloud: 공유 인프라, 가장 빠른 시작. Private Cloud: 자체 OpenAI/Anthropic 키, 데이터는 당사 인프라. On-Premise: 자체 vLLM/Ollama 가리킴 — 네트워크 외부로 아무것도 나가지 않음.',
    sec_zero_title: '공개 증명 링크',
    sec_zero_desc:
      '모든 회사에 공개 /proof/:id 페이지 있음, 문서 수, 감사 항목, 무결성 검사 표시. URL을 고객, 감사인, 투자자에게 공유. 로그인 없이 검증 가능.',
    sec_gdpr_title: '당신의 키, 당신의 청구서',
    sec_gdpr_desc:
      'OpenAI, Anthropic, Gemini, OpenRouter 자체 API 키 가져오기. LLM 청구서는 직접 당신에게. 마크업 없음. 락인 없음. 원클릭으로 공급업체 전환.',
    sec_budget_title: '데이터 내보내기, 항상',
    sec_budget_desc:
      '원클릭으로 전체 Business Brain, 문서, 캠페인, 감사 로그를 JSON + ZIP으로 내보내기. 떠나더라도 모든 것을 가져갈 수 있음. 당신의 데이터입니다 — 우리는 사용을 도울 뿐.',

    cta_title: '일반 AI 대여 중단. 마케팅 팀 소유.',
    cta_desc:
      '브랜드를 진정으로 이해하는 AI와 검증 가능한 신뢰를 원하는 창업자를 위해 구축. 무료로 시작 — 데이터는 통제 밖으로 나가지 않음.',
    cta_button: '무료로 시작 — 신용카드 불필요',

    // Credits section
    credits_section_title: '하나만 기억하세요: 크레딧',
    credits_section_subtitle:
      '1Person의 모든 기능은 크레딧으로 작동합니다. 기능별 복잡한 요금은 없습니다. 잔액은 하나뿐.',
    credits_tier_fast: 'Fast',
    credits_tier_fast_desc: '빠른 초안 — 충분한 품질',
    credits_tier_balanced: 'Balanced',
    credits_tier_balanced_desc: '기본 품질',
    credits_tier_premium: 'Premium',
    credits_tier_premium_desc: '최고 모델, 다소 느림',
    credits_examples_title: '각 작업 비용',
    credits_example_banner: '배너 카피라이팅',
    credits_example_social: '소셜 게시물',
    credits_example_seo: 'SEO 아티클',
    credits_example_campaign: '전체 캠페인',
    credits_example_dashboard: '대시보드 보기',
    credits_example_export: '데이터 내보내기',
    credits_label_credit: '크레딧',
    credits_label_credits: '크레딧',
    credits_label_free: '무료',
    credits_section_cta: '요금 보기',
    credits_section_footnote:
      '작업마다 필요한 품질을 선택하세요. 신뢰하는 모델을 셀프 호스팅하면 비용을 거의 0으로 낮출 수 있습니다.',

    footer_copyright: '2026 1Person. 비즈니스 소유자를 위한 신뢰 우선 AI.',
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
