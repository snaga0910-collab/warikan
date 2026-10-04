# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## このプロジェクトについて

「わりかん精算」— 旅行や飲み会の立替を、**送金回数が最小になる形**で精算するWebアプリ。結果はグループ固有のURLでメンバーに共有する。

**仕様の正は `requirements.md`**。機能の追加・変更の前に必ず読み、そこに書かれた範囲とPhaseに従う。

## コマンド

```bash
npm run dev          # 開発サーバー（http://localhost:3000）
npm run build        # 本番ビルド（型エラーもここで検出される）
npm run lint         # ESLint
npm test             # 計算ロジックのテスト（Vitest）
npx tsc --noEmit     # 型チェックのみ

npx vitest run -t "受け入れ基準"   # テスト名で絞って実行
npx vitest                        # 変更を監視しながら実行
```

## 技術構成

- Next.js 16（App Router）+ React 19 + TypeScript。**Next.js 16 は学習データと異なる破壊的変更がある**ため、コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読むこと（`AGENTS.md` 参照）
- Tailwind CSS v4（`@tailwindcss/postcss` 経由。`tailwind.config` は無く、設定は `src/app/globals.css` 側）
- Supabase（PostgreSQL）／ Vitest ／ Vercel
- import エイリアス: `@/*` → `src/*`

## 全体の仕組み

```
[/]        旅行名とメンバーを入力 → グループ作成 → /g/<uuid> へ
[/g/<id>]  立替を追加 → 各自の「立替 − 負担額」を計算
                              │
            最も多く払う人と最も多く受け取る人を順に相殺（貪欲法）
                              │
                   最小回数の精算リストを表示 → URLで共有
```

| パス | 役割 |
|---|---|
| `src/lib/settle.ts` | **このアプリの心臓部**。負担額の配分・過不足・精算の算出。画面に依存しない純粋関数 |
| `src/lib/settle.test.ts` | 上記のテスト。要件定義書の受け入れ基準をそのまま検証している |
| `src/lib/supabase.ts` | サーバー専用クライアントと行の型 |
| `src/app/actions.ts` | Server Action（グループ作成・立替の追加/削除） |
| `src/app/g/[id]/page.tsx` | グループ画面。表示とフォームのみで、計算は `settle.ts` に任せる |
| `supabase/schema.sql` | テーブル定義（`wk_groups` / `wk_members` / `wk_expenses`） |

- 画面は**トップとグループの2つだけ**
- 入力は**Server Action**（フォーム送信）で行い、クライアント側に fetch を書かない
- 一覧は常に最新を出すため、グループ画面は `export const dynamic = "force-dynamic"`

## 守るべき設計判断

`requirements.md` の「やらないこと」「最重要ポイント」に基づく。

- **金額はすべて整数（円）で扱う**。小数・浮動小数点を使わない。割り切れない端数は1円単位で配分し、**配分の合計が必ず元の金額と一致する**こと
- **計算ロジックを画面に書かない**。`settle.ts` の純粋関数に閉じ込め、変更したら必ず `npm test` を通す。1円でもズレたら信用されず二度と使われないため
- 送金回数は**必ず「人数−1回」以下**に収まること
- **送金機能・ログイン・レシート読み取り・家計簿はスコープ外**。機能を増やすと、幹事がその場でサッと使えなくなる

## データベースとセキュリティ

- テーブルは `wk_` で始まる（**1個目のアプリ「そろそろリマインダー」と同じSupabaseプロジェクトに同居**しているため）
- **RLSを有効にし、ポリシーは作らない**。公開キーからは一切読み書きできず、DB操作はサーバー側の `SUPABASE_SECRET_KEY` 経由のみ
- 共有URLはグループの**UUID**そのもの。推測できない代わりに、**URLを知っている人は誰でも閲覧・追加できる**（MVPの仕様）
- 保存するのは**メンバー名と金額だけ**。氏名フルネームや連絡先は扱わない

## 環境変数（`.env.local`、Git管理外）

| 変数 | 使える場所 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ブラウザ・サーバー |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ブラウザ・サーバー |
| `SUPABASE_SECRET_KEY` | **サーバーのみ** |

- `NEXT_PUBLIC_` が付かない変数をクライアントコンポーネントから参照しないこと
- Supabase の URL とキーは**必ず同じプロジェクトのもの**を使う（別プロジェクトの組み合わせだと `401 Invalid API key` になる）
