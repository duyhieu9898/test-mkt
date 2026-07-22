'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useCompany } from '@/lib/api/hooks';
import { APP_LANGUAGE_STORAGE_KEY, normalizeAppLanguage, type AppLanguage } from '@/lib/app-language';

const STATIC_JA_TEXT: Record<string, string> = {
  Dashboard: 'ダッシュボード',
  'Your Companies': '会社一覧',
  'Manage your AI-powered businesses': 'AIを活用した事業を管理します',
  'New Company': '新しい会社',
  'No companies yet': 'まだ会社がありません',
  'Create your first AI-powered company to get started': '最初のAI活用会社を作成して始めましょう',
  'Create Company': '会社を作成',
  'Complete Setup': 'セットアップを完了',
  'No industry set': '業種未設定',
  'Here\'s what your AI thinks you should focus on today.': '今日、AIが優先すべきだと考えていることです。',
  Deals: '商談',
  Competitors: '競合',
  'Last meeting': '最新ミーティング',
  View: '表示',
  today: '今日',
  yesterday: '昨日',
  'Ask AI for personalized advice': 'AIに個別アドバイスを依頼',
  'AI tip — recent win': 'AIヒント - 最近の成果',
  'Getting started with': 'セットアップ開始:',
  'Checking your company setup': '会社のセットアップ状況を確認中',
  'Reading the latest Knowledge, Brand IQ, market, and landing-page status.': '最新のKnowledge、Brand IQ、市場、ランディングページ状況を確認しています。',
  'Confirm company understanding': '会社理解を確認',
  'Check what AI knows about your business and customers.': 'AIが事業と顧客について理解している内容を確認します。',
  'Add trusted business knowledge': '信頼できる事業知識を追加',
  'Give AI facts about products, pricing, FAQs, and policies.': '商品、価格、FAQ、ポリシーなどの正確な情報をAIに提供します。',
  'Review Brand IQ': 'Brand IQを確認',
  'Confirm your audience, positioning, tone, and brand rules.': '対象顧客、ポジショニング、トーン、ブランドルールを確認します。',
  'Review your first CEO advice': '最初のCEOアドバイスを確認',
  'See the highest-value actions AI recommends next.': 'AIが次に推奨する重要度の高いアクションを確認します。',
  'Analyze your market': '市場を分析',
  'Track competitors and discover positioning opportunities.': '競合を追跡し、ポジショニングの機会を見つけます。',
  'Create a marketing landing page': 'マーケティング用ランディングページを作成',
  'Turn an offer or campaign idea into a page that can capture leads.': 'オファーやキャンペーン案を、リード獲得できるページに変えます。',
  'Setup priority': 'セットアップ優先',
  'Recommended by CEO Advisor': 'CEO Advisorのおすすめ',
  'Suggested next step': '次のおすすめステップ',
  Strong: '強い',
  Growing: '成長中',
  'Getting started': '開始段階',
  'Some setup status could not be checked.': '一部のセットアップ状況を確認できませんでした。',
  'Your next best step': '次に行うべきこと',
  'Review recommendation': 'おすすめを確認',
  'Show my recommendations': 'おすすめを表示',
  'AI currently understands': 'AIが現在理解していること',
  offerings: '提供内容',
  'knowledge facts': 'ナレッジ情報',
  'Brand voice ready': 'ブランドボイス準備済み',
  'Setup checklist': 'セットアップチェックリスト',
  Optional: '任意',
  essentials: '必須項目',
  'AI readiness': 'AI準備度',
  'Growth Score': '成長スコア',
  Marketing: 'マーケティング',
  SEO: 'SEO',
  Automation: '自動化',
  Revenue: '売上',
  Foundation: '基盤',
  Growth: '成長',
  Scale: '拡大',
  'System Progress': 'システム進捗',
  'Marketing Engine': 'マーケティングエンジン',
  'SEO & Content': 'SEO・コンテンツ',
  'AI Automation': 'AI自動化',
  'Revenue Engine': '売上エンジン',
  Achievements: '実績',
  unlocked: '解除済み',
  'First Steps': '最初の一歩',
  'Growth Score reaches 10': '成長スコアが10に到達',
  'Foundation Set': '基盤セット完了',
  'Growth Score reaches 30 (Level 2)': '成長スコアが30に到達（レベル2）',
  'Growth Engine': '成長エンジン',
  'Growth Score reaches 60 (Level 3)': '成長スコアが60に到達（レベル3）',
  'Optimization Master': '最適化マスター',
  'Growth Score reaches 80 (Level 4)': '成長スコアが80に到達（レベル4）',
  'Day One': '初日',
  'Complete your first daily mission': '最初のデイリーミッションを完了',
  '3-Day Focus': '3日間集中',
  'Maintain a 3-day streak': '3日連続を達成',
  'Weekly Warrior': '週間実行者',
  'Maintain a 7-day streak': '7日連続を達成',
  'Mission Veteran': 'ミッション上級者',
  'Complete 25 total missions': '合計25件のミッションを完了',
  'AI Apprentice': 'AI見習い',
  'Automation Score reaches 30': '自動化スコアが30に到達',
  'AI Commander': 'AI司令官',
  'Automation Score reaches 60': '自動化スコアが60に到達',
  'Market Entry': '市場参入',
  'Create your first campaign': '最初のキャンペーンを作成',
  'Know Thy Enemy': '競合を知る',
  'Track your first competitor': '最初の競合を追跡',
  Consistency: '継続性',
  'Today\'s Focus': '今日のフォーカス',
  completed: '完了',
  'No missions yet. Refresh your AI advisor to get personalized tasks.': 'まだミッションがありません。AI Advisorを更新して個別タスクを取得しましょう。',
  'Loading your team...': 'チームを読み込み中...',
  'Your team is temporarily unavailable': 'チーム情報を一時的に取得できません',
  'ready to work': '稼働準備完了',
  'Team workspace': 'チームワークスペース',
  'Hide team': 'チームを隠す',
  'View team': 'チームを表示',
  'Your AI team could not be loaded': 'AIチームを読み込めませんでした',
  'Try again': '再試行',
  'Milestone reached': 'マイルストーン達成',
  'First Mission Complete': '最初のミッション完了',
  'You completed your first daily mission. Keep building momentum.': '最初のデイリーミッションを完了しました。この勢いを続けましょう。',
  '3-Day Streak': '3日連続',
  'Three days of consistent action. Your AI system is learning from you.': '3日間継続して行動しました。AIシステムがあなたから学習しています。',
  'Week-Long Streak': '1週間連続',
  'A full week of daily engagement. Your growth engine is warming up.': '1週間継続して取り組みました。成長エンジンが動き始めています。',
  'Growth Score 25+': '成長スコア25+',
  'Your business system is taking shape. Foundation is set.': '事業システムの形が見えてきました。基盤が整っています。',
  'Growth Score 50+': '成長スコア50+',
  'Halfway to a fully optimized growth machine. Strong progress.': '最適化された成長システムまで半分です。順調に進んでいます。',
  'Growth Score 75+': '成長スコア75+',
  'Your AI-powered business system is operating at high capacity.': 'AI活用型の事業システムが高い能力で稼働しています。',
  'First Campaign Created': '最初のキャンペーン作成済み',
  'Your first marketing campaign is live. AI is driving traffic.': '最初のマーケティングキャンペーンが公開されました。AIが集客を支援しています。',
  '10 Missions Completed': '10件のミッション完了',
  'Consistent execution. Your business is building real momentum.': '継続的に実行できています。事業に本当の勢いが生まれています。',
  'Growth Plan': '成長プラン',
  'Brand IQ': 'ブランドIQ',
  'CEO Advisor': 'CEOアドバイザー',
  Walkthrough: '使い方ガイド',
  'Your AI Team': 'AIチーム',
  'Knowledge Hub': 'ナレッジハブ',
  'Brain Hub': 'ブレインハブ',
  Campaigns: 'キャンペーン',
  'Campaign Launcher': 'キャンペーン作成',
  'Landing Pages': 'ランディングページ',
  'Content Autopilot': 'コンテンツ自動化',
  'Content Editor': 'コンテンツ編集',
  'AI Visibility (GEO)': 'AI検索可視性',
  'Market & Competitors': '市場・競合分析',
  'Marketing Playbooks': 'マーケティング手順書',
  Analytics: '分析',
  Settings: '設定',
  Admin: '管理',
  Save: '保存',
  'Save Changes': '変更を保存',
  'Save changes': '変更を保存',
  Cancel: 'キャンセル',
  Edit: '編集',
  Delete: '削除',
  Review: '確認',
  Open: '開く',
  Close: '閉じる',
  Back: '戻る',
  Continue: '続ける',
  Next: '次へ',
  Skip: 'スキップ',
  Search: '検索',
  Refresh: '更新',
  Generate: '生成',
  'Generate Campaign': 'キャンペーンを生成',
  'Create Campaign': 'キャンペーンを作成',
  'Launch Campaign': 'キャンペーンを開始',
  'Ready to launch': '開始準備完了',
  'Social posts': 'SNS投稿',
  Banners: 'バナー',
  Blog: 'ブログ',
  'Track performance': '成果を追跡',
  'Refresh data': 'データを更新',
  'Apply to social posts': 'SNS投稿に適用',
  'Use my image': '自分の画像を使う',
  'Edit image': '画像を編集',
  Select: '選択',
  Selected: '選択済み',
  Published: '公開済み',
  Draft: '下書き',
  Ready: '準備完了',
  'Create New Page': '新しいページを作成',
  'Publish landing page': 'ランディングページを公開',
  'Publish now': '今すぐ公開',
  'Save as draft': '下書きとして保存',
  'Add to my WordPress website': 'WordPressサイトに追加',
  'Create a new public website': '新しい公開サイトを作成',
  'Publish history': '公開履歴',
  'Take offline': '非公開にする',
  'Knowledge': 'ナレッジ',
  Documents: 'ドキュメント',
  Meetings: 'ミーティング',
  'Crawl Data': 'データ収集',
  'Upload File': 'ファイルをアップロード',
  'Start Recording': '録音を開始',
  'Upload Audio': '音声をアップロード',
  'Paste Transcript': '文字起こしを貼り付け',
  'Approve': '承認',
  'Ready for Review': '確認待ち',
  'Test Chat': 'テストチャット',
  Configuration: '設定',
  'Bot Name': 'ボット名',
  Greeting: '挨拶文',
  Tone: 'トーン',
  Mode: 'モード',
  Color: '色',
  'Allowed domains': '許可ドメイン',
  'Widget preview': 'ウィジェットプレビュー',
  'Website Widget': 'Webサイトウィジェット',
  'Open on Facebook': 'Facebookで開く',
  'Published on Facebook': 'Facebookに投稿済み',
  'Top actions': '優先アクション',
  'TOP ACTIONS': '優先アクション',
  "TODAY'S BRIEF": '本日のブリーフ',
  'Refresh advice': 'アドバイスを更新',
  'Generate advice': 'アドバイスを生成',
  'Why this recommendation': 'この提案の理由',
  'Your strategy may need an update': '戦略の更新が必要な可能性があります',
  'Create updated draft': '更新版の下書きを作成',
  'Approve current plan': '現在のプランを承認',
  'Create content campaign': 'コンテンツキャンペーンを作成',
  'Create social campaign': 'SNSキャンペーンを作成',
  'Campaign focus': 'キャンペーンの焦点',
  'Social outputs': 'SNS出力',
  'Generated images': '生成画像',
  'Choose your campaign images': 'キャンペーン画像を選択',
  'Blog preview': 'ブログプレビュー',
  'Ready items were activated inside this campaign. External ad publishing is still handled separately.': '準備済みの項目がこのキャンペーン内で有効化されました。外部広告配信は別途管理されます。',
  'Create Landing Page': 'ランディングページを作成',
  'My Pages': 'マイページ',
  'Generate All': 'すべて生成',
  'Unpublish': '非公開',
  'Create outputs': '出力を作成',
  'Connect': '接続',
  'Reconnect': '再接続',
  'Connected': '接続済み',
  'Not connected': '未接続',
};

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'CODE', 'PRE']);
const originals = new WeakMap<Text, string>();

