// 計算の正しさを確かめるテスト。
// 金額がズレると信用を失うため、心臓部だけはテストで守る。

import { describe, it, expect } from "vitest";
import { computeShares, computeBalances, settle, type Member, type Expense } from "./settle";

const members: Member[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
  { id: "d", name: "D" },
];

describe("computeShares（1人あたりの負担額）", () => {
  it("割り切れる場合は全員同額になる", () => {
    expect(computeShares(35000, 4)).toEqual([8750, 8750, 8750, 8750]);
  });

  it("割り切れない場合も、配分の合計は元の金額と必ず一致する", () => {
    const shares = computeShares(10000, 3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(shares).toEqual([3334, 3333, 3333]);
  });

  it("どんな金額でも合計がズレない", () => {
    for (const total of [1, 7, 999, 12345, 100001]) {
      for (const n of [2, 3, 4, 5, 7]) {
        const sum = computeShares(total, n).reduce((a, b) => a + b, 0);
        expect(sum).toBe(total);
      }
    }
  });
});

describe("要件定義書の受け入れ基準（実際に困った旅行の例）", () => {
  // A=10,000 / B=7,000 / C=4,000 / D=14,000（合計35,000円・1人8,750円）
  const expenses: Expense[] = [
    { payerId: "a", amount: 10000 },
    { payerId: "b", amount: 7000 },
    { payerId: "c", amount: 4000 },
    { payerId: "d", amount: 14000 },
  ];

  const balances = computeBalances(members, expenses);

  it("各自の過不足が正しい", () => {
    expect(balances.map((b) => b.diff)).toEqual([1250, -1750, -4750, 5250]);
  });

  it("精算は3回で終わり、期待どおりの組み合わせになる", () => {
    const transfers = settle(balances);

    expect(transfers).toHaveLength(3);
    expect(transfers).toEqual([
      { fromId: "c", fromName: "C", toId: "d", toName: "D", amount: 4750 },
      { fromId: "b", fromName: "B", toId: "d", toName: "D", amount: 500 },
      { fromId: "b", fromName: "B", toId: "a", toName: "A", amount: 1250 },
    ]);
  });
});

describe("精算の性質（どんな入力でも守られるべきこと）", () => {
  const patterns: { name: string; expenses: Expense[] }[] = [
    { name: "1人だけが全額立替", expenses: [{ payerId: "a", amount: 12000 }] },
    {
      name: "端数が出る",
      expenses: [
        { payerId: "a", amount: 3333 },
        { payerId: "b", amount: 1 },
      ],
    },
    {
      name: "立替が多数",
      expenses: [
        { payerId: "a", amount: 1200 },
        { payerId: "a", amount: 800 },
        { payerId: "b", amount: 15000 },
        { payerId: "c", amount: 60 },
        { payerId: "d", amount: 4321 },
      ],
    },
  ];

  for (const { name, expenses } of patterns) {
    it(`${name}：精算後は全員ちょうど0になる`, () => {
      const balances = computeBalances(members, expenses);
      const transfers = settle(balances);

      const after = new Map(balances.map((b) => [b.memberId, b.diff]));
      for (const t of transfers) {
        after.set(t.fromId, (after.get(t.fromId) ?? 0) + t.amount);
        after.set(t.toId, (after.get(t.toId) ?? 0) - t.amount);
      }

      for (const value of after.values()) {
        expect(value).toBe(0);
      }
    });

    it(`${name}：送金回数は「人数−1」以下に収まる`, () => {
      const transfers = settle(computeBalances(members, expenses));
      expect(transfers.length).toBeLessThanOrEqual(members.length - 1);
    });

    it(`${name}：受け取る額と払う額の合計が一致する`, () => {
      const balances = computeBalances(members, expenses);
      const plus = balances.filter((b) => b.diff > 0).reduce((s, b) => s + b.diff, 0);
      const minus = balances.filter((b) => b.diff < 0).reduce((s, b) => s - b.diff, 0);
      expect(plus).toBe(minus);
    });
  }

  it("全員が同額を立て替えた場合は、精算の必要がない", () => {
    const expenses: Expense[] = members.map((m) => ({ payerId: m.id, amount: 5000 }));
    expect(settle(computeBalances(members, expenses))).toHaveLength(0);
  });
});
