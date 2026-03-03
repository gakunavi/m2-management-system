# Phase 1 設計書 - 複数専門家レビュー総合レポート

**レビュー実施日**: 2026-02-19
**改善適用日**: 2026-02-21
**対象**: Phase 1 詳細設計書（顧客・代理店・事業定義・API仕様）
**レビュアー**: システムアーキテクト、セキュリティエンジニア、品質エンジニア

### 改善対応状況（2026-02-21 追記）

以下の改善を各設計書に適用済み:

| 改善項目 | 対象ファイル | 状態 |
|---------|------------|------|
| 反社チェック関連フィールドの完全削除 | CUSTOMER_DESIGN, PARTNER_DESIGN | ✅ 完了 |
| 楽観的ロック競合時のUX仕様（Server Wins戦略） | CUSTOMER_DESIGN, PARTNER_DESIGN, API_ENDPOINTS | ✅ 完了 |
| 性能要件・レスポンスタイム目標 | API_ENDPOINTS, BUSINESS_DESIGN | ✅ 完了 |
| 推奨インデックス設計 | CUSTOMER_DESIGN, PARTNER_DESIGN, BUSINESS_DESIGN | ✅ 完了 |
| 採番リトライロジック強化（exponential backoff, 5回） | CUSTOMER_DESIGN, PARTNER_DESIGN | ✅ 完了 |
| business_configスキーマ厳格化（.strict()） | BUSINESS_DESIGN | ✅ 完了 |
| 営業ステータス排他制御（API層自動排他） | BUSINESS_DESIGN | ✅ 完了 |
| テスト自動化戦略 | TESTING_STRATEGY.md（新規作成） | ✅ 完了 |
| エラーハンドリング詳細（エラーコード拡張、ネットワークエラー） | API_ENDPOINTS | ✅ 完了 |
| 運用監視（監査ログ、APIメトリクス、ヘルスチェック拡張） | API_ENDPOINTS | ✅ 完了 |

---

## エグゼクティブサマリー

### 総合評価

| 評価軸 | スコア | 状態 |
|-------|--------|------|
| **アーキテクチャ** | 7.5/10 | 🟡 改善推奨 |
| **セキュリティ** | 7.0/10 | 🟡 重要な改善必要 |
| **品質・テスト** | 7.8/10 | 🟡 テスト戦略強化必要 |
| **全体平均** | **7.4/10** | 🟡 実装前に対処推奨 |

### 重大な問題

| 優先度 | カテゴリ | 問題 | 影響 |
|--------|---------|------|------|
| 🔴 Critical | セキュリティ | 水平アクセス制御の欠如 | 代理店間データ漏洩リスク |
| 🔴 Critical | セキュリティ | JWT検証・セッション管理の不備 | セッションハイジャック、権限昇格 |
| 🔴 Critical | アーキテクチャ | N+1クエリ問題への対処不足 | パフォーマンス劣化 |
| 🟡 High | アーキテクチャ | 楽観的ロックのトランザクション境界不明瞭 | データ不整合リスク |

### 改善推奨数

- **重大な問題 (Critical)**: 3件
- **改善推奨 (High)**: 10件
- **推奨事項 (Medium)**: 7件

---

## 1. アーキテクチャレビュー詳細

### 🔴 重大な問題

#### 1.1 N+1クエリ問題への対処不足

**問題の詳細**:
顧客・代理店一覧APIで集計値（`contactCount`, `projectCount`）を取得する際、個別クエリが発生し、パフォーマンスが劣化する

**影響**:
- 顧客数1,000件の一覧表示で1,001回のクエリ実行
- レスポンスタイムが2秒を超える可能性
- データベース負荷の増大

**推奨対策**:
```typescript
// Prisma Relation Countを使用
const customers = await prisma.customer.findMany({
  include: {
    _count: {
      select: {
        contacts: true,
        projects: true,
        businessLinks: true
      }
    }
  }
});

// レスポンスマッピング
const data = customers.map(c => ({
  ...c,
  contactCount: c._count.contacts,
  projectCount: c._count.projects,
  _count: undefined // 内部プロパティを削除
}));
```

**実装時の追加**:
- API仕様書に推奨実装パターンを明記
- ページサイズの最大値を100に制限（根拠を文書化）

#### 1.2 楽観的ロックのトランザクション境界が不明瞭

**問題の詳細**:
親レコード（customer）と子レコード（contacts, business_links）を同時更新する場合の楽観的ロック適用範囲が曖昧

