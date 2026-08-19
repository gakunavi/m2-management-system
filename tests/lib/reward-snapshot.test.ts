import { describe, it, expect } from 'vitest';
import {
  buildRewardSnapshot,
  computeProjectEntries,
  effectiveCompanyShareBaseField,
  effectiveRewardBaseField,
  resolveEffectiveCompanyShare,
  resolveTopPartnerCompanyShare,
  settingForNode,
  type LinkRewardInput,
  type ProjectRewardInput,
  type RewardChainNode,
  type RewardConfig,
} from '@/lib/reward-helpers';
import { computeProjectFinancials, type ProfitBasis } from '@/lib/profit-helpers';
import {
  parseRewardSnapshot,
  visibleRewardSnapshot,
  type RewardSnapshot,
} from '@/lib/reward-snapshot';
import { validateCompanyShareTier } from '@/lib/reward-link-serializer';
import type { CompanyShare } from '@/lib/company-share';

// ============================================
// テスト用の共通データ
// ============================================
//
// 階層: 1次代理店(1) → 2次代理店(2) → 3次代理店(3)。案件の担当は3次代理店。
// 「うちがメーカーから受け取る率は代理店グループ（＝1次代理店）で決まる」ことと、
// 「収益確定で料率が凍結され、以後マスタを改定しても金額が動かない」ことを検証する。

const CAPTURED_AT = new Date('2026-03-10T00:00:00Z');

function link(
  partnerId: number,
  overrides: Partial<LinkRewardInput> = {},
): LinkRewardInput {
  return {
    partnerId,
    rewardSlots: null,
    companyShareSlots: null,
    paymentTiming: null,
    closingDay: null,
    ...overrides,
  };
}

/** 担当(3次) → 2次 → 1次 の3段チェーン */
function makeChain(opts: {
  topCompanyShare?: CompanyShare | null;
  midCompanyShare?: CompanyShare | null;
} = {}): RewardChainNode[] {
  return [
    { partnerId: 3, link: link(3), isAssigned: true },
    {
      partnerId: 2,
      link: link(2, {
        rewardSlots: { shot: { indirect: { type: 'rate', value: 3 } } },
        companyShareSlots: opts.midCompanyShare ?? null,
      }),
      isAssigned: false,
    },
    {
      partnerId: 1,
      link: link(1, {
        rewardSlots: { shot: { indirect: { type: 'rate', value: 2 } } },
        companyShareSlots: opts.topCompanyShare ?? null,
      }),
      isAssigned: false,
    },
  ];
}

