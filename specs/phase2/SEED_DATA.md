# Phase 2: 初期データ設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [06_PHASE2_PRD.md](../06_PHASE2_PRD.md) | Phase 2 全体PRD |
> | [04_EXISTING_SPECS.md](../04_EXISTING_SPECS.md) | 現行システム引き継ぎ仕様 |
> | [BUSINESS_TABS_DESIGN.md](./BUSINESS_TABS_DESIGN.md) | 事業詳細タブ設計 |
> | [DYNAMIC_FIELDS_DESIGN.md](./DYNAMIC_FIELDS_DESIGN.md) | 動的フィールド設計 |

---

## 目次

1. [概要](#1-概要)
2. [事業マスタの拡張](#2-事業マスタの拡張)
3. [営業ステータス定義](#3-営業ステータス定義)
4. [ムーブメントテンプレート](#4-ムーブメントテンプレート)
5. [案件フィールド定義](#5-案件フィールド定義)
6. [Prisma seedスクリプト](#6-prisma-seedスクリプト)
7. [実装チェックリスト](#7-実装チェックリスト)

---

## 1. 概要

Phase 2 では案件管理の基盤として、既存の MOAG 事業に以下の初期データを投入する。

| データ種別 | 件数 | 格納先 |
|-----------|------|--------|
| 営業ステータス定義 | 7件 | `business_status_definitions` テーブル |
| ムーブメントテンプレート | 18件 | `movement_templates` テーブル |
| 案件フィールド定義 | 10件（主要なもの） | `businesses.business_config.projectFields` |

**注意:** 事業マスタの `businessProjectPrefix` カラム（案件番号プレフィックス）もこのシードで設定する。

---

## 2. 事業マスタの拡張

### 2.1 businessProjectPrefix の設定

既存の MOAG 事業レコードに案件番号プレフィックスを設定する。

```typescript
// seed.ts — 既存事業の更新
await prisma.business.update({
  where: { id: moagBusinessId },
  data: {
    businessProjectPrefix: 'MG',
  },
});
```

| 事業 | businessProjectPrefix | 案件番号形式 |
|------|----------------------|-------------|
| MOAG事業 | `MG` | `MG-0001`, `MG-0002`, ... |

**他事業追加時:** 事業作成フォームで `businessProjectPrefix` を入力。英大文字2〜4文字を推奨。

---

## 3. 営業ステータス定義

### 3.1 MOAG事業のステータス一覧

現行システムの7段階ステータスをそのまま初期データとして投入する。
（参照: [04_EXISTING_SPECS.md セクション2.1](../04_EXISTING_SPECS.md#21-現行仕様)）

| statusSortOrder | statusCode | statusLabel | statusPriority | statusColor | statusIsFinal | statusIsLost |
|----------------|------------|-------------|----------------|-------------|---------------|-------------|
| 0 | `purchased` | 1.購入済み | 6 | `#22c55e` | **true** | false |
| 1 | `payment_confirmed` | 2.入金確定 | 5 | `#3b82f6` | false | false |
| 2 | `contract_in_progress` | 3.契約締結中 | 4 | `#6366f1` | false | false |
| 3 | `a_yomi` | 4.Aヨミ(申請中) | 3 | `#f59e0b` | false | false |
| 4 | `b_yomi` | 5.Bヨミ | 2 | `#f97316` | false | false |
| 5 | `appointing` | 6.アポ中 | 1 | `#8b5cf6` | false | false |
| 6 | `lost` | 7.失注 | 0 | `#ef4444` | false | **true** |

### 3.2 カラー設計方針

| 色 | Tailwind相当 | 意味 |
|----|-------------|------|
| `#22c55e` | green-500 | 成約・完了（ポジティブ最終） |
| `#3b82f6` | blue-500 | 確定・安定 |
| `#6366f1` | indigo-500 | 進行中（手続き段階） |
| `#f59e0b` | amber-500 | 高確度見込み |
| `#f97316` | orange-500 | 中確度見込み |
| `#8b5cf6` | violet-500 | 初期段階 |
| `#ef4444` | red-500 | 失注・ネガティブ |

### 3.3 シードデータ

```typescript
const MOAG_STATUS_DEFINITIONS = [
  {
    statusCode: 'purchased',
    statusLabel: '1.購入済み',
    statusPriority: 6,
    statusColor: '#22c55e',
    statusIsFinal: true,
    statusIsLost: false,
    statusSortOrder: 0,
    statusIsActive: true,
  },
  {
    statusCode: 'payment_confirmed',
    statusLabel: '2.入金確定',
    statusPriority: 5,
    statusColor: '#3b82f6',
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 1,
    statusIsActive: true,
  },
  {
    statusCode: 'contract_in_progress',
    statusLabel: '3.契約締結中',
    statusPriority: 4,
    statusColor: '#6366f1',
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 2,
    statusIsActive: true,
  },
  {
    statusCode: 'a_yomi',
    statusLabel: '4.Aヨミ(申請中)',
    statusPriority: 3,
    statusColor: '#f59e0b',
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 3,
    statusIsActive: true,
  },
  {
    statusCode: 'b_yomi',
    statusLabel: '5.Bヨミ',
    statusPriority: 2,
    statusColor: '#f97316',
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 4,
    statusIsActive: true,
  },
  {
    statusCode: 'appointing',
    statusLabel: '6.アポ中',
    statusPriority: 1,
    statusColor: '#8b5cf6',
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 5,
    statusIsActive: true,
  },
  {
    statusCode: 'lost',
    statusLabel: '7.失注',
    statusPriority: 0,
    statusColor: '#ef4444',
    statusIsFinal: false,
    statusIsLost: true,
    statusSortOrder: 6,
    statusIsActive: true,
  },
];
```

---

## 4. ムーブメントテンプレート

### 4.1 MOAG事業の18ステップ

現行システムの18ステップをそのまま初期データとして投入する。
（参照: [04_EXISTING_SPECS.md セクション3.1](../04_EXISTING_SPECS.md#31-現行仕様)）

| stepNumber | stepCode | stepName | stepIsSalesLinked | stepLinkedStatusCode |
|-----------|----------|----------|-------------------|---------------------|
| 1 | `sales_status_display` | 営業ステータス | **true** | ※ステータス全体に連動 |
| 2 | `location_sharing` | 設置場所共有 | false | - |
| 3 | `property_contract` | 動産契約 | false | - |
| 4 | `industrial_association_application` | 工業会申請 | false | - |
| 5 | `industrial_association_approval` | 工業会承認 | false | - |
| 6 | `sme_agency_application` | 中企庁申請 | false | - |
| 7 | `sme_agency_approval` | 中企庁承認 | false | - |
| 8 | `contract_preparation` | 契約書作成 | false | - |
| 9 | `contract_legal_check` | 法務チェック | false | - |
| 10 | `contract_signing` | 契約締結 | false | - |
| 11 | `invoice_issuance` | 請求書発行 | false | - |
| 12 | `payment_confirmation` | 入金確認 | false | - |
| 13 | `delivery_preparation` | 納品準備 | false | - |
| 14 | `delivery_execution` | 納品実行 | false | - |
| 15 | `installation_report` | 設置報告 | false | - |
| 16 | `ext_care_contract` | 拡張ケア契約 | false | - |
| 17 | `receipt_issuance` | 領収書発行 | false | - |
| 18 | `completion` | 完了 | false | - |

### 4.2 ステップ1の営業ステータス連動について

ステップ1（`sales_status_display`）は `stepIsSalesLinked = true` に設定する。
Phase 2 時点ではフラグの設定のみで、実際の連動ロジック（ステータス変更時の自動スキップ）は Phase 3 で実装する。

`stepLinkedStatusCode` はステップ1では `null` とする（ステータス全体に連動するため、特定ステータスコードを指定しない）。

### 4.3 シードデータ

```typescript
const MOAG_MOVEMENT_TEMPLATES = [
  {
    stepNumber: 1,
    stepCode: 'sales_status_display',
    stepName: '営業ステータス',
    stepDescription: '案件の営業ステータスを管理するステップ',
    stepIsSalesLinked: true,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 2,
    stepCode: 'location_sharing',
    stepName: '設置場所共有',
    stepDescription: '設置場所の情報を関係者と共有する',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 3,
    stepCode: 'property_contract',
    stepName: '動産契約',
    stepDescription: '動産契約の締結手続き',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 4,
    stepCode: 'industrial_association_application',
    stepName: '工業会申請',
    stepDescription: '工業会への申請手続き',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 5,
    stepCode: 'industrial_association_approval',
    stepName: '工業会承認',
    stepDescription: '工業会からの承認待ち',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 6,
    stepCode: 'sme_agency_application',
    stepName: '中企庁申請',
    stepDescription: '中小企業庁への申請手続き',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 7,
    stepCode: 'sme_agency_approval',
    stepName: '中企庁承認',
    stepDescription: '中小企業庁からの承認待ち',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 8,
    stepCode: 'contract_preparation',
    stepName: '契約書作成',
    stepDescription: '契約書の作成と準備',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 9,
    stepCode: 'contract_legal_check',
    stepName: '法務チェック',
    stepDescription: '法務部門による契約書の確認',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 10,
    stepCode: 'contract_signing',
    stepName: '契約締結',
    stepDescription: '契約書への署名・締結',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 11,
    stepCode: 'invoice_issuance',
    stepName: '請求書発行',
    stepDescription: '請求書の発行手続き',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 12,
    stepCode: 'payment_confirmation',
    stepName: '入金確認',
    stepDescription: '入金状況の確認',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 13,
    stepCode: 'delivery_preparation',
    stepName: '納品準備',
    stepDescription: '納品に向けた準備作業',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 14,
    stepCode: 'delivery_execution',
    stepName: '納品実行',
    stepDescription: '納品の実施',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 15,
    stepCode: 'installation_report',
    stepName: '設置報告',
    stepDescription: '設置完了の報告',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 16,
    stepCode: 'ext_care_contract',
    stepName: '拡張ケア契約',
    stepDescription: '拡張ケアサービスの契約手続き',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 17,
    stepCode: 'receipt_issuance',
    stepName: '領収書発行',
    stepDescription: '領収書の発行手続き',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
  {
    stepNumber: 18,
    stepCode: 'completion',
    stepName: '完了',
    stepDescription: '全プロセスの完了',
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepIsActive: true,
  },
];
```

---

## 5. 案件フィールド定義

### 5.1 MOAG事業の主要フィールド

現行システムの事業固有フィールドのうち、主要なものを初期データとして設定する。
（参照: [04_EXISTING_SPECS.md セクション4.3](../04_EXISTING_SPECS.md#43-事業固有フィールドmoag事業の例)）

全フィールドを一度に投入するのではなく、運用頻度の高い主要フィールドを厳選して初期設定する。
残りのフィールドは事業管理者が「案件フィールド定義」タブから追加可能。

| sortOrder | key | label | type | required | options | description |
|-----------|-----|-------|------|----------|---------|-------------|
| 1 | `project_name` | 案件名 | text | false | - | 案件の通称・略称 |
| 2 | `project_amount` | 案件金額 | number | false | - | 合計金額（税抜） |
| 3 | `general_machine_count` | 一般機台数 | number | false | - | |
| 4 | `ic_machine_count` | IC機台数 | number | false | - | |
| 5 | `total_machine_count` | 合計台数 | number | false | - | 一般機 + IC機の合計 |
| 6 | `ext_care_subscription` | EXTケア加入 | checkbox | false | - | |
| 7 | `industrial_association_status` | 工業会ステータス | select | false | 未申請,申請中,承認済み,不要 | |
| 8 | `sme_agency_certification_status` | 中企庁認定状況 | select | false | 未申請,申請中,認定済み,不要 | |
| 9 | `sales_company` | 販売会社 | text | false | - | |
| 10 | `operating_company` | 運営会社 | text | false | - | |

### 5.2 フィールド定義の格納

案件フィールド定義は `businesses.business_config` の `projectFields` 配列に JSON で格納する。

```typescript
const MOAG_PROJECT_FIELDS: ProjectFieldDefinition[] = [
  {
    key: 'project_name',
    label: '案件名',
    type: 'text',
    required: false,
    description: '案件の通称・略称',
    sortOrder: 1,
  },
  {
    key: 'project_amount',
    label: '案件金額',
    type: 'number',
    required: false,
    description: '合計金額（税抜）',
    sortOrder: 2,
  },
  {
    key: 'general_machine_count',
    label: '一般機台数',
    type: 'number',
    required: false,
    sortOrder: 3,
  },
  {
    key: 'ic_machine_count',
    label: 'IC機台数',
    type: 'number',
    required: false,
    sortOrder: 4,
  },
  {
    key: 'total_machine_count',
    label: '合計台数',
    type: 'number',
    required: false,
    description: '一般機 + IC機の合計',
    sortOrder: 5,
  },
  {
    key: 'ext_care_subscription',
    label: 'EXTケア加入',
    type: 'checkbox',
    required: false,
    sortOrder: 6,
  },
  {
    key: 'industrial_association_status',
    label: '工業会ステータス',
    type: 'select',
    options: ['未申請', '申請中', '承認済み', '不要'],
    required: false,
    sortOrder: 7,
  },
  {
    key: 'sme_agency_certification_status',
    label: '中企庁認定状況',
    type: 'select',
    options: ['未申請', '申請中', '認定済み', '不要'],
    required: false,
    sortOrder: 8,
  },
  {
    key: 'sales_company',
    label: '販売会社',
    type: 'text',
    required: false,
    sortOrder: 9,
  },
  {
    key: 'operating_company',
    label: '運営会社',
    type: 'text',
    required: false,
    sortOrder: 10,
  },
];
```

### 5.3 追加可能なフィールド（参考）

以下は初期データに含めないが、管理者がUIから追加できるフィールドの例。

| key | label | type | 備考 |
|-----|-------|------|------|
| `general_machine_unit_price` | 一般機単価 | number | |
| `ic_machine_unit_price` | IC機単価 | number | |
| `target_roi` | 目標ROI | number | |
| `confirmation_contact` | 確認連絡先 | text | |
| `ext_care_contract_period` | EXTケア契約期間 | number | 月数 |
| `loading_fund_contribution` | 装填金拠出 | checkbox | |
| `loading_fund_amount` | 装填金額 | number | |
| `jaoc_sales_contact` | JAOC営業担当 | text | |
| `ext_sales_contact` | 外部営業担当 | text | |
| `sales_contract_date` | 売買契約日 | date | |
| `delivery_date` | 納品日 | date | |
| `application_agent_name` | 申請代行者名 | text | |

---

## 6. Prisma seedスクリプト

### 6.1 実装方針

- 既存の `prisma/seed.ts` に Phase 2 データの投入処理を追加する
- **冪等性**: `upsert` を使用し、既存データがある場合は更新（または スキップ）する
- **依存関係**: MOAG 事業の `businessId` が必要なため、事業の seed 後に実行する
- **トランザクション**: ステータス定義・テンプレート・フィールド定義は `$transaction` 内で一括投入

### 6.2 シード関数の構造

```typescript
// prisma/seed.ts に追加

async function seedPhase2Data(prisma: PrismaClient) {
  // 1. MOAG事業の取得（Phase 0/1 で作成済み）
  const moagBusiness = await prisma.business.findFirst({
    where: { businessCode: 'MOAG' },
  });

  if (!moagBusiness) {
    console.log('MOAG事業が見つかりません。Phase 2 シードをスキップします。');
    return;
  }

  const businessId = moagBusiness.id;

  // 2. businessProjectPrefix の設定
  await prisma.business.update({
    where: { id: businessId },
    data: { businessProjectPrefix: 'MG' },
  });

  // 3. 営業ステータス定義の投入
  for (const status of MOAG_STATUS_DEFINITIONS) {
    await prisma.businessStatusDefinition.upsert({
      where: {
        businessId_statusCode: {
          businessId,
          statusCode: status.statusCode,
        },
      },
      update: {
        statusLabel: status.statusLabel,
        statusPriority: status.statusPriority,
        statusColor: status.statusColor,
        statusIsFinal: status.statusIsFinal,
        statusIsLost: status.statusIsLost,
        statusSortOrder: status.statusSortOrder,
        statusIsActive: status.statusIsActive,
      },
      create: {
        businessId,
        ...status,
      },
    });
  }

  // 4. ムーブメントテンプレートの投入
  for (const template of MOAG_MOVEMENT_TEMPLATES) {
    await prisma.movementTemplate.upsert({
      where: {
        businessId_stepCode: {
          businessId,
          stepCode: template.stepCode,
        },
      },
      update: {
        stepNumber: template.stepNumber,
        stepName: template.stepName,
        stepDescription: template.stepDescription,
        stepIsSalesLinked: template.stepIsSalesLinked,
        stepLinkedStatusCode: template.stepLinkedStatusCode,
        stepIsActive: template.stepIsActive,
      },
      create: {
        businessId,
        ...template,
      },
    });
  }

  // 5. 案件フィールド定義の投入（businessConfig に格納）
  const existingConfig = (moagBusiness.businessConfig as Record<string, unknown>) ?? {};
  await prisma.business.update({
    where: { id: businessId },
    data: {
      businessConfig: {
        ...existingConfig,
        projectFields: MOAG_PROJECT_FIELDS,
      } as Prisma.InputJsonValue,
    },
  });

  console.log('Phase 2 シードデータを投入しました:');
  console.log(`  - 営業ステータス定義: ${MOAG_STATUS_DEFINITIONS.length}件`);
  console.log(`  - ムーブメントテンプレート: ${MOAG_MOVEMENT_TEMPLATES.length}件`);
  console.log(`  - 案件フィールド定義: ${MOAG_PROJECT_FIELDS.length}件`);
}
```

### 6.3 upsert の複合ユニーク制約

seed の `upsert` で使用する複合ユニーク制約を Prisma スキーマに定義する必要がある。

```prisma
model BusinessStatusDefinition {
  // ... フィールド定義 ...

  @@unique([businessId, statusCode], map: "uq_status_business_code")
}

model MovementTemplate {
  // ... フィールド定義 ...

  @@unique([businessId, stepCode], map: "uq_template_business_code")
}
```

### 6.4 main 関数への統合

```typescript
// prisma/seed.ts

async function main() {
  // Phase 0/1 のシードデータ（既存）
  await seedPhase0Data(prisma);
  await seedPhase1Data(prisma);

  // Phase 2 のシードデータ（新規追加）
  await seedPhase2Data(prisma);
}
```

---

## 7. 実装チェックリスト

### Prismaスキーマ
- [ ] `BusinessStatusDefinition` モデル追加
- [ ] `MovementTemplate` モデル追加
- [ ] `Business` モデルに `businessProjectPrefix` カラム追加
- [ ] `BusinessStatusDefinition` に `@@unique([businessId, statusCode])` 追加
- [ ] `MovementTemplate` に `@@unique([businessId, stepCode])` 追加
- [ ] マイグレーション実行

### シードスクリプト
- [ ] `MOAG_STATUS_DEFINITIONS` 定数定義
- [ ] `MOAG_MOVEMENT_TEMPLATES` 定数定義
- [ ] `MOAG_PROJECT_FIELDS` 定数定義
- [ ] `seedPhase2Data()` 関数実装
- [ ] `main()` に `seedPhase2Data()` 呼び出し追加
- [ ] `npx prisma db seed` で正常投入を確認
- [ ] 再実行時の冪等性確認（upsert が正常動作すること）
