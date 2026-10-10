import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase, type MemberRow, type ExpenseRow } from "@/lib/supabase";
import { SubmitButton } from "@/components/submit-button";
import { updateExpense } from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; expenseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, expenseId } = await params;
  const { error } = await searchParams;

  const supabase = getSupabase();
  const [{ data: expenseData }, { data: memberData }] = await Promise.all([
    supabase
      .from("wk_expenses")
      .select("*")
      .eq("id", expenseId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("wk_members").select("*").eq("group_id", id).order("sort_order"),
  ]);

  if (!expenseData) notFound();
  const expense = expenseData as ExpenseRow;
  const members = (memberData ?? []) as MemberRow[];

  // 指定が無い場合は「全員が対象」なので、全員にチェックを入れた状態にする
  const checked = new Set(
    expense.participant_ids && expense.participant_ids.length > 0
      ? expense.participant_ids
      : members.map((m) => m.id),
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 py-8">
      <header>
        <Link
          href={`/g/${id}`}
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← もどる
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">立替を編集</h1>
      </header>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error === "payer"
            ? "立て替えた人を選んでください"
            : "金額は1円以上の数字で入力してください"}
        </p>
      )}

      <form action={updateExpense} className="flex flex-col gap-3">
        <input type="hidden" name="group_id" value={id} />
        <input type="hidden" name="id" value={expense.id} />

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-300">立て替えた人</span>
          <select
            name="payer_id"
            required
            defaultValue={expense.payer_id}
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
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
            defaultValue={expense.amount}
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-300">何に使った？（任意）</span>
          <input
            type="text"
            name="note"
            maxLength={40}
            defaultValue={expense.note ?? ""}
            placeholder="例：ホテル、ガソリン代"
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <fieldset>
          <legend className="text-sm text-slate-600 dark:text-slate-300">誰で分ける？</legend>
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
                  defaultChecked={checked.has(m.id)}
                  className="h-5 w-5 accent-indigo-600"
                />
                <span className="text-slate-700 dark:text-slate-300">{m.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <SubmitButton
          pendingLabel="保存中…"
          className="min-h-12 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
        >
          保存する
        </SubmitButton>
      </form>
    </main>
  );
}
