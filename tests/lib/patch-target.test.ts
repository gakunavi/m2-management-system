import { describe, it, expect } from 'vitest';
import { parsePatchTarget, targetsListRow } from '@/lib/patch-target';

describe('parsePatchTarget', () => {
  it('自エンティティへの PATCH を解析する', () => {
    expect(parsePatchTarget('/customers/12')).toEqual({
      entityType: 'customer',
      id: 12,
      isChild: false,
    });
  });

  it('クエリパラメータを無視する', () => {
    expect(parsePatchTarget('/customers/12?businessId=3')).toEqual({
      entityType: 'customer',
      id: 12,
      isChild: false,
    });
  });

  it('子リソースへの PATCH を判別し、親IDを返す', () => {
    expect(parsePatchTarget('/customers/12/contacts/3')).toEqual({
      entityType: 'customer',
      id: 12,
      isChild: true,
    });
    expect(parsePatchTarget('/partners/7/contacts/99')).toEqual({
      entityType: 'partner',
      id: 7,
      isChild: true,
    });
  });

  it('案件エンドポイントを解析する', () => {
    expect(parsePatchTarget('/projects/5')).toEqual({
      entityType: 'project',
      id: 5,
      isChild: false,
    });
  });

  it('未知のパスは entityType が null', () => {
    expect(parsePatchTarget('/unknown/1').entityType).toBeNull();
  });

  it('IDが数値でない場合は null', () => {
    expect(parsePatchTarget('/customers/abc').id).toBeNull();
  });
});

describe('targetsListRow', () => {
  it('同一エンティティ・同一IDなら true', () => {
    const target = parsePatchTarget('/customers/12');
    expect(targetsListRow(target, 'customer', 12)).toBe(true);
  });

  it('IDが衝突していても、別エンティティなら false（本バグの再現ケース）', () => {
    // 案件一覧(entityType='project', row.id=12)から顧客(id=12)を編集する。
    // 以前は updated.id === row.id で同一判定していたため、
    // 案件の行が顧客オブジェクトで置換されて表示が壊れていた。
    const target = parsePatchTarget('/customers/12');
    expect(targetsListRow(target, 'project', 12)).toBe(false);
  });

  it('同一エンティティでもIDが違えば false', () => {
    const target = parsePatchTarget('/customers/99');
    expect(targetsListRow(target, 'customer', 12)).toBe(false);
  });

  it('子リソースは親IDが一致するので targetsListRow は true だが isChild で除外される', () => {
    const target = parsePatchTarget('/customers/12/contacts/3');
    expect(targetsListRow(target, 'customer', 12)).toBe(true);
    expect(target.isChild).toBe(true);
  });

  it('子リソースのIDが行IDと衝突しても親IDで判定される', () => {
    // 顧客12の連絡先id=12 を編集。レスポンスの id は 12（連絡先）だが
    // 行置換してはいけない（別スキーマ）。
    const target = parsePatchTarget('/customers/12/contacts/12');
    expect(target.id).toBe(12);
    expect(target.isChild).toBe(true);
  });
});

describe('行置換の可否（use-inline-cell-edit の判定と同じ式）', () => {
  const canReplaceRow = (endpoint: string, listEntityType: string, rowId: number) => {
    const target = parsePatchTarget(endpoint);
    return targetsListRow(target, listEntityType, rowId) && !target.isChild;
  };

  it('顧客一覧から顧客自身を編集 → 置換する', () => {
    expect(canReplaceRow('/customers/12?businessId=1', 'customer', 12)).toBe(true);
  });

  it('案件一覧から顧客を編集 → 置換しない（IDが衝突していても）', () => {
    expect(canReplaceRow('/customers/12', 'project', 12)).toBe(false);
  });

  it('案件一覧から代理店を編集 → 置換しない', () => {
    expect(canReplaceRow('/partners/5', 'project', 5)).toBe(false);
  });

  it('顧客一覧から連絡先を編集 → 置換しない', () => {
    expect(canReplaceRow('/customers/12/contacts/3', 'customer', 12)).toBe(false);
  });

  it('案件一覧から案件自身を編集 → 置換する', () => {
    expect(canReplaceRow('/projects/5', 'project', 5)).toBe(true);
  });
});