function preserveWhitespace(original: string, translated: string) {
  const prefix = original.match(/^\s*/)?.[0] ?? '';
  const suffix = original.match(/\s*$/)?.[0] ?? '';
  return `${prefix}${translated}${suffix}`;
}

function shouldSkip(textNode: Text) {
  const parent = textNode.parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest('[contenteditable="true"], [data-no-localize]')) return true;
  return false;
}

function translateNode(textNode: Text) {
  if (shouldSkip(textNode)) return;
  const original = originals.get(textNode) ?? textNode.nodeValue ?? '';
  const translated = STATIC_JA_TEXT[original.trim()];
  if (!translated) return;
  originals.set(textNode, original);
  const nextValue = preserveWhitespace(original, translated);
  if (textNode.nodeValue !== nextValue) textNode.nodeValue = nextValue;
}

function restoreNode(textNode: Text) {
  const original = originals.get(textNode);
  if (original !== undefined) textNode.nodeValue = original;
}

function walkTextNodes(root: Node, visitor: (node: Text) => void) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    visitor(node as Text);
    node = walker.nextNode();
  }
}

export function StaticJapaneseLocalizer() {
  const params = useParams();
  const companyId = params.companyId as string | undefined;
  const { data: company } = useCompany(companyId ?? '');
  const [preferredLanguage, setPreferredLanguage] = useState<AppLanguage>('en');
  const language = companyId
    ? normalizeAppLanguage(company?.settings?.language)
    : preferredLanguage;

  useEffect(() => {
    if (companyId) return;
    try {
      setPreferredLanguage(normalizeAppLanguage(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)));
    } catch {
      setPreferredLanguage('en');
    }
    const handleLanguageChange = (event: Event) => {
      setPreferredLanguage(normalizeAppLanguage((event as CustomEvent).detail));
    };
    window.addEventListener('app-language:changed', handleLanguageChange);
    return () => window.removeEventListener('app-language:changed', handleLanguageChange);
  }, [companyId]);

  useEffect(() => {
    document.documentElement.lang = language;
    const root = document.body;
    if (!root) return;

    if (language !== 'ja') {
      walkTextNodes(root, restoreNode);
      return;
    }

    walkTextNodes(root, translateNode);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          translateNode(mutation.target as Text);
          continue;
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            translateNode(node as Text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkTextNodes(node as Element, translateNode);
          }
        });
      }
    });

    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [language]);

  return null;
}
