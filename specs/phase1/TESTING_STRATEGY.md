# Phase 1: テスト自動化戦略

> **対象スコープ**: 顧客マスタCRUD、代理店マスタCRUD、事業定義管理

---

## 1. テスト戦略概要

### 1.1 テストピラミッド

```
        ╔═══════════╗
        ║  E2E (5%) ║  ← ログイン→CRUD→ログアウトの主要フロー
        ╠═══════════╣
        ║ 統合 (25%)║  ← APIルート + Prisma + DB のエンドツーエンド
        ╠═══════════╣
        ║ 単体 (70%)║  ← バリデーション、ビジネスロジック、フック、ユーティリティ
        ╚═══════════╝
```

### 1.2 テストツールスタック

| ツール | 用途 | バージョン |
|---|---|---|
| Jest | テストランナー・アサーション | ^29.x |
| Testing Library (@testing-library/react) | Reactコンポーネントテスト | ^15.x |
| MSW (Mock Service Worker) | APIモック | ^2.x |
| Playwright | E2Eテスト | ^1.x |
| Faker.js (@faker-js/faker) | テストデータ生成 | ^8.x |

### 1.3 カバレッジ目標

| 対象 | 行カバレッジ目標 | 分岐カバレッジ目標 |
|---|---|---|
| バリデーション（Zodスキーマ） | 95%以上 | 90%以上 |
| ビジネスロジック（採番、排他制御等） | 90%以上 | 85%以上 |
| APIルートハンドラー | 85%以上 | 80%以上 |
| 共通フック | 80%以上 | 75%以上 |
| UIコンポーネント | 70%以上 | - |
| E2E | 主要フロー100% | - |

---

## 2. 単体テスト

### 2.1 バリデーションテスト

各エンティティのZodスキーマに対するテスト。

```typescript
// __tests__/validations/customer.test.ts

import { customerCreateSchema, customerUpdateSchema } from "@/lib/validations/customer";

describe("customerCreateSchema", () => {
  const validData = {
    customerName: "株式会社テスト",
    customerPostalCode: "100-0001",
    customerAddress: "東京都千代田区",
    customerPhone: "03-1234-5678",
    customerEmail: "test@example.com",
    industryId: 1, // IT・ソフトウェア
  };

  it("正常なデータでバリデーション成功", () => {
    const result = customerCreateSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("顧客名が空の場合エラー", () => {
    const result = customerCreateSchema.safeParse({ ...validData, customerName: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("顧客名は必須です");
  });

  it("顧客名が200文字超の場合エラー", () => {
    const result = customerCreateSchema.safeParse({ ...validData, customerName: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("メールアドレスの形式が不正な場合エラー", () => {
    const result = customerCreateSchema.safeParse({ ...validData, customerEmail: "invalid" });
    expect(result.success).toBe(false);
  });

  it("電話番号の形式が不正な場合エラー", () => {
    const result = customerCreateSchema.safeParse({ ...validData, customerPhone: "abcdefg" });
    expect(result.success).toBe(false);
  });

  it("任意フィールドがnullでも成功", () => {
    const result = customerCreateSchema.safeParse({ customerName: "最小データ" });
    expect(result.success).toBe(true);
  });
});
```

**テストケース一覧（バリデーション）**:

| エンティティ | テストケース数 | 主要カバー範囲 |
|---|---|---|
| 顧客作成スキーマ | 15件 | 必須チェック、文字数制限、形式検証、任意フィールド |
| 顧客更新スキーマ | 12件 | 部分更新、version必須、既存値保持 |
| 代理店作成スキーマ | 15件 | 必須チェック、代理店種別、手数料率範囲 |
| 代理店更新スキーマ | 12件 | 部分更新、循環参照チェック |
| 事業作成スキーマ | 10件 | 必須チェック、business_config構造 |
| ステータス定義スキーマ | 8件 | 排他制御、色コード形式 |
| ムーブメントテンプレートスキーマ | 8件 | 必須ステップ、ソート順 |

### 2.2 ビジネスロジックテスト

