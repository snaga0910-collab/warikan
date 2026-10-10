import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import {
  getSupabase,
  type Group,
  type MemberRow,
  type ExpenseRow,
  type PaidRow,
} from "@/lib/supabase";
import { computeBalances, settle, formatTransfers, transferKey } from "@/lib/settle";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { QrShare } from "@/components/qr-share";
import { RememberGroup } from "@/components/remember-group";
import { addExpense, removeExpense, restoreExpense, togglePaid } from "../../actions";

export const dynamic = "force-dynamic";

const yen = (n: number) => `${n.toLocaleString()}円`;

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    last?: string;
    undo?: string;
    name?: string;
    saved?: string;
  }>;
}) {
  const { id } = await params;
  const { error, last, undo, name: undoName, saved } = await searchParams;

  const supabase = getSupabase();

  const { data: groupData } = await supabase
    .from("wk_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!groupData) notFound();
  const group = groupData as Group;

  const [{ data: memberData }, { data: expenseData }, { data: paidData }] = await Promise.all([
    supabase.from("wk_members").select("*").eq("group_id", id).order("sort_order"),
    supabase
      .from("wk_expenses")
      .select("*")
      .eq("group_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase.from("wk_settlement_paid").select("*").eq("group_id", id),
  ]);

  const members = (memberData ?? []) as MemberRow[];
  const expenses = (expenseData ?? []) as ExpenseRow[];
  const paidRows = (paidData ?? []) as PaidRow[];
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const balances = computeBalances(
    members.map((m) => ({ id: m.id, name: m.name })),
    expenses.map((e) => ({
      payerId: e.payer_id,
      amount: e.amount,
      participantIds: e.participant_ids,
    })),
  );
  const transfers = settle(balances);
  const paidKeys = new Set(
    paidRows.map((p) => transferKey({ fromId: p.from_id, toId: p.to_id, amount: p.amount })),
  );
  const remaining = transfers.filter((t) => !paidKeys.has(transferKey(t))).length;

  // 立替の一覧を「立て替えた人ごと」にまとめる
  const grouped = members
    .map((m) => ({
      member: m,
      items: expenses.filter((e) => e.payer_id === m.id),
      subtotal: expenses.filter((e) => e.payer_id === m.id).reduce((s, e) => s + e.amount, 0),
    }))
    .filter((g) => g.items.length > 0);

  const host = (await headers()).get("host") ?? "";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const shareUrl = `${protocol}://${host}/g/${id}`;
  const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 360, margin: 1 });

  const errorMessage =
    error === "amount"
      ? "金額は1円以上の数字で入力してください"
      : error === "payer"
        ? "立て替えた人を選んでください"
        : null;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8 pb-24 lg:max-w-5xl lg:pb-8">
      <RememberGroup id={id} name={group.name} />

      <header className="mb-5">
        <Link href="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          ← 新しく作る
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900 lg:text-2xl dark:text-slate-100">
          💸 {group.name}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500 dark:text-slate-400">
          <span>
            {members.map((m) => m.name).join(" ・ ")}（{members.length}人）
          </span>
          <Link
            href={`/g/${id}/members`}
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            メンバーを編集
          </Link>
        </p>
      </header>

      {(errorMessage || saved || undo) && (
        <div className="mb-5 flex flex-col gap-2">
          {errorMessage && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {errorMessage}
            </p>
          )}
          {saved && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              ✅ 変更を保存しました
            </p>
          )}
          {undo && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-800 px-4 py-3 text-sm text-white">
              <span className="min-w-0 truncate">🗑 「{undoName}」を削除しました</span>
              <form action={restoreExpense}>
                <input type="hidden" name="group_id" value={id} />
                <input type="hidden" name="id" value={undo} />
                <SubmitButton
                  pendingLabel="戻しています…"
                  className="shrink-0 rounded-lg bg-white px-3 py-2 font-medium text-slate-900 transition hover:bg-slate-100 active:scale-95"
                >
                  元に戻す
                </SubmitButton>
              </form>
            </div>
          )}
        </div>
      )}

      {/* PCでは2カラム（左：結果／右：入力と一覧）、スマホは1列 */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-5">
          {/* ① 精算方法（主役） */}
          {expenses.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                💸 精算方法（
                {transfers.length === 0
                  ? "精算不要"
                  : remaining === 0
                    ? "すべて完了 🎉"
                    : `${transfers.length}回・残り${remaining}回`}
                ）
              </h2>
              {transfers.length === 0 ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  🎉 精算の必要はありません（全員ちょうどです）
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {transfers.map((t) => {
                    const done = paidKeys.has(transferKey(t));
                    return (
                      <li
                        key={transferKey(t)}
                        className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 ${
                          done
                            ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                            : "border-indigo-200 bg-indigo-50 dark:border-indigo-900/60 dark:bg-indigo-950/30"
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className={`truncate font-medium ${
                              done
                                ? "text-slate-400 line-through"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {t.fromName} <span className="mx-1 text-indigo-500">→</span>{" "}
                            {t.toName}
                          </p>
                          <p
                            className={`text-lg font-bold ${
                              done ? "text-slate-400" : "text-indigo-700 dark:text-indigo-300"
                            }`}
                          >
                            {yen(t.amount)}
                          </p>
                        </div>
                        <form action={togglePaid} className="shrink-0">
                          <input type="hidden" name="group_id" value={id} />
                          <input type="hidden" name="from_id" value={t.fromId} />
                          <input type="hidden" name="to_id" value={t.toId} />
                          <input type="hidden" name="amount" value={t.amount} />
                          <input type="hidden" name="paid" value={done ? "1" : "0"} />
                          <SubmitButton
                            pendingLabel="…"
                            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-medium transition active:scale-95 ${
                              done
                                ? "border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                            }`}
                          >
                            {done ? "戻す" : "済んだ"}
                          </SubmitButton>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* ② 合計 */}
          {expenses.length > 0 && (
            <>
              <section className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 p-4 text-white">
                <div>
                  <p className="text-xs text-indigo-100">立替の合計</p>
                  <p className="text-2xl font-bold">{yen(total)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-indigo-100">立替の件数</p>
                  <p className="text-2xl font-bold">{expenses.length}件</p>
                </div>
              </section>

              {/* ③ 各自の過不足（名前が消えないよう2行に分ける） */}
              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  各自の過不足
                </h2>
                <ul className="flex flex-col gap-2">
                  {balances.map((b) => (
                    <li
                      key={b.memberId}
                      className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate font-medium text-slate-900 dark:text-slate-100">
                          {b.name}
                        </span>
                        <span
                          className={`shrink-0 font-bold ${
                            b.diff === 0
                              ? "text-slate-400"
                              : b.diff > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {b.diff === 0
                            ? "ちょうど"
                            : b.diff > 0
                              ? `+${yen(b.diff)} 受取`
                              : `${yen(-b.diff)} 支払`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        立替 {yen(b.paid)} ／ 負担 {yen(b.share)}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">
                  ※割り切れない端数は1円単位で配分し、合計が必ず一致するようにしています
                </p>
              </section>
            </>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {/* ④ 立替を追加 */}
          <section
            id="add"
            className="scroll-mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
          >
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">立替を追加</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              <strong>合計せずに1件ずつ</strong>追加してください（例：ガソリン 4,850円）。
              同じ人の分は自動で合算されます
            </p>
            <form action={addExpense} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="group_id" value={id} />

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-300">立て替えた人</span>
                <select
                  name="payer_id"
                  required
                  defaultValue={last && members.some((m) => m.id === last) ? last : ""}
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="" disabled>
                    選んでください
                  </option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-300">金額（円）</span>
                <input
                  type="number"
                  name="amount"
                  required
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="10000"
                  className="no-spinner min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  何に使った？（任意）
                </span>
                <input
                  type="text"
                  name="note"
                  maxLength={40}
                  placeholder="例：ホテル、ガソリン代"
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <fieldset>
                <legend className="text-sm text-slate-600 dark:text-slate-300">
                  誰で分ける？（初期は全員）
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {members.map((m) => (
                    <label
                      key={m.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                    >
                      <input
                        type="checkbox"
                        name="participant"
                        value={m.id}
                        defaultChecked
                        className="h-5 w-5 accent-indigo-600"
                      />
                      <span className="text-slate-700 dark:text-slate-300">{m.name}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  「この夕食はカスミ不参加」のときは、その人のチェックを外します
                </p>
              </fieldset>

              <SubmitButton
                pendingLabel="追加中…"
                className="min-h-12 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
              >
                追加する
              </SubmitButton>
            </form>
          </section>

          {/* ⑤ 立替の一覧（人ごとにまとめる） */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              立替の一覧（{expenses.length}件）
            </h2>
            {expenses.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400 dark:bg-slate-900">
                まだ立替がありません。上から追加してください
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {grouped.map(({ member, items, subtotal }) => (
                  <div key={member.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
                      <span className="min-w-0 truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                        {member.name}
                      </span>
                      <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
                        小計 {yen(subtotal)}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {items.map((e) => {
                        const partial =
                          e.participant_ids && e.participant_ids.length > 0
                            ? e.participant_ids.map((pid) => nameById.get(pid) ?? "？").join("・")
                            : null;
                        return (
                          <li
                            key={e.id}
                            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-slate-800 dark:text-slate-200">
                                {e.note || "（用途なし）"}
                              </p>
                              {partial && (
                                <p className="truncate text-xs text-slate-400">
                                  {partial} で分担
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 font-bold text-slate-900 dark:text-slate-100">
                              {yen(e.amount)}
                            </span>
                            <div className="flex shrink-0 items-center">
                              <Link
                                href={`/g/${id}/e/${e.id}`}
                                aria-label={`${e.note || "この立替"}を編集`}
                                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                              >
                                ✏️
                              </Link>
                              <form action={removeExpense}>
                                <input type="hidden" name="group_id" value={id} />
                                <input type="hidden" name="id" value={e.id} />
                                <SubmitButton
                                  pendingLabel="…"
                                  aria-label={`${e.note || "この立替"}を削除`}
                                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 active:scale-95 dark:hover:bg-slate-800"
                                >
                                  🗑
                                </SubmitButton>
                              </form>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ⑥ 共有 */}
          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">メンバーに共有</h2>
            <CopyButton
              text={shareUrl}
              label="🔗 共有URLをコピー"
              copiedLabel="URLをコピーしました"
              className="min-h-12 rounded-xl border border-indigo-600 px-5 py-3 font-medium text-indigo-700 transition hover:bg-indigo-50 active:scale-95 dark:text-indigo-300 dark:hover:bg-slate-800"
            />
            {transfers.length > 0 && (
              <CopyButton
                text={formatTransfers(group.name, total, transfers)}
                label="📋 精算結果を文章でコピー"
                copiedLabel="結果をコピーしました"
                className="min-h-12 rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              />
            )}
            <QrShare dataUrl={qrDataUrl} />
          </section>
        </div>
      </div>

      {/* スマホ用：どこまでスクロールしても追加に戻れるボタン */}
      <a
        href="#add"
        className="fixed bottom-5 right-5 flex min-h-14 items-center gap-1 rounded-full bg-indigo-600 px-5 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-700 active:scale-95 lg:hidden"
      >
        ＋ 立替を追加
      </a>
    </main>
  );
}
