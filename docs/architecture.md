# architecture.md — 医療シフト管理Webアプリ

## 1. 概要

医療従事者の管理職が、複雑な制約（希望休・業務適性・当直・相性など）を考慮しながら、勤務表を効率的に作成・調整できるWebアプリ。

### 1.1 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Cloudflare Pages + Vite + React + TypeScript |
| バックエンド | Cloudflare Workers + Hono |
| データベース | Cloudflare D1 (SQLite) |
| 認証 | Workers自前実装（bcrypt + JWT） |
| AI機能 | Anthropic Claude API (claude-sonnet-4-6) |
| スケジュール生成 | クライアントサイド制約ソルバー（Web Worker） |

### 1.2 コスト見積もり

| リソース | プラン | 月額 |
|---------|--------|------|
| Cloudflare Workers | Paid ($5) | $5 |
| Cloudflare D1 | Free tier内 | $0 |
| Cloudflare Pages | Free | $0 |
| Claude API | 従量課金 | $1〜5（利用量依存） |
| **合計** | | **$6〜$10** |

Workers Paid プランは制約ソルバーのフォールバック（サーバーサイド生成）やAI呼び出しで30秒CPUタイムが必要なため必須。D1はFree tier（5M rows read/日、100K rows write/日、5GB）で十分収まる想定。

---

## 2. アーキテクチャ全体図

```
┌─────────────────────────────────────────────────┐
│  Client (React SPA on Cloudflare Pages)         │
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ UI Layer │ │ State    │ │ Web Worker     │  │
│  │ (React)  │ │ (Zustand)│ │ (制約ソルバー)  │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS (REST API)
┌───────────────────▼─────────────────────────────┐
│  Cloudflare Workers (Hono)                      │
│                                                 │
│  ┌──────┐ ┌──────┐ ┌───────┐ ┌──────────────┐  │
│  │ Auth │ │ CRUD │ │ Export│ │ AI Proxy     │  │
│  │      │ │      │ │      │ │ (Claude API) │  │
│  └──────┘ └──────┘ └───────┘ └──────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │
          ┌─────────▼─────────┐
          │  Cloudflare D1    │
          │  (SQLite)         │
          └───────────────────┘
```

### 2.1 設計方針

- **制約ソルバーはクライアントサイド（Web Worker）で実行**: Workers CPU時間制限の回避、即時フィードバック、サーバーコスト削減
- **AIはサーバーサイドプロキシ経由**: APIキーをクライアントに露出させない
- **ゲストログイン**: サーバーサイドに一時アカウントを作成、72時間データ保持（ゲスト用）
- **認証**: JWT（HttpOnly Cookie）、リフレッシュトークンなし（シンプル化）

---

## 3. データベース設計（D1）

### 3.1 ER図概要

```
users ─┬─< workspaces ─┬─< staff
       │               ├─< task_types
       │               ├─< schedules ──< schedule_entries
       │               ├─< staff_ng_pairs
       │               └─< day_off_requests
       │
       └─ (workspace_id FK on all child tables)
```

### 3.2 テーブル定義

