# cycle-01 implementation tasks

## 0. 前提

- Cloudflare Workers + Hono
- Cloudflare Pages (React)
- D1 使用
- モノレポ or 別ディレクトリ構成

---

## 1. Backend（Workers）

### 1-1. プロジェクト初期化

- [ ] Workersプロジェクト作成
- [ ] Honoセットアップ
- [ ] wrangler.toml設定
- [ ] D1バインド設定

---

### 1-2. DBスキーマ（最小）

- [ ] users
- [ ] workspaces
- [ ] staff
- [ ] schedules
- [ ] schedule_entries

※ task_types は今回はハードコード

---

### 1-3. 認証

- [ ] POST /auth/register
- [ ] POST /auth/login
- [ ] GET /auth/me
- [ ] JWT発行（jose）
- [ ] bcryptでパスワード保存
- [ ] auth middleware

---

### 1-4. ワークスペース

- [ ] ユーザー作成時にworkspace自動作成
- [ ] middlewareでworkspace取得

---

### 1-5. 職員API

- [ ] GET /staff
- [ ] POST /staff
- [ ] DELETE /staff/:id

---

### 1-6. 勤務表API

- [ ] POST /schedules（年月指定）
- [ ] GET /schedules/:id
- [ ] GET /schedules

---

---

## 2. Frontend（React）

### 2-1. 初期セットアップ

- [ ] Vite + React + TS
- [ ] React Router
- [ ] Zustand導入
- [ ] APIクライアント作成

---

### 2-2. 認証画面

- [ ] Loginページ
- [ ] Registerページ
- [ ] ログイン状態保持（store）

---

### 2-3. 職員管理

- [ ] 職員一覧表示
- [ ] 追加フォーム
- [ ] 削除ボタン

---

### 2-4. 勤務表一覧

- [ ] 月一覧表示
- [ ] 新規作成ボタン

---

### 2-5. 勤務表エディタ（最小）

- [ ] グリッド生成（職員 × 日付）
- [ ] セルに業務表示
- [ ] 再描画ロジック

---

---

## 3. ソルバー（MVP版）

### 3-1. Web Worker作成

- [ ] worker.ts作成
- [ ] postMessage構成

---

### 3-2. 簡易ロジック

- [ ] 日付ループ
- [ ] 各日1業務のみ（簡略）
- [ ] 順番に職員割当
- [ ] 当直の場合、翌日明休にする

---

### 3-3. 出力

- [ ] entries配列生成
- [ ] unfilledSlots生成
- [ ] status: success / partial

---

### 3-4. フロント連携

- [ ] 「自動生成」ボタン
- [ ] worker呼び出し
- [ ] 結果をstate反映

---

---

## 4. 最低限のバリデーション

- [ ] 空データで生成できない場合のガード
- [ ] 職員0人チェック

---

---

## 5. 動作確認シナリオ

- [ ] ユーザー登録
- [ ] ログイン
- [ ] 職員3人登録
- [ ] 勤務表作成（例：2026-06）
- [ ] 自動生成クリック
- [ ] グリッド表示される

---

---

## 6. 注意点

- まず「動く」を優先（最適化しない）
- DB設計は後で拡張可能に保つ
- ソルバーは後で差し替え前提
- UIは最低限でOK

---

## 7. 次サイクル候補

- 希望休
- violations表示
- 上限回数
- 相性NG
- AI説明