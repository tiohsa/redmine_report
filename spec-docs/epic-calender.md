# Epic: 詳細ダイアログの開始日・期日インライン編集を react-datepicker に移行する

## 背景

詳細ダイアログのチケットテーブルでは、開始日・期日のインライン編集にネイティブの日付入力を利用している。
これを `react-datepicker` ベースへ移行し、Today、Clear、年選択、月選択を提供したい。

ただし本変更は単なる UI 差し替えではない。
`react-datepicker` はカレンダー popper を伴うため、現行の blur 前提の編集完了処理をそのまま適用すると、誤保存や誤終了が起きやすい。
そのため、本 Epic では日付編集 UI と編集完了フローを一体で見直す。

## 目的

- 開始日・期日の入力体験を改善する
- Today / Clear / 年選択 / 月選択を提供する
- 開始日と期日の相互制約を維持する
- 詳細ダイアログ内で安全に編集・保存できるようにする
- 既存の画面構造と利用者の操作感を大きく崩さずに移行する

## スコープ

- `TaskDetailsDialog` のチケットテーブル内の開始日・期日インライン編集
- `react-datepicker` 導入
- 日付編集専用コンポーネントの追加
- 編集完了・キャンセル・保存トリガーの見直し
- テスト更新

## 非スコープ

- プロセスフロー上のバー操作仕様変更
- Redmine 本体の issue edit / new 画面の日付 UI 変更
- API 仕様変更
- 日付編集以外のインライン編集仕様変更
- 別機能としての保存ボタン追加や一括保存モード導入

## 現状課題

- ネイティブ `input type="date"` では Today / Clear / 年月選択の UX が不足する
- `react-datepicker` 導入時に blur ベースの commit では誤保存リスクがある
- 現在の実装は `TaskDetailsDialog` に編集ロジックが集中しており、変更時の影響範囲が大きい
- 既存テストがネイティブ date input の挙動に強く依存している

## 要求仕様

### 編集開始

- 開始日セルまたは期日セルのダブルクリックで編集モードに入る
- ダブルクリックした側のフィールドを初期フォーカス対象にする

### 編集UI

- 行単位の日付範囲編集モードを維持する
- 開始日・期日それぞれを `react-datepicker` で編集する
- 以下を利用可能にする
  - Today
  - Clear
  - 月選択
  - 年選択

### 表示

- 非編集時は現状同様のテキスト表示を維持する
- 表示形式は `yyyy/MM/dd`
- API 送信値は `yyyy-MM-dd`

### 制約

- 開始日は期日を超えて設定できない
- 期日は開始日より前に設定できない
- 片方が未設定の場合は、存在する側だけを制約条件として扱う
- Clear により null 化を許可する

### 保存・キャンセル

- 単純な blur のみでは commit しない
- 編集完了イベントで commit する
  - Enter
  - 編集領域外での確定操作
  - カレンダー操作完了後の確定
- Escape で編集前状態へ戻す
- 差分がある場合のみ保存処理を実行する

### 画面整合

- datepicker の popper が dialog より背面に隠れないこと
- dialog overlay クリックとの競合で意図せず閉じないこと
- 保存中表示は既存の saving 表示方針と整合させること

## 設計方針

### 1. コンポーネント分割

`TaskDetailsDialog` から日付編集 UI を切り出し、専用コンポーネントを追加する。

候補:

- `spa/src/components/projectStatusReport/InlineDateRangeEditor.tsx`

責務:

- 開始日・期日の表示と編集
- Today / Clear / month/year select
- 日付変換
- 開始日・期日制約
- commit / cancel イベント通知

### 2. 状態管理

`TaskDetailsDialog` 側は以下を保持する。

- 編集対象 issueId
- focusField
- startDate draft
- dueDate draft

`InlineDateRangeEditor` は表示制御と入力操作を担当し、保存判断そのものは親へ返す。

### 3. 保存方式

保存は「編集完了イベントで commit」方式へ寄せる。
commit 時に差分判定を行い、差分がある場合のみ既存の更新 API を呼ぶ。

### 4. デザイン

既存の compact なテーブルデザインに合わせる。

- セル高
- フォントサイズ
- 境界線
- hover / focus 見た目
- z-index

## 実装タスク

### Issue 1: react-datepicker 導入と依存調整

- `react-datepicker` を追加
- 必要な CSS 読み込み方針を決定
- Vite / Vitest 環境での動作確認

### Issue 2: InlineDateRangeEditor コンポーネント新設

- 開始日 picker / 期日 picker 実装
- Today / Clear / month/year select 実装
- 表示値と API 値の変換実装
- minDate / maxDate 制約実装

### Issue 3: TaskDetailsDialog の日付セル置換

- 既存 `input type="date"` 編集を撤去
- 行単位編集モデルへ接続
- focusField に応じた初期表示・初期操作を実装

### Issue 4: commit / cancel フロー再設計

- blur 依存を除去
- Enter / Escape / 外部確定操作の整理
- 差分判定と保存呼び出し整理
- 保存中表示との整合確認

### Issue 5: スタイルと dialog 内表示調整

- popper の重なり順制御
- dialog overlay との競合対策
- compact UI への見た目調整

### Issue 6: テスト更新

- 既存の日付編集テストを `react-datepicker` 前提へ更新
- Today / Clear / 年月選択の追加テスト
- 制約テスト
- commit / cancel テスト
- API 呼び出し回帰確認

## 受け入れ条件

- 開始日・期日セルをダブルクリックすると編集できる
- Today で当日がセットされる
- Clear で日付を消せる
- 年・月選択ができる
- 開始日 > 期日 にならない
- 期日 < 開始日 にならない
- Escape でキャンセルできる
- commit 時だけ保存される
- 保存成功後、既存の一覧更新連携が壊れない
- 詳細ダイアログ内でカレンダー popper が正しく表示される
- 既存の主要テストと新規日付テストが通る

## リスク

- popper の z-index 問題
- dialog 外クリックとの競合
- 既存テストの大幅修正
- ライブラリ内部 DOM 依存の brittle なテスト化

## リスク対策

- datepicker 表示コンテナを制御する
- commit / cancel を明示設計にする
- テストは内部 DOM より操作結果と API 呼び出し中心に書く
- コンポーネント切り出しにより単体テストしやすくする
