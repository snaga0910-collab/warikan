-- わりかん精算：テーブル作成
-- Supabase の「SQL Editor」に貼り付けて実行してください。
-- ※1個目（そろそろリマインダー）と同じプロジェクトに同居させるため、名前を wk_ で始めています。

create table if not exists public.wk_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,                        -- 旅行名・飲み会名
  created_at timestamptz not null default now()
);

create table if not exists public.wk_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.wk_groups(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,         -- 表示順。端数を割り当てる順番にも使う
  created_at timestamptz not null default now()
);

create table if not exists public.wk_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.wk_groups(id) on delete cascade,
  payer_id uuid not null references public.wk_members(id) on delete cascade,
  amount int not null check (amount > 0),    -- 円。整数のみ
  note text,                                 -- 何に使ったか（任意）
  created_at timestamptz not null default now()
);

-- 検索を速くする
create index if not exists wk_members_group_idx on public.wk_members(group_id);
create index if not exists wk_expenses_group_idx on public.wk_expenses(group_id);

-- 行レベルセキュリティを有効にする。
-- ポリシーを作らないため、公開キーからは一切読み書きできない。
-- アプリはサーバー側から秘密キーで読み書きする。
alter table public.wk_groups enable row level security;
alter table public.wk_members enable row level security;
alter table public.wk_expenses enable row level security;

-- 以下は v1.0 で追加したもの

-- 削除を「元に戻せる」ようにする
alter table public.wk_expenses add column if not exists deleted_at timestamptz;

-- 一部の人だけの支払いに対応する（空なら全員が対象）
alter table public.wk_expenses add column if not exists participant_ids uuid[];

-- 送金が済んだかどうかを保存する
create table if not exists public.wk_settlement_paid (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.wk_groups(id) on delete cascade,
  from_id uuid not null,
  to_id uuid not null,
  amount int not null,
  created_at timestamptz not null default now(),
  unique (group_id, from_id, to_id, amount)
);
alter table public.wk_settlement_paid enable row level security;
