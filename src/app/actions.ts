"use server";

// 画面からの操作。クライアント側でfetchを書かず、フォーム送信からサーバー側で直接DBを更新する。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const MAX_MEMBERS = 10;

/** フォームから参加者の指定を取り出す。全員が選ばれていれば「指定なし（＝全員）」として保存する */
function readParticipants(formData: FormData, allIds: string[]): string[] | null {
  const picked = formData.getAll("participant").map(String).filter((id) => allIds.includes(id));
  if (picked.length === 0 || picked.length === allIds.length) return null;
  return picked;
}

async function memberIdsOf(groupId: string): Promise<string[]> {
  const { data } = await getSupabase()
    .from("wk_members")
    .select("id")
    .eq("group_id", groupId)
    .order("sort_order");
  return ((data ?? []) as { id: string }[]).map((m) => m.id);
}

/** F-01 グループを作る（旅行名＋メンバー） */
export async function createGroup(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

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

  const participants = readParticipants(formData, await memberIdsOf(groupId));

  const { error } = await getSupabase().from("wk_expenses").insert({
    group_id: groupId,
    payer_id: payerId,
    amount,
    note: note || null,
    participant_ids: participants,
  });

  if (error) throw new Error(`立替の追加に失敗しました: ${error.message}`);

  revalidatePath(`/g/${groupId}`);
  // 同じ人の立替を続けて入れやすいよう、選んだ人を次回も選択済みにしておく
  redirect(`/g/${groupId}?last=${payerId}`);
}

/** 立替を編集する（金額の打ち間違いを直せるように） */
export async function updateExpense(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const payerId = String(formData.get("payer_id") ?? "");
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();

  if (!groupId || !id) return;
  if (!payerId) redirect(`/g/${groupId}/e/${id}?error=payer`);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000_000) {
    redirect(`/g/${groupId}/e/${id}?error=amount`);
  }

  const participants = readParticipants(formData, await memberIdsOf(groupId));

  const { error } = await getSupabase()
    .from("wk_expenses")
    .update({ payer_id: payerId, amount, note: note || null, participant_ids: participants })
    .eq("id", id);

  if (error) throw new Error(`更新に失敗しました: ${error.message}`);

  revalidatePath(`/g/${groupId}`);
  redirect(`/g/${groupId}?saved=1`);
}

/** 立替を削除する（論理削除。あとから元に戻せる） */
export async function removeExpense(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!groupId || !id) return;

  const { data, error } = await getSupabase()
    .from("wk_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("note, amount")
    .maybeSingle();

  if (error) throw new Error(`削除に失敗しました: ${error.message}`);

  const label = (data as { note: string | null; amount: number } | null);
  const name = label?.note || `${label?.amount?.toLocaleString() ?? ""}円`;

  revalidatePath(`/g/${groupId}`);
  redirect(`/g/${groupId}?undo=${id}&name=${encodeURIComponent(name)}`);
}

/** 削除の取り消し */
export async function restoreExpense(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!groupId || !id) return;

  const { error } = await getSupabase()
    .from("wk_expenses")
    .update({ deleted_at: null })
    .eq("id", id);

  if (error) throw new Error(`元に戻せませんでした: ${error.message}`);

  revalidatePath(`/g/${groupId}`);
  redirect(`/g/${groupId}`);
}

/** メンバーを追加する */
export async function addMember(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!groupId) return;
  if (!name) redirect(`/g/${groupId}/members?error=name`);

  const supabase = getSupabase();
  const { data } = await supabase
    .from("wk_members")
    .select("id, name, sort_order")
    .eq("group_id", groupId);

  const rows = (data ?? []) as { id: string; name: string; sort_order: number }[];
  if (rows.length >= MAX_MEMBERS) redirect(`/g/${groupId}/members?error=max`);
  if (rows.some((m) => m.name === name)) redirect(`/g/${groupId}/members?error=duplicate`);

  const nextOrder = rows.reduce((max, m) => Math.max(max, m.sort_order), -1) + 1;
  const { error } = await supabase
    .from("wk_members")
    .insert({ group_id: groupId, name, sort_order: nextOrder });

  if (error) throw new Error(`メンバーの追加に失敗しました: ${error.message}`);

  revalidatePath(`/g/${groupId}`);
  redirect(`/g/${groupId}/members?saved=1`);
}

/** メンバーの名前を変更する */
export async function renameMembers(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  if (!groupId) return;

  const supabase = getSupabase();
  const { data } = await supabase.from("wk_members").select("id, name").eq("group_id", groupId);
  const rows = (data ?? []) as { id: string; name: string }[];

  const updates = rows
    .map((m) => ({ id: m.id, name: String(formData.get(`name_${m.id}`) ?? "").trim() }))
    .filter((u) => u.name.length > 0 && u.name !== rows.find((m) => m.id === u.id)?.name);

  const names = rows.map((m) => updates.find((u) => u.id === m.id)?.name ?? m.name);
  if (new Set(names).size !== names.length) redirect(`/g/${groupId}/members?error=duplicate`);

  for (const u of updates) {
    const { error } = await supabase.from("wk_members").update({ name: u.name }).eq("id", u.id);
    if (error) throw new Error(`名前の変更に失敗しました: ${error.message}`);
  }

  revalidatePath(`/g/${groupId}`);
  redirect(`/g/${groupId}/members?saved=1`);
}

/** メンバーを削除する（立替に関わっていない人だけ） */
export async function removeMember(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!groupId || !id) return;

  const supabase = getSupabase();
  const { data: members } = await supabase.from("wk_members").select("id").eq("group_id", groupId);
  if (((members ?? []) as { id: string }[]).length <= 2) {
    redirect(`/g/${groupId}/members?error=min`);
  }

  const { data: used } = await supabase
    .from("wk_expenses")
    .select("id")
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .eq("payer_id", id)
    .limit(1);

  if (((used ?? []) as { id: string }[]).length > 0) {
    redirect(`/g/${groupId}/members?error=used`);
  }

  const { error } = await supabase.from("wk_members").delete().eq("id", id);
  if (error) throw new Error(`メンバーの削除に失敗しました: ${error.message}`);

  revalidatePath(`/g/${groupId}`);
  redirect(`/g/${groupId}/members?saved=1`);
}

/** 送金が済んだ／やり直しを記録する */
export async function togglePaid(formData: FormData) {
  const groupId = String(formData.get("group_id") ?? "");
  const fromId = String(formData.get("from_id") ?? "");
  const toId = String(formData.get("to_id") ?? "");
  const amount = Number(formData.get("amount"));
  const paid = String(formData.get("paid") ?? "") === "1";

  if (!groupId || !fromId || !toId || !Number.isInteger(amount)) return;

  const supabase = getSupabase();

  if (paid) {
    await supabase
      .from("wk_settlement_paid")
      .delete()
      .eq("group_id", groupId)
      .eq("from_id", fromId)
      .eq("to_id", toId)
      .eq("amount", amount);
  } else {
    await supabase
      .from("wk_settlement_paid")
      .insert({ group_id: groupId, from_id: fromId, to_id: toId, amount });
  }

  revalidatePath(`/g/${groupId}`);
}