**影響**:
- 子レコード更新が失敗しても親レコードは更新される
- データ不整合の発生

**推奨対策**:
設計方針を明確化:
- **採用案**: 子レコードは独立したエンドポイントで管理し、親のversionには影響させない（現在の設計に準拠）
- 理由: 担当者追加だけで顧客レコード全体の競合が発生するのは実務上不便

**文書化すべき内容**:
```markdown
## 楽観的ロックの適用範囲

### 対象テーブル
- customers, partners, projects（主要マスタのみ）

### 非対象（意図的）
- customer_contacts, partner_contacts（子レコード）
- customer_business_links, partner_business_links（リンクテーブル）

### 理由
子レコードの追加・編集で親レコードのversionがインクリメントされると、
無関係な編集操作で楽観的ロック競合が頻発し、UXが低下するため。

### トレードオフ
親レコード編集中に子レコードが変更されても競合検出されない。
ただし、業務上、親と子の同時編集競合は稀であり、許容可能。
```

### 🟡 改善推奨

#### 1.3 代理店階層の2種類管理における一貫性保証

**問題**: `link_hierarchy_level`の形式検証が不足

**推奨**:
```typescript
const hierarchyLevelSchema = z
  .string()
  .regex(/^[1-9](-[1-9])*$/, '階層レベルは "1", "1-2", "2-1" 形式で入力してください')
  .refine(
    (val) => val.split('-').length <= 3,
    { message: '階層の深さは最大3階層までです' }
  )
  .optional();
```

#### 1.4 事業固有設定（business_config）のスキーマ進化戦略

**推奨**: バージョン管理の導入
```json
{
  "version": "1.0",
  "projectFields": { ... },
  "customerFields": { ... }
}
```

マイグレーション戦略を文書化:
- 新フィールド追加: デフォルト値を持たせる
- フィールド削除: 旧データは保持、UI非表示
- フィールド名変更: データ移行スクリプト実装

#### 1.5 コード採番の競合リトライ戦略

**推奨**: エクスポネンシャルバックオフの導入
```typescript
async function generateCustomerCode(prisma: PrismaClient): Promise<string> {
  const maxRetries = 5; // 3→5に増加
  const baseDelay = 50; // ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const code = await generateCodeInternal(prisma);
      return code;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, attempt)); // 50ms, 100ms, 200ms...
      }
    }
  }
  throw new Error('採番失敗: 同時実行が多すぎます');
}
```

### ✅ 良い設計

1. **事業ごとの営業ステータス定義の分離** - 拡張性が高く、マルチテナント要件に適合
2. **顧客担当者の事業別対応** - 実ビジネスの要件を適切に反映
3. **snake_case/camelCaseの変換ルール明確化** - 型安全性とコード可読性の向上
4. **楽観的ロックの対象テーブル選定** - オーバーエンジニアリングを避けつつデータ整合性確保
5. **論理削除の統一ポリシー** - データ監査要件対応、誤削除防止

---

## 2. セキュリティレビュー詳細

### 🔴 重大な脆弱性

#### 2.1 A01: Broken Access Control - 水平アクセス制御の欠如

**OWASP分類**: A01 (最重要)

**脆弱性の詳細**:
代理店ユーザーが他社の顧客・案件にアクセスできる可能性。APIレベルでの強制実装が不明確。

**具体的なシナリオ**:
1. 代理店Aのユーザーが `GET /api/v1/customers/123` にアクセス
2. 顧客123が代理店Bに紐づく場合でも、ロールチェックのみで通過
3. 代理店Aのユーザーが代理店Bの顧客情報を閲覧可能

**推奨実装**:
```typescript
// API実装時に必須のアクセス制御パターン
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const customerId = parseInt(params.id);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { businessLinks: true },
  });

  // 🛡️ セキュリティチェック: 水平アクセス制御
  if (session.user.role === "partner_admin" || session.user.role === "partner_staff") {
    const userPartnerBusinessIds = await getUserPartnerBusinessIds(session.user.partnerId);
    const customerBusinessIds = customer.businessLinks.map(link => link.businessId);
    const hasAccess = customerBusinessIds.some(bid => userPartnerBusinessIds.includes(bid));

    if (!hasAccess) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  return NextResponse.json({ success: true, data: customer });
}
```

**必要なドキュメント追加**:
- ロールベース認可 (RBAC) の実装詳細
- 水平アクセス制御のチェックロジック
- リソース所有権検証のミドルウェア実装例

#### 2.2 A07: JWTトークン検証・セッション管理の不備