```sql
-- ユーザー（認証）
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE,               -- NULLでゲスト
  password_hash TEXT,              -- NULLでゲスト
  is_guest INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ワークスペース（組織・部署単位）
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 職員
CREATE TABLE staff (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_name TEXT,                 -- グループ（病棟A, チームBなど）
  is_training INTEGER NOT NULL DEFAULT 0, -- 独り立ち前フラグ
  night_shift_max INTEGER DEFAULT NULL,   -- 当直上限/月
  oncall_max INTEGER DEFAULT NULL,        -- オンコール上限/月
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 業務種類
CREATE TABLE task_types (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- 日勤, 当直, オンコール, 休み等
  category TEXT NOT NULL CHECK(category IN ('regular', 'night', 'oncall', 'off', 'post_night')),
  required_count INTEGER NOT NULL DEFAULT 1, -- 必要人数
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6B7280'     -- UI表示色
);

-- 業務担当可否（多対多）
CREATE TABLE staff_task_abilities (
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  task_type_id TEXT NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, task_type_id)
);

-- 相性NGペア
CREATE TABLE staff_ng_pairs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  staff_id_1 TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  staff_id_2 TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  reason TEXT,
  UNIQUE(workspace_id, staff_id_1, staff_id_2)
);

-- 希望休
CREATE TABLE day_off_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  date TEXT NOT NULL,              -- YYYY-MM-DD
  UNIQUE(staff_id, schedule_id, date)
);

-- 勤務表（月単位）
CREATE TABLE schedules (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'generated', 'finalized')),
  generated_at TEXT,
  solver_log TEXT,                 -- 生成時のログ（JSON）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, year, month)
);

-- 勤務表エントリ（1セル = 1レコード）
CREATE TABLE schedule_entries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  task_type_id TEXT NOT NULL REFERENCES task_types(id),
  is_manual INTEGER NOT NULL DEFAULT 0,  -- 手動編集フラグ
  UNIQUE(schedule_id, staff_id, date)
);

-- インデックス
CREATE INDEX idx_staff_workspace ON staff(workspace_id);
CREATE INDEX idx_entries_schedule ON schedule_entries(schedule_id);
CREATE INDEX idx_entries_date ON schedule_entries(schedule_id, date);
CREATE INDEX idx_dayoff_schedule ON day_off_requests(schedule_id);
```

---

## 4. API設計（Hono on Workers）

### 4.1 エンドポイント一覧

```
基本パス: /api/v1

認証
  POST   /auth/register          アカウント作成
  POST   /auth/login             ログイン
  POST   /auth/guest             ゲストログイン
  POST   /auth/logout            ログアウト
  GET    /auth/me                現在のユーザー情報

ワークスペース
  GET    /workspaces             一覧
  POST   /workspaces             作成
  PUT    /workspaces/:id         更新
  DELETE /workspaces/:id         削除

職員
  GET    /workspaces/:wid/staff            一覧
  POST   /workspaces/:wid/staff            登録
  PUT    /workspaces/:wid/staff/:id        更新
  DELETE /workspaces/:wid/staff/:id        削除
  PUT    /workspaces/:wid/staff/:id/abilities  担当可否一括更新

相性NG
  GET    /workspaces/:wid/ng-pairs         一覧
  POST   /workspaces/:wid/ng-pairs         登録
  DELETE /workspaces/:wid/ng-pairs/:id     削除

業務種類
  GET    /workspaces/:wid/task-types       一覧
  POST   /workspaces/:wid/task-types       登録
  PUT    /workspaces/:wid/task-types/:id   更新
  DELETE /workspaces/:wid/task-types/:id   削除

勤務表
  GET    /workspaces/:wid/schedules              一覧
  POST   /workspaces/:wid/schedules              作成（年月指定）
  GET    /workspaces/:wid/schedules/:id          詳細（エントリ含む）
  PUT    /workspaces/:wid/schedules/:id/entries  エントリ一括更新
  DELETE /workspaces/:wid/schedules/:id          削除

希望休
  GET    /workspaces/:wid/schedules/:sid/day-offs          一覧
  POST   /workspaces/:wid/schedules/:sid/day-offs          登録
  POST   /workspaces/:wid/schedules/:sid/day-offs/import   CSV/Excelインポート
  DELETE /workspaces/:wid/schedules/:sid/day-offs/:id      削除

エクスポート
  GET    /workspaces/:wid/schedules/:id/export?format=csv  CSV出力
  GET    /workspaces/:wid/schedules/:id/export?format=xlsx Excel出力

AI
  POST   /workspaces/:wid/schedules/:id/ai/explain   原因説明・偏り指摘
```

### 4.2 認証フロー

