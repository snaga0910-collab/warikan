import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase, type Group, type MemberRow } from "@/lib/supabase";
import { SubmitButton } from "@/components/submit-button";
import { addMember, renameMembers, removeMember } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;

  const supabase = getSupabase();
  const [{ data: groupData }, { data: memberData }] = await Promise.all([
    supabase.from("wk_groups").select("*").eq("id", id).maybeSingle(),
    supabase.from("wk_members").select("*").eq("group_id", id).order("sort_order"),
  ]);

  if (!groupData) notFound();
  const group = groupData as Group;
  const members = (memberData ?? []) as MemberRow[];

  const errorMessage =
    error === "name"
      ? "名前を入力してください"
      : error === "duplicate"
        ? "同じ名前のメンバーがいます"
        : error === "max"
          ? "メンバーは10人までです"
          : error === "min"
            ? "メンバーは2人以上必要です"
            : error === "used"
              ? "この人は立替に関わっているため削除できません（先に立替を消してください）"
              : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 py-8">
      <header>
        <Link
          href={`/g/${id}`}
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← もどる
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
          メンバーを編集
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{group.name}</p>
      </header>

      {errorMessage && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {errorMessage}
        </p>
      )}
      {saved && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          ✅ 保存しました
        </p>
      )}

      {/* 名前の変更 */}
      <form action={renameMembers} className="flex flex-col gap-3">
        <input type="hidden" name="group_id" value={id} />
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">名前を直す</h2>
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <input
              type="text"
              name={`name_${m.id}`}
              defaultValue={m.name}
              maxLength={20}
              aria-label={`${m.name}の名前`}
              className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        ))}
        <SubmitButton
          pendingLabel="保存中…"
          className="min-h-12 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
        >
          名前を保存する
        </SubmitButton>
      </form>

      {/* 追加 */}
      <form
        action={addMember}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <input type="hidden" name="group_id" value={id} />
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">メンバーを追加</h2>
        <input
          type="text"
          name="name"
          required
          maxLength={20}
          placeholder="例：オーキド"
          aria-label="追加するメンバーの名前"
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <SubmitButton
          pendingLabel="追加中…"
          className="min-h-12 rounded-xl border border-indigo-600 px-5 py-3 font-medium text-indigo-700 transition hover:bg-indigo-50 active:scale-95 dark:text-indigo-300 dark:hover:bg-slate-800"
        >
          追加する
        </SubmitButton>
        <p className="text-xs text-slate-400">
          あとから増えた人も追加できます。これまでの立替の分担には含まれません
        </p>
      </form>

      {/* 削除 */}
      <section>
        <h2 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">メンバーを外す</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="min-w-0 truncate text-slate-800 dark:text-slate-200">{m.name}</span>
              <form action={removeMember}>
                <input type="hidden" name="group_id" value={id} />
                <input type="hidden" name="id" value={m.id} />
                <SubmitButton
                  pendingLabel="…"
                  aria-label={`${m.name}を外す`}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 active:scale-95 dark:hover:bg-slate-800"
                >
                  🗑
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          立替に関わっている人は外せません（先にその立替を削除してください）
        </p>
      </section>
    </main>
  );
}