**OWASP分類**: A07

**脆弱性の詳細**:
- 署名検証アルゴリズムの指定なし
- トークン有効期限の明記なし
- リフレッシュトークンの仕様なし
- セッション無効化（ログアウト）の実装なし

**影響**:
- トークン漏洩時、期限切れまで不正利用可能
- 権限変更後も古いトークンが有効
- セッションハイジャック

**推奨実装**:
```typescript
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 🛡️ 8時間で期限切れ
  },
  jwt: {
    signingKey: process.env.NEXTAUTH_SECRET,
    encryption: true, // 🛡️ JWEによる暗号化
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // 🛡️ ロール変更時のトークン更新
      if (trigger === "update") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true, isActive: true }
        });
        if (!dbUser || !dbUser.isActive) {
          throw new Error("User inactive or deleted");
        }
        token.role = dbUser.role;
      }
      return token;
    },
  },
};
```

**API_ENDPOINTS.mdに追記**:
- JWT署名アルゴリズム: RS256推奨 (非対称鍵)
- トークン有効期限: 8時間
- リフレッシュトークン有効期限: 30日
- ログアウトAPIの仕様追加
- トークンブラックリスト実装 (Redis推奨)

#### 2.3 A03: SQLインジェクションのリスク

**OWASP分類**: A03

**問題箇所**: コード自動採番ロジック
```typescript
const numPart = parseInt(lastCustomer.customerCode.replace(PREFIX, ""), 10);
```

**推奨対策**:
```typescript
async function generateCustomerCode(prisma: PrismaClient): Promise<string> {
  const PREFIX = "CST-";
  const CODE_REGEX = /^CST-\d{4}$/;

  const lastCustomer = await prisma.customer.findFirst({
    where: {
      customerCode: {
        startsWith: PREFIX,
        regex: "^CST-\\d{4}$" // 🛡️ 厳格なフィルタリング
      }
    },
    orderBy: { customerCode: "desc" },
  });

  if (lastCustomer) {
    // 🛡️ フォーマット検証
    if (!CODE_REGEX.test(lastCustomer.customerCode)) {
      throw new Error("Invalid customer code format in database");
    }
    const numPart = parseInt(lastCustomer.customerCode.replace(PREFIX, ""), 10);
    if (isNaN(numPart)) {
      throw new Error("Invalid customer code number");
    }
    return `${PREFIX}${String(numPart + 1).padStart(4, "0")}`;
  }

  return `${PREFIX}0001`;
}
```

### 🟡 改善推奨

#### 2.4 レート制限の欠如

**推奨**: Upstash Redisを使用したレート制限
```typescript
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"), // 10リクエスト/10秒
});
```

**ドキュメント追記**:
- レート制限: 10リクエスト/10秒 (IP単位)
- 認証済みユーザー: 100リクエスト/分
- バッチAPI: 10リクエスト/時

#### 2.5 バリデーションの強化

**推奨**:
```typescript
// 電話番号: 国際形式対応
customerPhone: z
  .string()
  .regex(/^[\d\s\-+().]+$/, "電話番号の形式が正しくありません")
  .max(20, "電話番号は20文字以内です")
  .optional();

// メールアドレス: 使い捨てドメインブロック（オプション）
customerEmail: z
  .string()
  .email()
  .max(255)
  .refine(
    (email) => {
      const disposable = ["tempmail.com", "10minutemail.com"];
      return !disposable.includes(email.split("@")[1]);
    }
  );
```

#### 2.6 一括操作のリソース制限

**推奨**:
```typescript
export const batchDeleteSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "最低1件のIDが必要です")
    .max(100, "一度に処理できるのは100件までです"), // 🛡️ DoS対策
});
```

### ✅ 良い対策

1. **Zodによるバリデーション** - 型安全なバリデーションスキーマ
2. **楽観的ロック** - 同時編集による競合検出
3. **論理削除** - データの永続的保持、誤削除からの復旧
4. **監査ログの自動記録** - 全変更履歴の追跡、コンプライアンス対応
5. **準備済みステートメント (Prisma)** - ORMによるSQLインジェクション対策

---

## 3. 品質・テストレビュー詳細

### テスト戦略の課題

#### 3.1 単体テストの不足

**不足しているテスト範囲**:
- 顧客コード自動採番 (`generateCustomerCode`)
- 代理店階層の循環参照防止 (`validateNoCircularReference`)
- 契約期間チェック (`getContractStatus`)
- Zodバリデーションスキーマの境界値テスト