```typescript
// __tests__/logic/code-generator.test.ts

import { generateCustomerCode } from "@/lib/logic/code-generator";

describe("generateCustomerCode", () => {
  it("最初の顧客コードはCST-0001", async () => {
    const mockPrisma = { customer: { findFirst: jest.fn().mockResolvedValue(null) } };
    const code = await generateCustomerCode(mockPrisma as any);
    expect(code).toBe("CST-0001");
  });

  it("既存の最大コードから+1のコードを生成", async () => {
    const mockPrisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ customerCode: "CST-0042" }),
      },
    };
    const code = await generateCustomerCode(mockPrisma as any);
    expect(code).toBe("CST-0043");
  });

  it("ユニーク制約違反時にexponential backoffでリトライ", async () => {
    const mockPrisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ customerCode: "CST-0001" }),
        create: jest
          .fn()
          .mockRejectedValueOnce(new Error("Unique constraint"))
          .mockRejectedValueOnce(new Error("Unique constraint"))
          .mockResolvedValue({ customerCode: "CST-0003" }),
      },
    };
    // リトライ後に成功すること
    // backoff間隔が50ms, 100msであること
  });

  it("5回リトライ後に503エラー", async () => {
    const mockPrisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ customerCode: "CST-0001" }),
        create: jest.fn().mockRejectedValue(new Error("Unique constraint")),
      },
    };
    await expect(generateCustomerCode(mockPrisma as any)).rejects.toThrow("CODE_GENERATION_FAILED");
  });
});
```

```typescript
// __tests__/logic/optimistic-lock.test.ts

describe("楽観的ロック", () => {
  it("version一致時に更新成功", async () => {
    // version=5のレコードに対してversion=5で更新 → 成功
  });

  it("version不一致時に409エラー", async () => {
    // version=6のレコードに対してversion=5で更新 → VERSION_CONFLICT
  });

  it("409レスポンスにcurrentVersion, updatedBy, updatedAtが含まれる", async () => {
    // エラー詳細の構造を検証
  });
});
```

```typescript
// __tests__/logic/status-exclusion.test.ts

describe("営業ステータス排他制御", () => {
  it("statusIsFinal=trueに設定すると既存のstatusIsFinal=trueがfalseになる", async () => {
    // トランザクション内で排他制御が動作
  });

  it("statusIsLost=trueに設定すると既存のstatusIsLost=trueがfalseになる", async () => {
    // 同上
  });

  it("statusIsFinal=trueかつstatusIsLost=trueは400エラー", async () => {
    // バリデーションエラー
  });
});
```

### 2.3 ユーティリティテスト

```typescript
// __tests__/utils/case-converter.test.ts

describe("toCamelCase / toSnakeCase", () => {
  it("snake_caseをcamelCaseに変換", () => {
    expect(toCamelCase({ customer_name: "テスト" })).toEqual({ customerName: "テスト" });
  });

  it("ネストされたオブジェクトも変換", () => {
    expect(toCamelCase({ user_data: { first_name: "太郎" } }))
      .toEqual({ userData: { firstName: "太郎" } });
  });

  it("配列内のオブジェクトも変換", () => {
    expect(toCamelCase([{ item_name: "A" }, { item_name: "B" }]))
      .toEqual([{ itemName: "A" }, { itemName: "B" }]);
  });

  it("null/undefinedはそのまま返す", () => {
    expect(toCamelCase(null)).toBeNull();
    expect(toCamelCase(undefined)).toBeUndefined();
  });
});
```

---

## 3. 統合テスト

### 3.1 APIルートテスト

```typescript
// __tests__/api/customers.test.ts

import { createMocks } from "node-mocks-http";
import { GET, POST } from "@/app/api/v1/customers/route";
import { prisma } from "@/lib/prisma";

// テスト用DBセットアップ（テスト専用DBを使用）
beforeAll(async () => {
  await prisma.$executeRaw`TRUNCATE TABLE customers CASCADE`;
  // シードデータ投入
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/customers", () => {
  it("認証済みユーザーで一覧取得成功", async () => {
    const { req, res } = createMocks({ method: "GET" });
    // セッションモック設定
    await GET(req);
    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta).toHaveProperty("total");
  });

  it("未認証で401エラー", async () => {
    const { req, res } = createMocks({ method: "GET" });
    // セッションなし
    await GET(req);
    expect(res._getStatusCode()).toBe(401);
  });

  it("ページネーションが正しく動作", async () => {
    const { req, res } = createMocks({
      method: "GET",
      query: { page: "2", pageSize: "10" },
    });
    await GET(req);
    const body = JSON.parse(res._getData());
    expect(body.meta.page).toBe(2);
    expect(body.meta.pageSize).toBe(10);
  });

  it("検索クエリでフィルタリング", async () => {
    const { req, res } = createMocks({
      method: "GET",
      query: { search: "サンプルテック" },
    });
    await GET(req);
    const body = JSON.parse(res._getData());
    expect(body.data.every((c: any) =>
      c.customerName.includes("サンプルテック") || c.customerCode.includes("サンプルテック")
    )).toBe(true);
  });

  it("pageSize上限100を超えた場合100にクランプ", async () => {
    const { req, res } = createMocks({
      method: "GET",
      query: { pageSize: "200" },
    });
    await GET(req);
    const body = JSON.parse(res._getData());
    expect(body.meta.pageSize).toBe(100);
  });
});

describe("POST /api/v1/customers", () => {
  it("正常なデータで顧客作成成功", async () => {
    // 201レスポンス、自動採番コード、created_by設定
  });

  it("バリデーションエラーで400", async () => {
    // customerName欠落 → 400 VALIDATION_ERROR
  });

  it("重複コードで409", async () => {
    // ユニーク制約違反 → 409 DUPLICATE_ENTRY
  });
});
```

