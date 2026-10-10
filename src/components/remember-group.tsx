"use client";

// 開いたグループを、この端末だけに控えておく部品。
// URLを無くすと二度とアクセスできなくなるため、トップ画面から戻れるようにする。
// 保存先はブラウザの中だけで、サーバーには送らない。

import { useEffect } from "react";

export type RecentGroup = {
  id: string;
  name: string;
  openedAt: number;
};

export const RECENT_KEY = "warikan_recent_groups";
const MAX_RECENT = 10;

export function RememberGroup({ id, name }: { id: string; name: string }) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const list: RecentGroup[] = raw ? JSON.parse(raw) : [];
      const next = [
        { id, name, openedAt: Date.now() },
        ...list.filter((g) => g.id !== id),
      ].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // 保存できない設定でも、アプリの利用には支障がないので何もしない
    }
  }, [id, name]);

  return null;
}
