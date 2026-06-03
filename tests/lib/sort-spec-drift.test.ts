import { describe, it, expect } from 'vitest';
import { customerListConfig } from '@/config/entities/customer';
import { partnerListConfig } from '@/config/entities/partner';
import { businessListConfig } from '@/config/entities/business';
import { projectListConfig } from '@/config/entities/project';
import {
  CUSTOMER_SORT_SPEC,
  PARTNER_SORT_SPEC,
  BUSINESS_SORT_SPEC,
  PROJECT_SORT_SPEC,
} from '@/lib/sort/specs';
import type { EntityListConfig } from '@/types/config';
import type { SortSpec } from '@/lib/sort/types';

// ============================================
// ドリフト防止: config の sortable 列は必ず SortSpec に存在する
// （無いと「クリックできるのに並ばない」バグになる）
// ============================================

const CASES: { name: string; config: EntityListConfig; spec: SortSpec }[] = [
  { name: 'customer', config: customerListConfig, spec: CUSTOMER_SORT_SPEC },
  { name: 'partner', config: partnerListConfig, spec: PARTNER_SORT_SPEC },
  { name: 'business', config: businessListConfig, spec: BUSINESS_SORT_SPEC },
  { name: 'project', config: projectListConfig, spec: PROJECT_SORT_SPEC },
];

describe('SortSpec ドリフト防止', () => {
  for (const { name, config, spec } of CASES) {
    it(`${name}: sortable:true の静的列はすべて SortSpec に存在する`, () => {
      const missing = config.columns
        .filter((c) => c.sortable === true)
        .map((c) => c.key)
        .filter((key) => !(key in spec));
      expect(missing, `SortSpec 未登録の sortable 列: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${name}: SortSpec の列は config に存在する（不要登録の検出）`, () => {
      const configKeys = new Set(config.columns.map((c) => c.key));
      const orphan = Object.keys(spec).filter((key) => !configKeys.has(key));
      expect(orphan, `config に無い SortSpec 登録: ${orphan.join(', ')}`).toEqual([]);
    });
  }
});
