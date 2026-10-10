import { SubmitButton } from "@/components/submit-button";
import { RecentGroups } from "@/components/recent-groups";
import { createGroup } from "./actions";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const errorMessage =
    error === "name"
      ? "旅行名・イベント名を入力してください"
      : error === "members"
        ? "メンバーは2人以上入力してください"
        : error === "duplicate"
          ? "同じ名前のメンバーがいます。区別できる名前にしてください"
          : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8">
      <header className="text-center">
        <p className="text-4xl">💸</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
          わりかん精算
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          立て替えた金額を入れるだけ。
          <br />
          <strong className="text-slate-700 dark:text-slate-200">
            誰が誰にいくら払えばいいか
          </strong>
          を、最小回数で出します
        </p>
      </header>

      {errorMessage && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {errorMessage}
        </p>
      )}

      <form action={createGroup} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            旅行名・イベント名
          </span>
          <input
            type="text"
            name="name"
            required
            maxLength={40}
            placeholder="例：沖縄旅行、忘年会"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            メンバー（2〜10人）
          </legend>
          {Array.from({ length: 6 }, (_, i) => (
            <input
              key={i}
              type="text"
              name="member"
              maxLength={20}
              required={i < 2}
              aria-label={`メンバー${i + 1}`}
              placeholder={
                i < 2 ? `メンバー${i + 1}（必須）` : `メンバー${i + 1}（任意）`
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          ))}
          <p className="text-xs text-slate-400">
            使わない欄は空のままで大丈夫です
          </p>
        </fieldset>

        <SubmitButton
          pendingLabel="作成中…"
          className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
        >
          作成する
        </SubmitButton>
      </form>

      <RecentGroups />

      <section className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        <p className="font-medium">こんな時に使えます</p>
        <p className="mt-2 leading-relaxed">
          4人の旅行で、A・B・C・Dがバラバラに立替。
          1件ずつ割り勘して個別に渡すと<strong>最大21回</strong>の受け渡しになりますが、
          まとめて計算すれば<strong>3回で完了</strong>します。
        </p>
      </section>
    </main>
  );
}
