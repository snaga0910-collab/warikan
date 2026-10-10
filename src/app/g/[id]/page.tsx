import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSupabase, type Group, type MemberRow, type ExpenseRow } from "@/lib/supabase";
import { computeBalances, settle, formatTransfers } from "@/lib/settle";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { addExpense, removeExpense } from "../../actions";

export const dynamic = "force-dynamic";

const yen = (n: number) => `${n.toLocaleString()}円`;

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; last?: string }>;
}) {
  const { id } = await params;
  const { error, last } = await searchParams;

  const supabase = getSupabase();

  const { data: groupData } = await supabase
    .from("wk_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!groupData) notFound();
  const group = groupData as Group;

  const [{ data: memberData }, { data: expenseData }] = await Promise.all([
    supabase.from("wk_members").select("*").eq("group_id", id).order("sort_order"),
    supabase
      .from("wk_expenses")
      .select("*")
      .eq("group_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const members = (memberData ?? []) as MemberRow[];
  const expenses = (expenseData ?? []) as ExpenseRow[];
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const balances = computeBalances(
    members.map((m) => ({ id: m.id, name: m.name })),
    expenses.map((e) => ({ payerId: e.payer_id, amount: e.amount })),
  );
  const transfers = settle(balances);

  // 共有用のURLを組み立てる
  const host = (await headers()).get("host") ?? "";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const shareUrl = `${protocol}://${host}/g/${id}`;

  const errorMessage =
    error === "amount"
      ? "金額は1円以上の数字で入力してください"
      : error === "payer"
        ? "立て替えた人を選んでください"
        : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 py-8">
      <header>
        <Link href="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          ← 新しく作る
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
          💸 {group.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {members.map((m) => m.name).join(" ・ ")}（{members.length}人）
        </p>
      </header>

      {errorMessage && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {errorMessage}
        </p>
      )}

      {/* 立替の追加 */}
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
              // 直前に選んだ人を選択済みにして、同じ人の立替を続けて入れやすくする
              defaultValue={last && members.some((m) => m.id === last) ? last : ""}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600 dark:text-slate-300">何に使った？（任意）</span>
            <input
              type="text"
              name="note"
              maxLength={40}
              placeholder="例：ホテル、ガソリン代"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <SubmitButton
            pendingLabel="追加中…"
            className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
          >
            追加する
          </SubmitButton>
        </form>
      </section>

      {/* 立替の一覧 */}
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
            {expenses.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="min-w-0">
                  <p className="truncate text-slate-800 dark:text-slate-200">
                    <span className="font-medium">{nameById.get(e.payer_id) ?? "？"}</span>
                    {e.note ? ` ・ ${e.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {yen(e.amount)}
                  </span>
                  <form action={removeExpense}>
                    <input type="hidden" name="group_id" value={id} />
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton
                      pendingLabel="…"
                      aria-label="この立替を削除"
                      className="rounded-lg px-2 py-1 text-slate-300 transition hover:text-rose-600 active:scale-95"
                    >
                      🗑
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 合計と各自の過不足 */}
      {expenses.length > 0 && (
        <>
          <section className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-indigo-100">立替の合計</p>
                <p className="text-2xl font-bold">{yen(total)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-indigo-100">1人あたり</p>
                <p className="text-2xl font-bold">
                  {yen(Math.floor(total / Math.max(members.length, 1)))}
                  {total % members.length !== 0 && (
                    <span className="ml-1 align-middle text-xs font-normal">前後</span>
                  )}
                </p>
              </div>
            </div>
            <ul className="mt-4 flex flex-col gap-1 border-t border-white/30 pt-3 text-sm">
              {balances.map((b) => (
                <li key={b.memberId} className="flex justify-between">
                  <span>{b.name}</span>
                  <span>
                    立替 {yen(b.paid)} ／{" "}
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
            {total % members.length !== 0 && (
              <p className="mt-2 text-xs text-indigo-100">
                ※割り切れない端数は、先頭のメンバーから1円ずつ負担しています
              </p>
            )}
          </section>

          {/* 精算方法（このアプリの主役） */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              💸 精算方法（{transfers.length}回で完了）
            </h2>
            {transfers.length === 0 ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                🎉 精算の必要はありません（全員ちょうどです）
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {transfers.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30"
                  >
                    <span className="min-w-0 truncate font-medium text-slate-900 dark:text-slate-100">
                      {t.fromName} <span className="mx-1 text-indigo-500">→</span> {t.toName}
                    </span>
                    <span className="shrink-0 text-lg font-bold text-indigo-700 dark:text-indigo-300">
                      {yen(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* 共有 */}
      <section className="flex flex-col gap-2">
        <CopyButton
          text={shareUrl}
          label="🔗 共有URLをコピー"
          copiedLabel="URLをコピーしました"
          className="rounded-xl border border-indigo-600 px-5 py-3 font-medium text-indigo-700 transition hover:bg-indigo-50 active:scale-95 dark:text-indigo-300 dark:hover:bg-slate-800"
        />
        {transfers.length > 0 && (
          <CopyButton
            text={formatTransfers(group.name, total, transfers)}
            label="📋 精算結果を文章でコピー"
            copiedLabel="結果をコピーしました"
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          />
        )}
        <p className="text-center text-xs text-slate-400">
          このURLを送れば、メンバー全員が同じ結果を見られます
        </p>
      </section>
    </main>
  );
}
