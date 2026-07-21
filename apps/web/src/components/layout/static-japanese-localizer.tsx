'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useCompany } from '@/lib/api/hooks';
import { normalizeAppLanguage } from '@/lib/app-language';

const STATIC_JA_TEXT: Record<string, string> = {
  Dashboard: 'ダッシュボード',
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
  'Your next best step': '次に行うべきこと',
  'Setup checklist': 'セットアップチェックリスト',
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
  'Analyze your market': '市場を分析',
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
  const language = normalizeAppLanguage(company?.settings?.language);

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
