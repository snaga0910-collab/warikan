"use client";

// 送信中はボタンを無効化して、連打による二重登録を防ぐ。
// あわせて「送信中」の表示を出し、押した手応えを作る。
// （1個目「そろそろリマインダー」で作った部品をそのまま流用）

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...rest
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-50`}
      {...rest}
    >
      {pending ? (pendingLabel ?? "…") : children}
    </button>
  );
}