**推奨テストケース**:
```typescript
describe('generateCustomerCode', () => {
  test('初回採番で CST-0001 を生成', async () => {});
  test('既存最大値から +1 した値を生成', async () => {});
  test('UNIQUE制約違反時に3回リトライ', async () => {});
  test('3回リトライ後にエラーをスロー', async () => {});
  test('並行実行時の競合を処理', async () => {});
});

describe('validateNoCircularReference', () => {
  test('A → B → C の階層で C の親を A に設定するとエラー', async () => {});
  test('最大深度10階層での検証', async () => {});
  test('正常な親子関係を許可（A → B → C → D）', async () => {});
});
```

#### 3.2 統合テストの不足

**推奨テスト範囲**:
- 顧客担当者の主担当制約
- 楽観的ロックの競合シナリオ
- 事業ステータス定義の並び替えトランザクション

**推奨テストケース**:
```typescript
test('主担当を切り替えると既存の主担当が自動解除される', async () => {
  // 1. 顧客に担当者Aを追加し、主担当に設定
  // 2. 担当者Bを追加し、主担当に設定
  // 3. 担当者Aの contactIsPrimary が false になることを確認
  // 4. 担当者Bの contactIsPrimary が true であることを確認
});
```

#### 3.3 E2Eテストの不足

**推奨テスト範囲**:
- 顧客新規登録からアポまでのフロー
- 代理店階層構造の表示
- 事業ステータス定義の並び替え

**推奨テストケース** (Playwright):
```typescript
test('顧客新規登録から詳細表示までのフロー', async ({ page }) => {
  await page.goto('/customers');
  await page.click('text=新規作成');
  await page.fill('[name="customerName"]', '株式会社テスト');
  await page.click('text=保存');
  await expect(page).toHaveURL(/\/customers\/\d+/);
  await expect(page.locator('text=CST-')).toBeVisible();
});
```

### 受け入れ基準の改善点

#### 3.4 曖昧な記述の具体化

**Before**:
> テーブルの「顧客コード」ヘッダーをクリック → ソート切り替え

**After**:
> テーブルの「顧客コード」ヘッダーをクリック → 昇順→降順→ソート解除の3段階で切り替わることを確認。各状態で ↑ / ↓ / アイコンなし が表示される。

#### 3.5 エッジケースの追加

**不足しているエッジケース**:
- 顧客コード採番で9999件登録後の動作（CST-9999 → CST-10000）
- 親代理店を論理削除した場合の子代理店の表示
- 手数料率に 0.00 / 100.00 / 100.01 を設定した場合

#### 3.6 ゲート基準の強化

**現状**:
> 全項目が ✅ になるまで次のStepに進まない

**推奨**:
```markdown
**ゲート基準**:
1. ✅ 機能要件: 上記の確認チェック項目が全て完了
2. ✅ 品質要件:
   - 単体テストカバレッジ ≥ 80%
   - ESLintエラー: 0件
   - TypeScriptコンパイルエラー: 0件
3. ✅ パフォーマンス要件:
   - API平均レスポンスタイム < 500ms（ローカル環境）
4. ✅ セキュリティ要件:
   - 水平アクセス制御の実装確認
   - バリデーション網羅性の確認
5. ✅ ドキュメント:
   - API仕様書更新済み
   - コンポーネントのJSDocコメント記述済み
```

### ✅ 良い設計

1. **楽観的ロックによる競合制御** - Prisma Middlewareで透過的に実装
2. **監査ログの自動記録** - 運用時のトレーサビリティ確保
3. **設定オブジェクトによる宣言的UI構築** - コード重複削減、保守性向上
4. **Zodによる共通バリデーション** - サーバー・クライアント共通スキーマ
5. **段階的な実装チェックリスト** - Step単位でゲートを設けて品質担保

---

## 4. 優先対応リスト

### 🔴 即座に対応すべき項目（Phase 1実装前）

| # | カテゴリ | 項目 | 影響度 | 工数見積 |
|---|---------|------|--------|---------|
| 1 | セキュリティ | 水平アクセス制御の実装 | ★★★ | 3日 |
| 2 | セキュリティ | JWT検証・セッション管理の強化 | ★★★ | 2日 |
| 3 | アーキテクチャ | N+1クエリ対策の明確化 | ★★★ | 1日 |
| 4 | セキュリティ | レート制限の導入 | ★★☆ | 1日 |
| 5 | 品質 | ゲート基準にテストカバレッジ追加 | ★★☆ | 0.5日 |

