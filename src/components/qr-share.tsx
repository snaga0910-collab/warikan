"use client";

// QRコードは普段は畳んでおき、必要なときだけ開く。
// 出先のスマホで、無駄なスクロールを増やさないため。

import { useState } from "react";

export function QrShare({ dataUrl }: { dataUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-12 w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {open ? "QRコードを閉じる" : "📱 QRコードを表示"}
      </button>

      {open && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt="このグループのQRコード"
            width={180}
            height={180}
            className="rounded-lg border border-slate-200 dark:border-slate-700"
          />
          <p className="text-center text-xs text-slate-400">
            その場にいる人は、読み取ってもらうのが早いです
          </p>
        </>
      )}
    </div>
  );
}
