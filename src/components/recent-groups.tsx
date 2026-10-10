"use client";

// トップ画面に「最近ひらいたグループ」を出す部品。
// URLを無くしても、同じ端末からなら戻れるようにするためのもの。

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { RECENT_KEY, type RecentGroup } from "./remember-group";

const EMPTY: RecentGroup[] = [];

// 読み取るたびに新しい配列を返すと再描画が止まらなくなるため、
// 保存されている文字列が変わったときだけ作り直して使い回す。
let cachedRaw: string | null = null;
let cachedValue: RecentGroup[] = EMPTY;

function getSnapshot(): RecentGroup[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RECENT_KEY);
  } catch {
    return EMPTY;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedValue = raw ? (JSON.parse(raw) as RecentGroup[]) : EMPTY;
    } catch {
      cachedValue = EMPTY;
    }
  }
  return cachedValue;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function RecentGroups() {
  // サーバー側では何も無い状態で描画し、ブラウザで読み込む
  const groups = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  if (groups.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
        最近ひらいたグループ
      </h2>
      <ul className="flex flex-col gap-2">
        {groups.map((g) => (
          <li key={g.id}>
            <Link
              href={`/g/${g.id}`}
              className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="min-w-0 truncate">💸 {g.name}</span>
              <span className="shrink-0 text-slate-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">
        この端末にだけ残しています（サーバーには保存していません）
      </p>
    </section>
  );
}