### 🟡 Phase 1実装中に対応すべき項目

| # | カテゴリ | 項目 | 影響度 | 工数見積 |
|---|---------|------|--------|---------|
| 6 | アーキテクチャ | 楽観的ロックのトランザクション境界文書化 | ★★☆ | 0.5日 |
| 7 | セキュリティ | バリデーション強化（境界値、形式） | ★★☆ | 1日 |
| 8 | 品質 | 単体テストの作成 | ★★☆ | 3日 |
| 9 | 品質 | 統合テストの作成 | ★★☆ | 2日 |
| 10 | セキュリティ | CSRF保護の明確化 | ★☆☆ | 0.5日 |
| 11 | アーキテクチャ | 代理店階層バリデーション強化 | ★☆☆ | 1日 |

### 🟢 Phase 1完了後に対応すべき項目

| # | カテゴリ | 項目 | 影響度 | 工数見積 |
|---|---------|------|--------|---------|
| 12 | 品質 | E2Eテストの作成 | ★☆☆ | 2日 |
| 13 | 品質 | パフォーマンステスト | ★☆☆ | 1日 |
| 14 | アーキテクチャ | business_configバージョン管理 | ★☆☆ | 1日 |
| 15 | セキュリティ | 監査ログアクセス制御 | ★☆☆ | 0.5日 |

---

## 5. 実装時チェックリスト

### セキュリティチェックリスト

各APIエンドポイント実装時に以下を確認:

- [ ] 認証トークンの検証 (JWT署名・有効期限)
- [ ] ロールベース認可の実装 (RBAC)
- [ ] 水平アクセス制御 (リソース所有権確認)
- [ ] 入力バリデーション (Zodスキーマ)
- [ ] レート制限の適用
- [ ] CSRFトークン検証 (状態変更API)
- [ ] 機微情報の暗号化
- [ ] 監査ログの記録
- [ ] エラーレスポンスの情報漏洩防止
- [ ] SQLインジェクション対策 (Prisma使用確認)

### パフォーマンスチェックリスト

- [ ] N+1クエリの防止 (Relation Count使用)
- [ ] ページネーション実装
- [ ] インデックスの適切な設定
- [ ] 不要なデータのロード防止 (select句の活用)
- [ ] レスポンスタイム目標の確認 (< 500ms)

### 品質チェックリスト

- [ ] 単体テストカバレッジ ≥ 80%
- [ ] 統合テスト実装
- [ ] E2Eテスト実装（クリティカルフロー）
- [ ] ESLintエラー: 0件
- [ ] TypeScriptコンパイルエラー: 0件
- [ ] 受け入れ基準の全項目確認
- [ ] エッジケースのテスト実装
- [ ] ドキュメント更新（API仕様書、コメント）

---

## 6. 結論

### 全体評価

Phase 1設計書は全体として堅牢で実用的なアーキテクチャを構築しています。特に以下の点が高く評価できます:

✅ **優れた設計**:
- 事業別の柔軟な設定管理（マルチテナント対応）
- 論理削除の一貫したポリシー
- 楽観的ロックの適切な適用
- 設定オブジェクトによる宣言的UI構築

⚠️ **重要な課題**:
ただし、セキュリティ面で**3件の重大な脆弱性**が発見されました。特に水平アクセス制御の欠如は、代理店間のデータ漏洩リスクを伴うため、実装前に必ず対処する必要があります。

### 推奨アクション

1. **即座に対応**（Phase 1実装開始前）:
   - セキュリティ脆弱性3件の対策実装（水平アクセス制御、JWT検証・セッション管理、SQLインジェクション対策）
   - N+1クエリ対策の明確化
   - ゲート基準へのテストカバレッジ追加

2. **実装中に対応**:
   - テスト戦略の実装（単体・統合・E2E）
   - バリデーション強化
   - ドキュメント改善

3. **実装後に対応**:
   - パフォーマンステスト
   - アクセシビリティ監査
   - ビジュアルリグレッションテスト

### 成功基準

Phase 1実装完了時、以下の基準を全て満たすことを目標とします:

- [ ] セキュリティスコア: 8.0/10以上
- [ ] アーキテクチャスコア: 8.0/10以上
- [ ] 品質スコア: 8.5/10以上
- [ ] 全ての重大な脆弱性が解消
- [ ] テストカバレッジ ≥ 80%
- [ ] APIレスポンスタイム < 500ms（ローカル環境）

本レビューで指摘された項目を優先度に従って対処することで、セキュアで高品質なPhase 1実装が実現できます。