### 3.2 テスト対象APIエンドポイント一覧

| エンドポイント | テストケース数 | 主要テスト内容 |
|---|---|---|
| GET /api/v1/customers | 8件 | 認証、ページネーション、検索、ソート、フィルター |
| POST /api/v1/customers | 5件 | 作成成功、バリデーション、重複、権限 |
| GET /api/v1/customers/:id | 4件 | 取得成功、404、権限、関連データ |
| PUT /api/v1/customers/:id | 6件 | 更新成功、バリデーション、楽観的ロック、404 |
| DELETE /api/v1/customers/:id | 4件 | 論理削除、404、権限、関連データ確認 |
| GET /api/v1/partners | 8件 | 同上 |
| POST /api/v1/partners | 6件 | 作成成功、循環参照チェック、手数料率検証 |
| PUT /api/v1/partners/:id | 7件 | 更新成功、階層変更制約、楽観的ロック |
| GET /api/v1/partners/:id/hierarchy | 3件 | 階層ツリー取得、深度制限、循環参照 |
| POST /api/v1/businesses/:id/statuses | 5件 | 作成成功、排他制御（isFinal/isLost） |
| PUT /api/v1/businesses/:id/statuses/:sid | 5件 | 更新成功、排他制御、ソート順変更 |
| PATCH /api/v1/businesses/:id/movement-templates/reorder | 3件 | 並び替え、ソート順検証 |

---

## 4. E2Eテスト

### 4.1 Playwright テスト構成

```typescript
// e2e/customer-crud.spec.ts

import { test, expect } from "@playwright/test";

test.describe("顧客マスタCRUD", () => {
  test.beforeEach(async ({ page }) => {
    // ログイン
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@example.com");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");
  });

  test("顧客一覧表示 → 検索 → 詳細 → 編集 → 保存", async ({ page }) => {
    // 1. 一覧画面へ遷移
    await page.click('a[href="/customers"]');
    await expect(page.locator("h1")).toHaveText("顧客一覧");

    // 2. テーブルにデータが表示される
    await expect(page.locator("table tbody tr")).toHaveCount(5); // シードデータ5件

    // 3. 検索
    await page.fill('input[placeholder*="検索"]', "サンプルテック");
    await page.waitForTimeout(500); // デバウンス待ち
    await expect(page.locator("table tbody tr")).toHaveCount(1);

    // 4. 詳細画面へ遷移
    await page.click("table tbody tr:first-child");
    await expect(page.locator("h1")).toContainText("株式会社サンプルテック");

    // 5. 編集画面へ
    await page.click('button:has-text("編集")');
    await page.fill('input[name="customerPhone"]', "03-9999-0000");
    await page.click('button:has-text("保存")');

    // 6. 保存成功のトースト
    await expect(page.locator('[role="alert"]')).toContainText("更新しました");
  });

  test("顧客新規作成", async ({ page }) => {
    await page.click('a[href="/customers"]');
    await page.click('a[href="/customers/new"]');

    await page.fill('input[name="customerName"]', "E2Eテスト株式会社");
    await page.fill('input[name="customerPhone"]', "03-0000-1111");
    await page.fill('input[name="customerEmail"]', "e2e@test.co.jp");
    await page.click('button:has-text("保存")');

    await expect(page.locator('[role="alert"]')).toContainText("作成しました");
    // 一覧に戻って新規作成したデータが存在する
  });

  test("顧客削除（論理削除）", async ({ page }) => {
    await page.click('a[href="/customers"]');
    await page.click("table tbody tr:first-child");
    await page.click('button:has-text("削除")');

    // 確認モーダル
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.click('button:has-text("削除する")');

    await expect(page.locator('[role="alert"]')).toContainText("削除しました");
  });

  test("バリデーションエラー表示", async ({ page }) => {
    await page.click('a[href="/customers"]');
    await page.click('a[href="/customers/new"]');

    // 必須フィールドを空のまま保存
    await page.click('button:has-text("保存")');

    // エラーメッセージ表示
    await expect(page.locator('text="顧客名は必須です"')).toBeVisible();
  });
});
```

