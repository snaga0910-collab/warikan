// Supabaseクライアント（サーバー専用）。
// RLSは有効かつポリシー無しにしてあるため、読み書きは秘密キーを持つサーバー側からのみ行う。
// このファイルをクライアントコンポーネントから import しないこと（秘密キーが漏れるため）。

import { createClient } from "@supabase/supabase-js";

export type Group = {
  id: string;
  name: string;
  created_at: string;
};

export type MemberRow = {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type ExpenseRow = {
  id: string;
  group_id: string;
  payer_id: string;
  amount: number;
  note: string | null;
  participant_ids: string[] | null; // 空・null なら全員が対象
  deleted_at: string | null; // 論理削除（元に戻せるようにするため）
  created_at: string;
};

export type PaidRow = {
  id: string;
  group_id: string;
  from_id: string;
  to_id: string;
  amount: number;
  created_at: string;
};

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabaseの設定がありません。.env.local の NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY を確認してください。",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