function makeConfig(overrides: Partial<RewardConfig> = {}): RewardConfig {
  return {
    defaults: {
      shot: { direct: { type: 'rate', value: 10 } },
      stock: { direct: { type: 'rate', value: 5 } },
    },
    shotBaseField: 'amount',
    stockBaseField: 'monthly',
    taxRate: 10,
    paymentTiming: 'same',
    closingDay: null,
    companyShare: { shot: { type: 'rate', value: 20 }, stock: { type: 'rate', value: 20 } },
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectRewardInput> = {}): ProjectRewardInput {
  return {
    id: 10,
    projectNo: 'MG-0010',
    customerName: '株式会社A',
    partnerId: 3,
    projectExpectedCloseMonth: '2026-03',
    projectCustomData: { amount: 1_000_000, monthly: 100_000 },
    revenueConfirmedMonth: '2026-03',
    revenueConfirmedDay: 10,
    cancelledMonth: null,
    stockTermMonths: null,
    rewardOverride: null,
    companyShareOverride: null,
    rewardSnapshot: null,
    ...overrides,
  };
}

const basis: ProfitBasis = {
  sourceField: 'amount',
  dateField: 'projectExpectedCloseMonth',
  statusCodes: null,
  label: '受注見込み金額',
};

// ============================================
// 自社受取率は「1次代理店（代理店グループ）」で決まる
// ============================================

describe('resolveTopPartnerCompanyShare', () => {
  it('階層を最上位まで遡って1次代理店の設定を返す', () => {
    const chain = makeChain({ topCompanyShare: { shot: { type: 'rate', value: 18 } } });
    expect(resolveTopPartnerCompanyShare(chain)).toEqual({ shot: { type: 'rate', value: 18 } });
  });

  it('途中（2次代理店）の設定は無視する。グループ内は一律', () => {
    const chain = makeChain({
      topCompanyShare: { shot: { type: 'rate', value: 18 } },
      midCompanyShare: { shot: { type: 'rate', value: 25 } },
    });
    expect(resolveTopPartnerCompanyShare(chain)).toEqual({ shot: { type: 'rate', value: 18 } });
  });

  it('1次代理店に設定が無ければ null（事業デフォルトへフォールバック）', () => {
    expect(resolveTopPartnerCompanyShare(makeChain())).toBeNull();
  });

  it('代理店の紐づかない案件（自社直販）は null', () => {
    expect(resolveTopPartnerCompanyShare([])).toBeNull();
  });
});

describe('resolveEffectiveCompanyShare', () => {
  it('事業デフォルト → 1次代理店 の順に後勝ちでマージする', () => {
    const chain = makeChain({ topCompanyShare: { shot: { type: 'rate', value: 18 } } });
    const { share } = resolveEffectiveCompanyShare(makeConfig(), chain, makeProject());
    // ショットは1次代理店で上書き、ストックは事業デフォルトのまま
    expect(share.shot).toEqual({ type: 'rate', value: 18 });
    expect(share.stock).toEqual({ type: 'rate', value: 20 });
  });

  it('案件別上書きが1次代理店より強い', () => {
    const chain = makeChain({ topCompanyShare: { shot: { type: 'rate', value: 18 } } });
    const { share, isOverridden } = resolveEffectiveCompanyShare(
      makeConfig(),
      chain,
      makeProject({ companyShareOverride: { shot: { type: 'rate', value: 30 } } }),
    );
    expect(share.shot).toEqual({ type: 'rate', value: 30 });
    expect(isOverridden).toBe(true);
  });

  it('凍結済みならスナップショットが最優先（マスタも案件別上書きも見ない）', () => {
    const chain = makeChain({ topCompanyShare: { shot: { type: 'rate', value: 18 } } });
    const snapshot = buildRewardSnapshot(makeConfig(), chain, makeProject(), 'confirm', CAPTURED_AT);

    const { share, isFrozen } = resolveEffectiveCompanyShare(
      makeConfig({ companyShare: { shot: { type: 'rate', value: 99 } } }),
      makeChain({ topCompanyShare: { shot: { type: 'rate', value: 88 } } }),
      makeProject({
        rewardSnapshot: snapshot,
        companyShareOverride: { shot: { type: 'rate', value: 77 } },
      }),
    );
    expect(share.shot).toEqual({ type: 'rate', value: 18 });
    expect(isFrozen).toBe(true);
  });
});

// ============================================
// スナップショットの生成
// ============================================

describe('buildRewardSnapshot', () => {
  const chain = makeChain({ topCompanyShare: { shot: { type: 'rate', value: 18 } } });
  const snapshot = buildRewardSnapshot(makeConfig(), chain, makeProject(), 'confirm', CAPTURED_AT);

  it('実効の自社受取率を焼き付ける', () => {
    expect(snapshot.companyShare).toEqual({
      shot: { type: 'rate', value: 18 },
      stock: { type: 'rate', value: 20 },
    });
  });

  it('階層の各段の支払率を焼き付ける', () => {
    expect(snapshot.chain.map((n) => [n.partnerId, n.isAssigned, n.shot, n.stock])).toEqual([
      [3, true, { type: 'rate', value: 10 }, { type: 'rate', value: 5 }],
      [2, false, { type: 'rate', value: 3 }, undefined],
      [1, false, { type: 'rate', value: 2 }, undefined],
    ]);
  });

  it('基準金額フィールドと支払タイミングも焼き付ける', () => {
    expect(snapshot.shotBaseField).toBe('amount');
    expect(snapshot.stockBaseField).toBe('monthly');
    expect(snapshot.companyShareShotBaseField).toBe('amount');
    expect(snapshot.chain[0].paymentTiming).toBe('same');
  });

  it('捕捉時刻と理由を記録する', () => {
    expect(snapshot.version).toBe(1);
    expect(snapshot.capturedAt).toBe(CAPTURED_AT.toISOString());
    expect(snapshot.capturedBy).toBe('confirm');
  });

  it('既にスナップショットを持つ案件でも現在のマスタ値で作り直す', () => {
    const stale: RewardSnapshot = { ...snapshot, companyShare: { shot: { type: 'rate', value: 1 } } };
    const rebuilt = buildRewardSnapshot(
      makeConfig({ companyShare: { shot: { type: 'rate', value: 40 } } }),
      makeChain(),
      makeProject({ rewardSnapshot: stale }),
      'manual',
      CAPTURED_AT,
    );
    expect(rebuilt.companyShare.shot).toEqual({ type: 'rate', value: 40 });
  });

  it('代理店の紐づかない案件は chain が空でも作れる', () => {
    const solo = buildRewardSnapshot(makeConfig(), [], makeProject(), 'confirm', CAPTURED_AT);
    expect(solo.chain).toEqual([]);
    expect(solo.companyShare.shot).toEqual({ type: 'rate', value: 20 });
  });
});

// ============================================
// 凍結の効き目：マスタを改定しても確定済み案件は動かない
// ============================================

describe('料率改定と凍結', () => {
  const chainBefore = makeChain({ topCompanyShare: { shot: { type: 'rate', value: 18 } } });
  const configBefore = makeConfig();

  /** 改定後: 受取率18%→10%、支払率10%→30% に変更したマスタ */
  const chainAfter = makeChain({ topCompanyShare: { shot: { type: 'rate', value: 10 } } });
  const configAfter = makeConfig({
    defaults: {
      shot: { direct: { type: 'rate', value: 30 } },
      stock: { direct: { type: 'rate', value: 15 } },
    },
  });

  const frozen = makeProject({
    rewardSnapshot: buildRewardSnapshot(configBefore, chainBefore, makeProject(), 'confirm', CAPTURED_AT),
  });

  it('未凍結の案件には新しい料率が反映される', () => {
    const f = computeProjectFinancials(makeProject(), chainAfter, configAfter, basis, true);
    // 受取 1,000,000 × 10% = 100,000
    expect(f.companyRevenueShot).toBe(100_000);
    // 支払 担当30% = 300,000
    expect(f.rewardShotDirect).toBe(300_000);
    expect(f.rewardIsFrozen).toBe(false);
  });

  it('凍結済みの案件は改定後のマスタでも確定時の金額のまま', () => {
    const f = computeProjectFinancials(frozen, chainAfter, configAfter, basis, true);
    // 受取 1,000,000 × 18%（確定時の率）
    expect(f.companyRevenueShot).toBe(180_000);
    // 支払 担当10%（確定時の率）
    expect(f.rewardShotDirect).toBe(100_000);
    // 上位2段 3% + 2% = 50,000
    expect(f.rewardShotIndirect).toBe(50_000);
    expect(f.grossProfitShot).toBe(180_000 - 150_000);
    expect(f.rewardIsFrozen).toBe(true);
  });

  it('凍結後に案件別上書きを足しても金額は動かない（訂正はスナップショット経由）', () => {
    const f = computeProjectFinancials(
      { ...frozen, companyShareOverride: { shot: { type: 'rate', value: 50 } } },
      chainAfter,
      configAfter,
      basis,
      true,
    );
    expect(f.companyRevenueShot).toBe(180_000);
  });

  it('基準金額フィールドを事業側で差し替えても凍結案件は元のフィールドを見る', () => {
    const configFieldChanged = makeConfig({ shotBaseField: 'monthly' });
    expect(effectiveRewardBaseField(configFieldChanged, frozen, 'shot')).toBe('amount');
    expect(effectiveCompanyShareBaseField(configFieldChanged, frozen, 'shot')).toBe('amount');
    // 未凍結なら新しいフィールドを見る
    expect(effectiveRewardBaseField(configFieldChanged, makeProject(), 'shot')).toBe('monthly');
  });

  it('ストックは確定時の率が毎月そのまま続く', () => {
    const entries = computeProjectEntries(frozen, chainAfter, configAfter, '2026-03', '2026-05');
    const stock = entries.filter((e) => e.rewardKind === 'stock');
    expect(stock.map((e) => e.sourceMonth)).toEqual(['2026-03', '2026-04', '2026-05']);
    // 確定時の担当5%（改定後の15%ではない）: 100,000 × 5%
    for (const e of stock) {
      expect(e.rewardAmount).toBe(5_000);
      expect(e.rate).toBe(5);
    }
  });

  it('支払タイミングも凍結される（発行済み明細と月がずれない）', () => {
    const configTimingChanged = makeConfig({ paymentTiming: 'next2' });
    const entries = computeProjectEntries(frozen, chainBefore, configTimingChanged, '2026-03', '2026-03');
    const shot = entries.find((e) => e.rewardKind === 'shot' && e.entryType === 'direct');
    expect(shot?.paymentMonth).toBe('2026-03');
  });

  it('凍結後に増えた階層の段はマスタから解決する（存在しない代理店に払い続けない）', () => {
    const chainWithNewParent: RewardChainNode[] = [
      ...chainBefore,
      {
        partnerId: 9,
        link: link(9, { rewardSlots: { shot: { indirect: { type: 'rate', value: 7 } } } }),
        isAssigned: false,
      },
    ];
    const node = chainWithNewParent[3];
    expect(settingForNode('shot', node, configBefore, frozen)).toEqual({ type: 'rate', value: 7 });
  });
});

// ============================================
// パース・マスキング
// ============================================

describe('parseRewardSnapshot', () => {
  const valid = buildRewardSnapshot(makeConfig(), makeChain(), makeProject(), 'confirm', CAPTURED_AT);

  it('正しい JSON を読める', () => {
    expect(parseRewardSnapshot(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it('null / 壊れた JSON は null（未凍結扱いにフォールバック）', () => {
    expect(parseRewardSnapshot(null)).toBeNull();
    expect(parseRewardSnapshot({ version: 2 })).toBeNull();
    expect(parseRewardSnapshot('x')).toBeNull();
    expect(parseRewardSnapshot({ ...valid, chain: [{ partnerId: 'a' }] })).toBeNull();
  });
});

describe('visibleRewardSnapshot', () => {
  const snapshot = buildRewardSnapshot(
    makeConfig(),
    makeChain({ topCompanyShare: { shot: { type: 'rate', value: 18 } } }),
    makeProject(),
    'confirm',
    CAPTURED_AT,
  );

  it('社内ユーザーには全て見せる', () => {
    expect(visibleRewardSnapshot(snapshot, true)).toEqual(snapshot);
  });

  it('代理店には自社受取率だけ伏せ、支払率は見せる', () => {
    const masked = visibleRewardSnapshot(snapshot, false)!;
    expect(masked.companyShare).toEqual({});
    expect(masked.companyShareShotBaseField).toBeNull();
    expect(masked.chain).toEqual(snapshot.chain);
  });

  it('未凍結（null）はそのまま null', () => {
    expect(visibleRewardSnapshot(null, false)).toBeNull();
  });
});

// ============================================
// 受取率を保存してよい階層かの検証
// ============================================

describe('validateCompanyShareTier', () => {
  const share: CompanyShare = { shot: { type: 'rate', value: 18 } };

  it('1次代理店には設定できる', () => {
    expect(validateCompanyShareTier(share, { businessTier: '1次代理店', businessParentId: null })).toBeNull();
  });

  it('階層ラベル未設定でも親が無ければ最上位として許可する', () => {
    expect(validateCompanyShareTier(share, { businessTier: null, businessParentId: null })).toBeNull();
  });

  it('2次代理店には設定できない', () => {
    expect(validateCompanyShareTier(share, { businessTier: '2次代理店', businessParentId: 1 })).toMatch(/1次代理店/);
  });

  it('親を持つリンクは階層ラベルが1次でも拒否する', () => {
    expect(validateCompanyShareTier(share, { businessTier: '1次代理店', businessParentId: 1 })).not.toBeNull();
  });

  it('クリア（null / undefined）はどの段でも許可する', () => {
    expect(validateCompanyShareTier(null, { businessTier: '3次代理店', businessParentId: 2 })).toBeNull();
    expect(validateCompanyShareTier(undefined, { businessTier: '3次代理店', businessParentId: 2 })).toBeNull();
  });
});

// ============================================
// 同一 PATCH で「案件別上書き＋収益確定」を送ったときの凍結値
// ============================================
//
// 案件詳細の報酬タブは上書きと確定日を1回の PATCH でまとめて送る。
// 凍結は更新前の DB 行を読んで作るため、更新後の上書き値を差し込まないと
// 「上書きを入れた当日に確定した案件」だけ上書き前の料率で固まる。
// buildRewardSnapshotForProject が行う差し込みと同じ形をここで検証する。

describe('上書きと確定を同時に保存したときの凍結', () => {
  const chain = makeChain({ topCompanyShare: { shot: { type: 'rate', value: 18 } } });

  it('更新後の案件別上書きが凍結値に入る', () => {
    const beforeUpdate = makeProject(); // DB 上はまだ上書き無し
    const afterUpdate: ProjectRewardInput = {
      ...beforeUpdate,
      companyShareOverride: { shot: { type: 'rate', value: 33 } },
      rewardOverride: { shot: { direct: { type: 'rate', value: 12 } } },
    };

    const snapshot = buildRewardSnapshot(makeConfig(), chain, afterUpdate, 'confirm', CAPTURED_AT);
    expect(snapshot.companyShare.shot).toEqual({ type: 'rate', value: 33 });
    expect(snapshot.chain[0].shot).toEqual({ type: 'rate', value: 12 });

    // 差し込みを忘れると上書き前の値（受取18% / 支払10%）で固まってしまう
    const stale = buildRewardSnapshot(makeConfig(), chain, beforeUpdate, 'confirm', CAPTURED_AT);
    expect(stale.companyShare.shot).toEqual({ type: 'rate', value: 18 });
    expect(stale.chain[0].shot).toEqual({ type: 'rate', value: 10 });
  });
});