```
1. POST /auth/register or /auth/login
   → パスワードをbcryptでハッシュ化/検証
   → JWTトークン生成（有効期限: 7日）
   → Set-Cookie: token=<JWT>; HttpOnly; Secure; SameSite=Strict

2. POST /auth/guest
   → is_guest=1のユーザーを自動作成
   → 同様にJWT発行
   → ゲストデータは72時間後にCron Triggerで削除

3. 全APIリクエスト
   → Honoミドルウェアでcookieからtoken検証
   → c.set('userId', decoded.sub)
```

### 4.3 ミドルウェア構成

```typescript
// src/index.ts
const app = new Hono<{ Bindings: Env }>()

// グローバル
app.use('*', cors({ origin: FRONTEND_URL, credentials: true }))
app.use('/api/v1/*', authMiddleware)  // /auth/* は除外

// ワークスペース所有権チェック
app.use('/api/v1/workspaces/:wid/*', workspaceOwnerMiddleware)
```

---

## 5. フロントエンド設計

### 5.1 ディレクトリ構成

```
src/
├── main.tsx
├── App.tsx
├── routes/
│   ├── Login.tsx
│   ├── Dashboard.tsx           # ワークスペース一覧
│   ├── workspace/
│   │   ├── Layout.tsx          # サイドバー付きレイアウト
│   │   ├── StaffList.tsx       # 職員管理
│   │   ├── StaffEdit.tsx       # 職員編集（担当可否・上限）
│   │   ├── TaskTypes.tsx       # 業務種類設定
│   │   ├── NgPairs.tsx         # 相性NG設定
│   │   ├── ScheduleList.tsx    # 勤務表一覧
│   │   └── ScheduleEditor.tsx  # 勤務表編集（メイン画面）
├── components/
│   ├── ui/                     # 汎用UIコンポーネント
│   ├── schedule/
│   │   ├── Grid.tsx            # 勤務表グリッド（職員×日付）
│   │   ├── Cell.tsx            # 1セル（業務タイプ選択）
│   │   ├── ViolationBadge.tsx  # 違反表示
│   │   ├── GeneratePanel.tsx   # 自動生成パネル
│   │   └── AiExplainPanel.tsx  # AI説明パネル
│   ├── staff/
│   │   ├── AbilityMatrix.tsx   # 業務担当可否マトリクス
│   │   └── ImportDayOff.tsx    # 希望休インポート
│   └── export/
│       └── ExportButton.tsx
├── stores/
│   ├── authStore.ts            # Zustand: 認証状態
│   ├── workspaceStore.ts       # Zustand: 現在のワークスペース
│   └── scheduleStore.ts        # Zustand: 勤務表編集状態
├── solver/
│   ├── worker.ts               # Web Worker エントリ
│   ├── engine.ts               # 制約ソルバー本体
│   ├── constraints.ts          # 制約定義
│   └── types.ts                # ソルバー型定義
├── lib/
│   ├── api.ts                  # API クライアント (fetch wrapper)
│   ├── validators.ts           # Zod スキーマ
│   └── utils.ts
└── types/
    └── index.ts                # 共通型定義
```

### 5.2 状態管理

```typescript
// Zustand による最小限の状態管理

// scheduleStore.ts
interface ScheduleState {
  schedule: Schedule | null
  entries: Map<string, ScheduleEntry>  // key: `${staffId}-${date}`
  violations: Violation[]
  solverStatus: 'idle' | 'running' | 'done' | 'failed'
  solverProgress: number  // 0-100

  // Actions
  loadSchedule: (id: string) => Promise<void>
  updateEntry: (staffId: string, date: string, taskTypeId: string) => void
  runSolver: () => void
  validateAll: () => Violation[]
}
```

### 5.3 ルーティング

