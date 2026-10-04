"use server";

// 画面からの操作（グループ作成・立替の追加／削除）。
// クライアント側でfetchを書かず、フォーム送信からサーバー側で直接DBを更新する。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const MAX_MEMBERS = 10;

/** F-01 グループを作る（旅行名＋メンバー） */
export async function createGroup(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  // 空欄は無視し、入力された名前だけを使う
  const memberNames = formData
    .getAll("member")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
    .slice(0, MAX_MEMBERS);

  if (!name) redirect("/?error=name");
  if (memberNames.length < 2) redirect("/?error=members");
  if (new Set(memberNames).size !== memberNames.length) redirect("/?error=duplicate");

  const supabase = getSupabase();

  const { data: group, error: groupError } = await supabase
    .from("wk_groups")
    .insert({ name })
    .select("id")
    .single();

  if (groupError || !group) {
    throw new Error(`グループの作成に失敗しました: ${groupError?.message}`);
  }

  const { error: memberError } = await supabase.from("wk_members").insert(
    memberNames.map((memberName, i) => ({
      group_id: group.id,
      name: memberName,
      sort_order: i,
    })),
  );

  if (memberError) {
    throw new Error(`メンバーの登録に失敗しました: ${memberError.message}`);
  }

  redirect(`/g/${group.id}`);
}

/** F-02 立替を追加する */
export async function addExpense(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const payerId = String(formData.get("payer_id") ?? "");
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();

  if (!groupId) return;
  if (!payerId) redirect(`/g/${groupId}?error=payer`);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000_000) {
    redirect(`/g/${groupId}?error=amount`);
  }

  const { error } = await getSupabase().from("wk_expenses").insert({
    group_id: groupId,
    payer_id: payerId,
    amount,
    note: note || null,
  });

  if (error) {
    throw new Error(`立替の追加に失敗しました: ${error.message}`);
  }

  revalidatePath(`/g/${groupId}`);
}

/** 入力ミスを消せるようにする */
export async function removeExpense(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!groupId || !id) return;

  const { error } = await getSupabase().from("wk_expenses").delete().eq("id", id);

  if (error) {
    throw new Error(`削除に失敗しました: ${error.message}`);
  }

  revalidatePath(`/g/${groupId}`);
}
