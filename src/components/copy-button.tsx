"use client";

// 共有URLや精算結果を、ワンタップでコピーするボタン。
// コピーできたことが分かるよう、少しの間だけ表示を変える。

import { useState } from "react";

export function CopyButton({
  text,
  label,
  copiedLabel = "コピーしました",
  className,
}: {
  text: string;
  label: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では何もしない（手動選択でコピーしてもらう）
    }
  }

  return (
    <button type="button" onClick={handleCopy} className={className}>
      {copied ? `✅ ${copiedLabel}` : label}
    </button>
  );
}