```
/login                              → Login.tsx
/                                   → Dashboard.tsx
/workspace/:wid                     → workspace/Layout.tsx
/workspace/:wid/staff               → StaffList.tsx
/workspace/:wid/staff/:id           → StaffEdit.tsx
/workspace/:wid/task-types          → TaskTypes.tsx
/workspace/:wid/ng-pairs            → NgPairs.tsx
/workspace/:wid/schedules           → ScheduleList.tsx
/workspace/:wid/schedules/:id       → ScheduleEditor.tsx
```

React Router v7 を使用。

---

## 6. 制約ソルバー設計

### 6.1 実行環境

制約ソルバーはWeb Worker上で実行し、メインスレッドをブロックしない。

```typescript
// solver/worker.ts
self.onmessage = (e: MessageEvent<SolverInput>) => {
  const result = solve(e.data)
  self.postMessage(result)
}

// solver/types.ts
interface SolverInput {
  year: number
  month: number
  staff: StaffWithAbilities[]
  taskTypes: TaskType[]
  ngPairs: NgPair[]
  dayOffRequests: DayOffRequest[]
  existingEntries: ScheduleEntry[]  // 手動固定分
}

interface SolverOutput {
  status: 'success' | 'partial' | 'failed'
  entries: ScheduleEntry[]
  violations: Violation[]
  unfilledSlots: UnfilledSlot[]     // 埋められなかった枠
  stats: SolverStats                // 偏り統計
}
```

### 6.2 アルゴリズム

**貪欲法 + バックトラッキング（制約伝播付き）**

```
1. 前処理
   - 手動固定エントリを確定
   - 希望休を全職員の該当日にoff制約として設定
   - 当直翌日の明け休みを連鎖制約として登録

2. スロット優先度計算（Most Constrained First）
   - 各日付×業務タイプのスロットについて、割当可能な職員数を計算
   - 候補が少ないスロットから優先的に埋める（当直 > 特殊業務 > 通常）

3. 職員選択
   - 割当可能な職員を抽出（担当可否・希望休・上限・相性NGでフィルタ）
   - 現在の割当回数が少ない職員を優先（公平性）
   - 独り立ち前の職員は単独配置不可（同日同業務に経験者がいるか確認）

4. 割当 & 制約伝播
   - 割当実行
   - 当直の場合、翌日に明け休みを自動設定
   - 上限カウント更新
   - 相性NG制約の伝播

5. バックトラック
   - 割当不可の場合、直前の割当を取り消して別候補を試行
   - 最大バックトラック回数制限あり（パフォーマンス保護）

6. 結果分析
   - 全スロット充足 → success
   - 一部未充足 → partial（埋められなかったスロットと原因を返却）
   - 割当不能 → failed（原因分析結果を返却）
```

**実装フェーズの扱い**: 最終形は上記の「貪欲法 + バックトラッキング（制約伝播付き）」を目指す。ただし初期サイクルではバックトラッキングを必須にせず、まずは「候補が少ないスロットから順に割り当て、埋まらない枠を `partial` として返す」段階実装でよい。


### 6.3 制約一覧と優先度

| 優先度 | 制約 | 説明 | 破れる？ |
|--------|------|------|---------|
| P0（絶対） | 必要人数 | 各業務の必要人数を充足する | No（未充足は `partial` として返す） |
| P0 | 希望休 | 希望休の日にアサインしない | No |
| P0 | 担当不可 | 業務適性のない職員をアサインしない | No |
| P0 | 独り立ち前単独NG | 研修中職員を単独配置しない | No |
| P1（強） | 当直明け休み | 当直翌日は必ず明け休み | No |
| P1 | 上限回数 | 当直・オンコールの月間上限 | No |
| P1 | 相性NG | NGペアを同日同業務に配置しない | 原則No（将来的に管理者判断で緩和モードを検討） |
| P3（弱） | 公平性 | 業務回数の偏りを最小化 | ベストエフォート |
| P3 | グループ寄せ | 同一グループをなるべく同じ業務に寄せる | ベストエフォート |

