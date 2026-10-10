// わりかん精算の計算（このアプリの心臓部）。
// 画面から切り離した純粋な関数にして、テストで正しさを担保する。
//
// 方針：金額はすべて整数（円）で扱い、小数を一切使わない。
// 1円でもズレると信用されないため、合計が必ず一致することをテストで確認する。

export type Member = {
  id: string;
  name: string;
};

export type Expense = {
  payerId: string;
  amount: number; // 円（整数・正の数）
  /** この支払いを分担する人。未指定・空なら「全員」とみなす */
  participantIds?: string[] | null;
};

export type Balance = {
  memberId: string;
  name: string;
  paid: number; // 立て替えた合計
  share: number; // 負担すべき金額
  diff: number; // paid - share（プラス＝受け取る／マイナス＝払う）
};

export type Transfer = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

/**
 * 1件の金額を人数で分けたときの、1人あたりの負担額を求める。
 * 割り切れない端数は、先頭の人から1円ずつ上乗せする。
 * 返り値の合計は必ず total と一致する。
 */
export function computeShares(total: number, memberCount: number): number[] {
  if (memberCount <= 0) return [];

  const base = Math.floor(total / memberCount);
  const remainder = total - base * memberCount;

  return Array.from({ length: memberCount }, (_, i) =>
    i < remainder ? base + 1 : base,
  );
}

/**
 * 各メンバーの「立て替えた額 − 負担額」を求める。
 *
 * 負担額は支払いごとに計算する。参加者が指定されていればその人たちで分け、
 * 指定が無ければ全員で分ける（例：「この夕食はカスミ不参加」に対応するため）。
 */
export function computeBalances(members: Member[], expenses: Expense[]): Balance[] {
  const order = new Map(members.map((m, i) => [m.id, i]));
  const paidBy = new Map<string, number>();
  const shareOf = new Map<string, number>();

  for (const member of members) {
    paidBy.set(member.id, 0);
    shareOf.set(member.id, 0);
  }

  for (const expense of expenses) {
    if (paidBy.has(expense.payerId)) {
      paidBy.set(expense.payerId, (paidBy.get(expense.payerId) ?? 0) + expense.amount);
    }

    // 参加者は、実在するメンバーだけに絞り、メンバーの並び順にそろえる
    const specified = (expense.participantIds ?? []).filter((id) => order.has(id));
    const targets = (specified.length > 0 ? specified : members.map((m) => m.id)).sort(
      (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
    );

    const shares = computeShares(expense.amount, targets.length);
    targets.forEach((id, i) => {
      shareOf.set(id, (shareOf.get(id) ?? 0) + (shares[i] ?? 0));
    });
  }

  return members.map((member) => {
    const paid = paidBy.get(member.id) ?? 0;
    const share = shareOf.get(member.id) ?? 0;
    return { memberId: member.id, name: member.name, paid, share, diff: paid - share };
  });
}

/**
 * 「誰が誰にいくら払うか」を、送金回数が最も少なくなる形で求める。
 *
 * 最も多く払う人と、最も多く受け取る人を順に突き合わせて相殺していく（貪欲法）。
 * 1回の相殺で必ず誰か1人の過不足が0になるため、送金回数は「人数−1回」以下に収まる。
 */
export function settle(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.diff < 0)
    .map((b) => ({ ...b, remaining: -b.diff }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = balances
    .filter((b) => b.diff > 0)
    .map((b) => ({ ...b, remaining: b.diff }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: Transfer[] = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di];
    const creditor = creditors[ci];
    const amount = Math.min(debtor.remaining, creditor.remaining);

    if (amount > 0) {
      transfers.push({
        fromId: debtor.memberId,
        fromName: debtor.name,
        toId: creditor.memberId,
        toName: creditor.name,
        amount,
      });
      debtor.remaining -= amount;
      creditor.remaining -= amount;
    }

    if (debtor.remaining === 0) di++;
    if (creditor.remaining === 0) ci++;
  }

  return transfers;
}

/** 送金1件を見分けるための文字列（送金済みチェックの保存・照合に使う） */
export function transferKey(t: Pick<Transfer, "fromId" | "toId" | "amount">): string {
  return `${t.fromId}:${t.toId}:${t.amount}`;
}

/** 精算結果を、LINEなどにそのまま貼れる文章にする */
export function formatTransfers(
  groupName: string,
  total: number,
  transfers: Transfer[],
): string {
  const lines = [
    `【${groupName}】のわりかん精算`,
    `立替の合計 ${total.toLocaleString()}円`,
    "",
  ];

  if (transfers.length === 0) {
    lines.push("精算の必要はありません（全員ちょうどです）");
  } else {
    for (const t of transfers) {
      lines.push(`${t.fromName} → ${t.toName}  ${t.amount.toLocaleString()}円`);
    }
    lines.push("", `これで精算完了です（${transfers.length}回）`);
  }

  return lines.join("\n");
}