### 4.2 E2Eテストシナリオ一覧

| テストシナリオ | 優先度 | 所要時間目安 |
|---|---|---|
| 顧客CRUD完全フロー（一覧→作成→詳細→編集→削除） | High | 30秒 |
| 代理店CRUD完全フロー | High | 30秒 |
| 事業定義ステータス管理（作成→並替→編集→削除） | High | 25秒 |
| ムーブメントテンプレート管理（ドラッグ&ドロップ並替） | Medium | 20秒 |
| 検索・フィルター・ソート・ページネーション | Medium | 20秒 |
| 楽観的ロック競合シナリオ（2ブラウザ同時編集） | Medium | 25秒 |
| 権限制御（staff/partner_adminの操作制限） | High | 20秒 |
| エラーハンドリング（バリデーション、404、500） | Medium | 15秒 |

---

## 5. テストデータ管理

### 5.1 テスト用DBセットアップ

```yaml
# docker-compose.test.yml
services:
  test-db:
    image: postgres:16
    environment:
      POSTGRES_DB: management_system_test
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: app_password
    ports:
      - "5433:5432"  # 開発用と別ポート
```

```env
# .env.test
DATABASE_URL=postgresql://app_user:app_password@localhost:5433/management_system_test
NEXTAUTH_SECRET=test-secret-key-for-testing
NEXTAUTH_URL=http://localhost:3000
```

### 5.2 テストデータファクトリー

```typescript
// __tests__/factories/customer.factory.ts

import { faker } from "@faker-js/faker/locale/ja";

export function buildCustomer(overrides: Partial<CustomerCreateInput> = {}) {
  return {
    customerName: faker.company.name(),
    customerRepresentativeName: faker.person.fullName(),
    customerPostalCode: faker.location.zipCode("###-####"),
    customerAddress: faker.location.streetAddress(),
    customerPhone: faker.phone.number("0#-####-####"),
    customerEmail: faker.internet.email(),
    industryId: faker.helpers.arrayElement([1, 2, 3, 4, 5, 6]),
    customerEmployeeCount: faker.number.int({ min: 10, max: 10000 }),
    ...overrides,
  };
}

export function buildPartner(overrides: Partial<PartnerCreateInput> = {}) {
  return {
    partnerName: faker.company.name(),
    partnerType: faker.helpers.arrayElement(["法人", "個人"]),
    partnerPhone: faker.phone.number("0#-####-####"),
    partnerEmail: faker.internet.email(),
    partnerCommissionRate: faker.number.float({ min: 5, max: 30, fractionDigits: 1 }),
    ...overrides,
  };
}
```

### 5.3 大規模データ生成（性能テスト用）

```typescript
// scripts/generate-test-data.ts

import { prisma } from "@/lib/prisma";
import { buildCustomer, buildPartner } from "../__tests__/factories";

async function generateLargeDataset() {
  console.log("Generating 10,000 customers...");
  const customers = Array.from({ length: 10000 }, (_, i) =>
    buildCustomer({ customerCode: `CST-${String(i + 1).padStart(5, "0")}` })
  );

  // バッチインサート（1000件ずつ）
  for (let i = 0; i < customers.length; i += 1000) {
    await prisma.customer.createMany({ data: customers.slice(i, i + 1000) });
    console.log(`  ${i + 1000} / 10000 inserted`);
  }

  console.log("Generating 5,000 partners...");
  const partners = Array.from({ length: 5000 }, (_, i) =>
    buildPartner({ partnerCode: `AG-${String(i + 1).padStart(5, "0")}` })
  );

  for (let i = 0; i < partners.length; i += 1000) {
    await prisma.partner.createMany({ data: partners.slice(i, i + 1000) });
    console.log(`  ${i + 1000} / 5000 inserted`);
  }

  console.log("Done!");
}

generateLargeDataset();
```

---

## 6. CI/CDパイプライン統合