**補足**: 必要人数は勤務表成立条件のためP0とする。ただし、現実運用ではすべてを埋められない月があり得るため、生成結果としては `failed` ではなく `partial` を積極的に返す。`partial` では未充足スロットと原因候補を表示し、人が調整できる状態にする。

**相性NGの扱い**: デフォルトは厳守。将来的に「どうしても埋まらない場合のみ警告付きで許容する」緩和モードを追加できる余地を残すが、MVPでは相性NGを破らない前提で実装する。

### 6.4 違反検知（リアルタイム）

手動編集時にもリアルタイムで違反を検知する。エントリ更新のたびに `validateAll()` を実行。

```typescript
interface Violation {
  type: 'hard' | 'soft'
  rule: ConstraintRule
  staffId: string
  date: string
  message: string  // 例: "田中さんは当直の上限(4回)に達しています"
}
```

---

## 7. AI説明機能

### 7.1 概要

Claude APIを使い、制約ソルバーの結果を自然言語で説明する。

### 7.2 API呼び出し（Workers → Claude）

```typescript
// workers/src/routes/ai.ts
app.post('/ai/explain', async (c) => {
  const { summary, issues, stats, question } = await c.req.json()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': c.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(summary, issues, stats, question) }],
    }),
  })

  return c.json(await response.json())
})
```

### 7.3 プロンプト設計

```
システムプロンプト:
あなたは医療機関の勤務表作成を支援するアシスタントです。
勤務表の制約違反、偏り、改善案について、管理職にわかりやすく説明してください。
専門用語は避け、具体的な職員名と日付を挙げて説明してください。

ユーザープロンプト（構造化データ付き）:
以下の勤務表サマリについて分析してください。
勤務表全体のグリッドや詳細ログは送らず、説明に必要な要約データのみを渡します。

## 勤務表概要
- 年月: {year}年{month}月
- 職員数: {staffCount}名
- 業務種類: {taskTypes}

## 未充足スロット
{unfilledSlots}

## 制約違反一覧
{violations}

## 統計サマリ
{stats}

## 原因候補
{reasonHints}

## 質問
{question || "この勤務表の問題点と改善案を教えてください"}
```


### 7.4 AI入力データの制限

AIには勤務表全体のグリッドや詳細な `solverLog` をそのまま送らない。トークン量・コスト・応答速度・個人情報露出範囲を抑えるため、以下の要約データに限定する。

| データ | 内容 |
|--------|------|
| summary | 年月、職員数、業務種類などの概要 |
| issues.unfilledSlots | 埋められなかった日付・業務・必要人数・不足人数 |
| issues.violations | 制約違反の種類、対象職員、日付、理由 |
| stats | 職員別の当直回数、オンコール回数、業務回数の集計 |
| reasonHints | ソルバー側で判定した原因候補（希望休集中、担当可能者不足、上限到達など） |

AIはこの要約をもとに、管理者向けの説明文と改善ヒントを返す。割当そのものの決定や制約判定は、AIではなくソルバーとバリデーションロジックで行う。

### 7.5 AI機能の範囲

| 機能 | 説明 |
|------|------|
| 原因説明 | 「なぜ○日に人が足りないのか」→ 希望休集中・有資格者不足等を説明 |
| 偏り指摘 | 「当直が特定の人に偏っている」→ 職員ごとの回数比較 |
| 改善ヒント | 「○○さんの資格を追加すれば解消できる」等の提案 |

---

## 8. インポート / エクスポート

### 8.1 希望休インポート（CSV / Excel）

**CSVフォーマット（想定）**:
```
職員名, 日付
田中太郎, 2026-06-03
田中太郎, 2026-06-15
佐藤花子, 2026-06-10
```

**処理フロー**:
1. フロントでファイル読み込み（Papa Parse / SheetJS）
2. バリデーション（職員名の名寄せ、日付フォーマット）
3. プレビュー表示 → 確認後API送信
4. `POST /day-offs/import` で一括登録

