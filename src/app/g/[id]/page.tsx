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
  const paidKeys = new Set(paidRows.map((p) => transferKey({ fromId: p.from_id, toId: p.to_id, amount: p.amount })));
  const remaining = transfers.filter((t) => !paidKeys.has(transferKey(t))).length;

  const host = (await headers()).get("host") ?? "";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const shareUrl = `${protocol}://${host}/g/${id}`;
  const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 320, margin: 1 });

  const errorMessage =
    error === "amount"
      ? "金額は1円以上の数字で入力してください"
      : error === "payer"
        ? "立て替えた人を選んでください"
        : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 py-8">
      <RememberGroup id={id} name={group.name} />

      <header>
        <Link href="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          ← 新しく作る
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
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

      {/* ① 精算方法（このアプリの主役。最初に見せる） */}
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
                        {t.fromName} <span className="mx-1 text-indigo-500">→</span> {t.toName}
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

      {/* ② 合計と各自の過不足 */}
      {expenses.length > 0 && (
        <section className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-100">立替の合計</p>
              <p className="text-2xl font-bold">{yen(total)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-indigo-100">立替の件数</p>
              <p className="text-2xl font-bold">{expenses.length}件</p>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-1 border-t border-white/30 pt-3 text-sm">
            {balances.map((b) => (
              <li key={b.memberId} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{b.name}</span>
                <span className="shrink-0 text-right">
                  立替 {yen(b.paid)} ／ 負担 {yen(b.share)} ／{" "}
                  <strong>
                    {b.diff === 0
                      ? "ちょうど"
                      : b.diff > 0
                        ? `+${yen(b.diff)} 受取`
                        : `${yen(-b.diff)} 支払`}
                  </strong>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-indigo-100">
            ※割り切れない端数は1円単位で配分し、合計が必ず一致するようにしています
          </p>
        </section>
      )}

      {/* ③ 立替を追加 */}
      <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
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
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600 dark:text-slate-300">何に使った？（任意）</span>
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

      {/* ④ 立替の一覧 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          立替の一覧（{expenses.length}件）
        </h2>
        {expenses.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400 dark:bg-slate-900">
            まだ立替がありません。上から追加してください
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.map((e) => {
              const partial =
                e.participant_ids && e.participant_ids.length > 0
                  ? e.participant_ids.map((pid) => nameById.get(pid) ?? "？").join("・")
                  : null;
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0">
                    <p className="truncate text-slate-800 dark:text-slate-200">
                      <span className="font-medium">{nameById.get(e.payer_id) ?? "？"}</span>
                      {e.note ? ` ・ ${e.note}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {yen(e.amount)}
                      {partial ? ` ・ ${partial} で分担` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/g/${id}/e/${e.id}`}
                      aria-label="この立替を編集"
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                    >
                      ✏️
                    </Link>
                    <form action={removeExpense}>
                      <input type="hidden" name="group_id" value={id} />
                      <input type="hidden" name="id" value={e.id} />
                      <SubmitButton
                        pendingLabel="…"
                        aria-label="この立替を削除"
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
        )}
      </section>

      {/* ⑤ 共有 */}
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="self-start font-semibold text-slate-900 dark:text-slate-100">
          メンバーに共有
        </h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="このグループのQRコード"
          width={160}
          height={160}
          className="rounded-lg border border-slate-200 dark:border-slate-700"
        />
        <p className="text-center text-xs text-slate-400">
          その場にいる人は、QRコードを読み取るのが早いです
        </p>
        <div className="flex w-full flex-col gap-2">
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
        </div>
      </section>
    </main>
  );
}
