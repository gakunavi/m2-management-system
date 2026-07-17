import { describe, it, expect } from 'vitest';
import { parseRewardSlots, mergeRewardSlots, type RewardSlots } from '@/lib/reward-slots';

describe('parseRewardSlots', () => {
  it('正しい RewardSlots をそのまま返す', () => {
    const slots: RewardSlots = {
      shot: { direct: { type: 'rate', value: 20 }, indirect: { type: 'rate', value: 5 } },
      stock: { direct: { type: 'fixed', value: 3000 } },
    };
    expect(parseRewardSlots(slots)).toEqual(slots);
  });

  it('null / 非オブジェクトは空スロット', () => {
    expect(parseRewardSlots(null)).toEqual({});
    expect(parseRewardSlots(undefined)).toEqual({});
    expect(parseRewardSlots('x')).toEqual({});
    expect(parseRewardSlots(123)).toEqual({});
  });

  it('不正な形（typeが不正など）は空スロットにフォールバック', () => {
    expect(parseRewardSlots({ shot: { direct: { type: 'bad', value: 1 } } })).toEqual({});
    expect(parseRewardSlots({ shot: { direct: { type: 'rate', value: -1 } } })).toEqual({});
  });

  it('部分的なスロット（shotのみ）も読める', () => {
    expect(parseRewardSlots({ shot: { direct: { type: 'rate', value: 10 } } })).toEqual({
      shot: { direct: { type: 'rate', value: 10 } },
    });
  });
});

describe('mergeRewardSlots（3層マージ）', () => {
  it('後の層がスロット単位で上書きする', () => {
    const businessDefault: RewardSlots = {
      shot: { direct: { type: 'rate', value: 20 }, indirect: { type: 'rate', value: 5 } },
      stock: { direct: { type: 'rate', value: 10 } },
    };
    const linkOverride: RewardSlots = {
      shot: { direct: { type: 'rate', value: 25 } }, // 直だけ上書き
    };
    const merged = mergeRewardSlots(businessDefault, linkOverride);
    // shot.direct はリンクで上書き、shot.indirect は事業デフォルトが残る
    expect(merged.shot?.direct).toEqual({ type: 'rate', value: 25 });
    expect(merged.shot?.indirect).toEqual({ type: 'rate', value: 5 });
    // stock は事業デフォルトのまま
    expect(merged.stock?.direct).toEqual({ type: 'rate', value: 10 });
  });

  it('案件上書きが最優先（3層）', () => {
    const business: RewardSlots = { shot: { direct: { type: 'rate', value: 20 } } };
    const link: RewardSlots = { shot: { direct: { type: 'rate', value: 25 } } };
    const project: RewardSlots = { shot: { direct: { type: 'fixed', value: 50000 } } };
    const merged = mergeRewardSlots(business, link, project);
    expect(merged.shot?.direct).toEqual({ type: 'fixed', value: 50000 });
  });

  it('null/undefined 層は無視', () => {
    const business: RewardSlots = { shot: { direct: { type: 'rate', value: 20 } } };
    expect(mergeRewardSlots(business, null, undefined)).toEqual(business);
    expect(mergeRewardSlots(null, undefined)).toEqual({});
  });

  it('ストックだけの層とショットだけの層を合成できる', () => {
    const merged = mergeRewardSlots(
      { shot: { direct: { type: 'rate', value: 20 } } },
      { stock: { direct: { type: 'rate', value: 10 } } },
    );
    expect(merged.shot?.direct).toEqual({ type: 'rate', value: 20 });
    expect(merged.stock?.direct).toEqual({ type: 'rate', value: 10 });
  });
});
