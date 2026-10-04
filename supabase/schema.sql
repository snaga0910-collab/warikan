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
