import { ReportContent, ReportItem } from '../../services/scheduleReportApi';

export type StatusStyle = {
  fill: string;
  text: string;
  stroke: string;
  label: string;
  textStroke?: string;
  textStrokeWidth?: string;
};

export const STATUS: Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle> = {
  COMPLETED: {
    fill: '#1e3a8a',
    text: '#ffffff',
    stroke: '#1e3a8a',
    label: '完了',
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  },
  IN_PROGRESS: {
    fill: '#2563eb',
    text: '#1e3a8a',
    stroke: '#2563eb',
    label: '進行中',
    textStroke: '#ffffff',
    textStrokeWidth: '3px'
  },
  PENDING: {
    fill: '#f1f5f9',
    text: '#475569',
    stroke: '#94a3b8',
    label: '未着手',
    textStroke: '#ffffff',
    textStrokeWidth: '3px'
  }
};

export type ReportSection = {
  id: keyof ReportContent;
  title: string;
  headerColor: string;
  items: ReportItem[];
};

export const INITIAL_REPORT_SECTIONS: ReportSection[] = [
  {
    id: 'progress',
    title: '今週の主要実績',
    headerColor: 'bg-[#1e5fa0]',
    items: [
      { text: '要件定義書および基本設計書のクライアント承認完了', type: 'normal' },
      { text: '開発環境（AWS）の構築完了', type: 'normal' },
      { text: '認証機能（Auth0）の実装先行着手', type: 'highlight' },
      { text: '週次定例会でのUIモックアップ合意', type: 'normal' }
    ]
  },
  {
    id: 'next_steps',
    title: '来週の予定・アクション',
    headerColor: 'bg-[#5b9bd5]',
    items: [
      { text: '主要機能（検索・一覧）のバックエンド実装開始', type: 'normal' },
      { text: 'フロントエンドコンポーネントの実装開始', type: 'normal' },
      { text: '外部API連携（決済システム）の仕様確認MTG', type: 'normal' },
      { text: '詳細設計書の残課題（例外処理フロー）のFix', type: 'normal' }
    ]
  },
  {
    id: 'risks',
    title: '課題・リスク・決定事項',
    headerColor: 'bg-[#ef4444]',
    items: [
      {
        text: '【リスク】外部決済APIの仕様変更の可能性あり',
        subText: '→ 影響範囲調査中。来週中に方針決定必要。',
        badge: '高',
        badgeColor: 'bg-red-100 text-red-800'
      },
      {
        text: '【課題】テストデータ作成の遅れ',
        subText: '→ 担当者リソース不足。追加メンバーのアサインを検討中。',
        badge: '中',
        badgeColor: 'bg-yellow-100 text-yellow-800'
      },
      {
        text: '【決定】初回リリース範囲から「帳票出力」を除外',
        subText: '→ Phase2での対応とする合意済み。',
        badge: '済',
        badgeColor: 'bg-green-100 text-green-800'
      }
    ]
  }
];