### 8.2 勤務表エクスポート

**CSVエクスポート**: Workers側で生成、ダウンロード

**Excelエクスポート**: Workers側でSheetJS（xlsx-populate等）を使い.xlsx生成

出力フォーマット:
```
       | 6/1(月) | 6/2(火) | 6/3(水) | ...
田中太郎 | 日勤    | 当直    | 明休    | ...
佐藤花子 | 日勤    | 休み    | 日勤    | ...
```

---

## 9. Workers プロジェクト構成

```
workers/
├── src/
│   ├── index.ts               # Hono app エントリ
│   ├── middleware/
│   │   ├── auth.ts            # JWT検証
│   │   └── workspace.ts       # ワークスペース所有権チェック
│   ├── routes/
│   │   ├── auth.ts            # 認証エンドポイント
│   │   ├── workspaces.ts
│   │   ├── staff.ts
│   │   ├── taskTypes.ts
│   │   ├── ngPairs.ts
│   │   ├── schedules.ts
│   │   ├── dayOffs.ts
│   │   ├── export.ts
│   │   └── ai.ts              # AI説明エンドポイント
│   ├── db/
│   │   ├── schema.sql         # D1マイグレーション
│   │   └── queries.ts         # クエリヘルパー
│   └── lib/
│       ├── jwt.ts
│       ├── password.ts        # bcryptハッシュ
│       └── validation.ts      # Zodスキーマ
├── wrangler.toml
└── package.json
```

### 9.1 wrangler.toml

```toml
name = "shift-scheduler-api"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
FRONTEND_URL = "https://shift-scheduler.pages.dev"

[[d1_databases]]
binding = "DB"
database_name = "shift-scheduler-db"
database_id = "<D1_DATABASE_ID>"

# ゲストデータ定期削除
[triggers]
crons = ["0 3 * * *"]  # 毎日AM3時
```

---

## 10. セキュリティ

| 項目 | 対策 |
|------|------|
| 認証 | JWT (HttpOnly, Secure, SameSite=Strict Cookie) |
| パスワード | bcrypt (cost=12) |
| CORS | FRONTEND_URLのみ許可 |
| 入力検証 | Zod によるリクエストバリデーション |
| SQLi | D1のprepared statements |
| 認可 | ワークスペース所有権ミドルウェア（他ユーザーのデータアクセス不可） |
| ゲスト | 72時間後にCron Triggerでデータ削除 |
| APIキー | ANTHROPIC_API_KEY は Workers Secrets で管理 |

---

## 11. 画面構成

### 11.1 画面一覧

| # | 画面 | 概要 |
|---|------|------|
| 1 | ログイン | メール/パスワード入力 + ゲストログインボタン |
| 2 | アカウント作成 | メール/パスワード登録 |
| 3 | ダッシュボード | ワークスペース一覧・作成 |
| 4 | 職員管理 | 職員一覧テーブル、登録・編集・削除 |
| 5 | 職員編集 | 担当可否マトリクス、上限設定、グループ、研修フラグ |
| 6 | 業務種類設定 | 業務タイプの追加・編集・必要人数設定 |
| 7 | 相性NG設定 | NGペア一覧、追加・削除 |
| 8 | 勤務表一覧 | 月別の勤務表リスト（ステータス表示） |
| 9 | **勤務表エディタ** | メイン画面（下記参照） |

### 11.2 勤務表エディタ（メイン画面）

