# 統合管理システム - 仕様書ガイド

## ドキュメント一覧

| ファイル | 内容 | kiroでの使い方 |
|---------|------|--------------|
| `00_PROJECT_PRD.md` | プロジェクト全体のPRD | kiroのプロジェクトコンテキストとして読み込ませる |
| `01_DATA_MODEL.md` | データモデル設計（全テーブル定義） | kiroがPrismaスキーマを生成する際の参照 |
| `02_COMPONENT_DESIGN.md` | 共通コンポーネント設計方針 | kiroがコンポーネント実装する際の設計ルール |
| `03_PHASE0_PRD.md` | Phase 0のPRD（最初にkiroに渡す） | kiroのspec生成の入力として使用 |
| `04_EXISTING_SPECS.md` | 現システムから引き継ぐ仕様 | Phase 2以降で事業固有の実装をする際に参照 |

## kiroでの活用手順

### Step 1: プロジェクト作成

```
新しいプロジェクトディレクトリで:
1. kiroでプロジェクトを開く
2. 00_PROJECT_PRD.md をプロジェクトのコンテキストとして設定
```

### Step 2: Phase 0 の仕様生成

```
kiroに以下を指示:
「03_PHASE0_PRD.md の内容に基づいてspecを生成してください。
 01_DATA_MODEL.md と 02_COMPONENT_DESIGN.md も設計ルールとして参照してください。」
```

kiroが生成するspec:
- requirements.md（要件）
- design.md（設計）
- tasks.md（タスク）

### Step 3: Phase 0 の実装

kiroが生成したtasksに沿って実装を進める。

### Step 4: Phase 1 以降

Phase 0が完了したら、次のPhase用のPRDを作成し、同じ流れで進める。

各フェーズのPRDはこのディレクトリに追加していく:
```
specs/
├── 00_PROJECT_PRD.md          ← 全体（常時参照）
├── 01_DATA_MODEL.md           ← 全体（常時参照）
├── 02_COMPONENT_DESIGN.md     ← 全体（常時参照）
├── 03_PHASE0_PRD.md           ← Phase 0 用
├── 04_EXISTING_SPECS.md       ← 引き継ぎ仕様（Phase 2以降で参照）
├── 05_PHASE1_PRD.md           ← Phase 1 用（後で作成）
├── 06_PHASE2_PRD.md           ← Phase 2 用（後で作成）
└── ...
```

## ドキュメントの読み方

### kiroに最初に渡すもの（Phase 0開始時）

**必須:**
1. `00_PROJECT_PRD.md` - プロジェクトの全体像を理解させる
2. `03_PHASE0_PRD.md` - Phase 0の具体的な実装要件

**参考として:**
3. `01_DATA_MODEL.md` - テーブル定義と命名規則
4. `02_COMPONENT_DESIGN.md` - コンポーネント設計方針

### 特に注意すべき設計ルール

以下は全フェーズで守るべき原則。kiroに繰り返し伝える必要がある場合がある:

1. **命名規則**: 01_DATA_MODEL.md のセクション3を参照
2. **Config-Driven Architecture**: 02_COMPONENT_DESIGN.md のセクション1.2を参照
3. **統一レスポンス形式**: 00_PROJECT_PRD.md のセクション7.1を参照
4. **エンティティ非依存のフック設計**: 02_COMPONENT_DESIGN.md のセクション4を参照

## 今後の更新

実装が進むにつれて、これらの仕様書は実際のコードと乖離する可能性がある。
その場合は、コードを正として仕様書を更新する（コードが真実）。