### 6.1 GitHub Actions設定

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  integration-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: management_system_test
          POSTGRES_USER: app_user
          POSTGRES_PASSWORD: app_password
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://app_user:app_password@localhost:5433/management_system_test
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://app_user:app_password@localhost:5433/management_system_test

  e2e-test:
    runs-on: ubuntu-latest
    needs: [unit-test, integration-test]
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: management_system_test
          POSTGRES_USER: app_user
          POSTGRES_PASSWORD: app_password
        ports:
          - 5433:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx prisma migrate deploy && npx prisma db seed
        env:
          DATABASE_URL: postgresql://app_user:app_password@localhost:5433/management_system_test
      - run: npm run build
        env:
          DATABASE_URL: postgresql://app_user:app_password@localhost:5433/management_system_test
      - run: npx playwright test
        env:
          DATABASE_URL: postgresql://app_user:app_password@localhost:5433/management_system_test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### 6.2 package.json スクリプト

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --config jest.integration.config.ts --runInBand",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:performance": "tsx scripts/generate-test-data.ts && npm run test:integration -- --testPathPattern=performance",
    "type-check": "tsc --noEmit",
    "lint": "next lint"
  }
}
```

---

## 7. 性能テスト

### 7.1 性能テストケース

```typescript
// __tests__/performance/customer-list.perf.test.ts

describe("顧客一覧API性能テスト", () => {
  // 前提: scripts/generate-test-data.ts で10,000件投入済み

  it("10,000件でのページネーション取得が500ms以内", async () => {
    const start = performance.now();
    const response = await fetch("/api/v1/customers?page=1&pageSize=25");
    const elapsed = performance.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });

  it("10,000件での検索クエリが800ms以内", async () => {
    const start = performance.now();
    const response = await fetch("/api/v1/customers?search=株式会社");
    const elapsed = performance.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(800);
  });

  it("ソート+フィルター複合クエリが800ms以内", async () => {
    const start = performance.now();
    const response = await fetch(
      "/api/v1/customers?sortField=customerName&sortDirection=asc&industryId=3"
    );
    const elapsed = performance.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(800);
  });

  it("pageSize=100での取得が500ms以内", async () => {
    const start = performance.now();
    const response = await fetch("/api/v1/customers?page=1&pageSize=100");
    const elapsed = performance.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });
});
```

### 7.2 性能テスト実行チェックリスト

- [ ] テスト用DBに顧客10,000件、代理店5,000件のデータを投入
- [ ] 一覧取得（pageSize=25）が500ms以内
- [ ] 一覧取得（pageSize=100）が500ms以内
- [ ] 検索クエリ（部分一致）が800ms以内
- [ ] ソート+フィルター複合クエリが800ms以内
- [ ] 50件同時バッチ削除が2000ms以内
- [ ] Lighthouse Performanceスコア80以上（一覧画面）
- [ ] ブラウザNetwork タブでN+1クエリが発生していないこと

---

## 8. テスト実装チェックリスト

### Phase 1 テスト実装のゲート基準

#### Step T1: テスト基盤セットアップ
- [ ] Jest + Testing Library インストール・設定完了
- [ ] MSW セットアップ完了
- [ ] Playwright インストール・設定完了
- [ ] テスト用DB（docker-compose.test.yml）起動確認
- [ ] `npm test` でサンプルテスト成功
- [ ] `npm run test:e2e` でサンプルE2Eテスト成功

#### Step T2: バリデーション単体テスト
- [ ] 顧客Zodスキーマ: 15テストケース全て合格
- [ ] 代理店Zodスキーマ: 15テストケース全て合格
- [ ] 事業Zodスキーマ: 10テストケース全て合格
- [ ] ステータス/ムーブメントスキーマ: 16テストケース全て合格
- [ ] カバレッジ: バリデーション 95%以上

#### Step T3: ビジネスロジック単体テスト
- [ ] 採番ロジック: リトライ・exponential backoff動作確認
- [ ] 楽観的ロック: version競合時の409レスポンス検証
- [ ] 営業ステータス排他制御: isFinal/isLostの排他動作検証
- [ ] case変換ユーティリティ: 全パターン合格
- [ ] カバレッジ: ビジネスロジック 90%以上

#### Step T4: 統合テスト
- [ ] 顧客APIルート: 8テストケース合格
- [ ] 代理店APIルート: 8テストケース合格
- [ ] 事業定義APIルート: 8テストケース合格
- [ ] 認証・権限テスト: 全ロールの操作制限確認
- [ ] カバレッジ: APIルート 85%以上

#### Step T5: E2Eテスト
- [ ] 顧客CRUD完全フロー: 合格
- [ ] 代理店CRUD完全フロー: 合格
- [ ] 事業定義管理フロー: 合格
- [ ] 権限制御フロー: 合格
- [ ] エラーハンドリングフロー: 合格

#### Step T6: 性能テスト
- [ ] テストデータ生成スクリプト動作確認
- [ ] 全性能テストケース合格（セクション7.2チェックリスト）
- [ ] インデックス有無での性能差を計測・記録

**🚫 ゲート**: 全ステップ合格後に Phase 1 テスト完了とする。