```
┌─────────────────────────────────────────────────────────┐
│ [← 戻る] 2026年6月 勤務表     [自動生成] [エクスポート] │
├─────────────────────────────────────────────────────────┤
│        │ 6/1 月 │ 6/2 火 │ 6/3 水 │ ... │ 統計       │
├────────┼────────┼────────┼────────┼─────┼────────────┤
│ 田中   │ [日勤] │ [当直] │ [明休] │     │ 当直:4 OC:2│
│ 佐藤   │ [日勤] │ [休⭐] │ [日勤] │     │ 当直:3 OC:3│
│ 鈴木   │ [当直] │ [明休] │ [日勤] │     │ 当直:5⚠   │
├────────┴────────┴────────┴────────┴─────┴────────────┤
│ 違反: 2件                                              │
│ ⚠ 鈴木: 当直が上限(4回)を超過しています (5回)           │
│ ⚠ 6/15: 日勤の必要人数(3名)に対し2名しかいません        │
├─────────────────────────────────────────────────────────┤
│ [AI に聞く]                                             │
│ 💬 "6/15の人数不足は佐藤さんと山田さんの希望休が重なって │
│    いるためです。佐藤さんの希望休を6/16に移動できれば     │
│    解消します。"                                        │
└─────────────────────────────────────────────────────────┘
```

- グリッドセルをクリックで業務タイプ変更（手動編集）
- ⭐ = 希望休（変更不可を視覚表示）
- ⚠ = 違反セル（赤ハイライト）
- 統計列に当直・オンコール回数を表示
- 右下パネルでAI説明を表示

---

## 12. 開発フェーズ

### Phase 1: 基盤（認証 + CRUD）
- Workers + Hono セットアップ
- D1 スキーマ作成
- 認証（登録・ログイン・ゲスト）
- ワークスペース CRUD
- 職員 CRUD + 業務種類 CRUD
- フロント: ログイン、ダッシュボード、職員管理、業務設定

### Phase 2: 勤務表コア
- 勤務表 CRUD
- 希望休管理（手動 + CSVインポート）
- 相性NG設定
- 勤務表エディタUI（グリッド表示 + 手動編集）

### Phase 3: 自動生成 + 違反検知
- 制約ソルバー実装（Web Worker）
- リアルタイム違反検知
- 生成結果の統計表示

### Phase 4: AI + エクスポート
- Claude API 連携（原因説明・偏り指摘・改善ヒント）
- CSV / Excel エクスポート

### Phase 5: Should機能
- 偏り可視化チャート
- 履歴考慮（前月データ参照）
- スコアリング

---

## 13. 技術的な注意点

### 13.1 D1 の制約
- 1トランザクションで最大1000文の文実行可能。勤務表保存時（30日×30人=900エントリ）は分割バッチ処理
- D1のREAD性能は高いが、WRITE多発時はバッチINSERT推奨

### 13.2 Workers CPU 時間
- Paid plan: 30秒CPU。AI APIコール（外部fetch）はI/O待ちでCPU消費しないため問題なし
- 重い計算（ソルバー）はクライアントサイドWeb Workerに委譲

### 13.3 制約ソルバーのパフォーマンス
- 典型的な規模（職員20〜50名、30日）で数秒以内に完了を目標
- バックトラック上限（10,000回）でタイムアウト防止
- 進捗をpostMessageでUIに通知（プログレスバー表示）

### 13.4 ゲストデータ管理
- Cron Trigger（毎日AM3時）で `created_at + 72h < now` のゲストユーザーとカスケード削除
- ゲスト→正規アカウントへの昇格: email/password設定で `is_guest=0` に更新

---

## 14. 使用ライブラリ

### フロントエンド
| ライブラリ | 用途 |
|-----------|------|
| react / react-dom | UI |
| react-router v7 | ルーティング |
| zustand | 状態管理 |
| zod | バリデーション |
| papaparse | CSV解析 |
| xlsx (SheetJS) | Excel読み込み |
| tailwindcss | スタイリング |
| lucide-react | アイコン |

### バックエンド (Workers)
| ライブラリ | 用途 |
|-----------|------|
| hono | HTTPフレームワーク |
| zod | バリデーション |
| bcryptjs | パスワードハッシュ（pure JS版） |
| jose | JWT生成・検証 |
| xlsx (SheetJS) | Excelエクスポート |
