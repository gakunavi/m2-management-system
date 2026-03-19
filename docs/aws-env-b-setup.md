# 環境B AWS セットアップガイド

同じGitリポジトリから2つ目のAWS環境にデプロイするための手順書。

## 構成概要

```
Git リポジトリ (1つ)
  ├── 環境A (既存)
  │   ├── deploy.yml        → mainブランチpush時に自動デプロイ
  │   ├── task-definition.json
  │   └── AWS Account: 480845173144
  │
  └── 環境B (新規)
      ├── deploy-b.yml      → 手動トリガーでデプロイ
      ├── task-definition-b.json
      └── AWS Account: 367012942826
```

## デプロイの違い

| 項目 | 環境A | 環境B |
|------|-------|-------|
| トリガー | mainブランチpush時に自動 | 手動（GitHub Actions画面から） |
| ワークフロー | `.github/workflows/deploy.yml` | `.github/workflows/deploy-b.yml` |
| タスク定義 | `.aws/task-definition.json` | `.aws/task-definition-b.json` |
| GitHub Secret | `AWS_ROLE_ARN` | `AWS_ROLE_ARN_B` |
| ECRリポジトリ | `m2-management-system` | `m2-management-system-b` |
| ECSクラスタ | `m2-cluster` | `m2-cluster-b` |
| ECSサービス | `m2-service` | `m2-service-b` |

---

## Step 1: AWS アカウント/リソース作成

### 1.1 ECR リポジトリ

```bash
aws ecr create-repository \
  --repository-name m2-management-system-b \
  --region ap-northeast-1
```

### 1.2 RDS (PostgreSQL)

```bash
aws rds create-db-instance \
  --db-instance-identifier m2-db-b \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16 \
  --master-username postgres \
  --master-user-password <パスワード> \
  --allocated-storage 20 \
  --backup-retention-period 30 \
  --region ap-northeast-1
```

### 1.3 S3 バケット

```bash
aws s3 mb s3://m2-management-system-b-uploads --region ap-northeast-1

aws s3api put-bucket-versioning \
  --bucket m2-management-system-b-uploads \
  --versioning-configuration Status=Enabled
```

### 1.4 CloudWatch ロググループ

```bash
aws logs create-log-group \
  --log-group-name /ecs/m2-management-system-b \
  --region ap-northeast-1
```

---

## Step 2: IAM ロール作成

### 2.1 ECS タスク実行ロール

```bash
# ロール作成
aws iam create-role \
  --role-name m2-ecs-execution-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

# ポリシーアタッチ
aws iam attach-role-policy \
  --role-name m2-ecs-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Secrets Manager アクセス用インラインポリシー
aws iam put-role-policy \
  --role-name m2-ecs-execution-role \
  --policy-name SecretsAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:ap-northeast-1:*:secret:m2b/*"
    }]
  }'
```

### 2.2 ECS タスクロール（S3アクセス用）

```bash
aws iam create-role \
  --role-name m2-ecs-task-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam put-role-policy \
  --role-name m2-ecs-task-role \
  --policy-name S3Access \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::m2-management-system-b-uploads",
        "arn:aws:s3:::m2-management-system-b-uploads/*"
      ]
    }]
  }'
```

### 2.3 GitHub Actions OIDC ロール

```bash
# OIDC プロバイダー作成（アカウントで初めての場合）
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# デプロイ用ロール
aws iam create-role \
  --role-name m2-github-actions-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::367012942826:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/m2-management-system:*"
        }
      }
    }]
  }'

# ECR + ECS デプロイに必要なポリシー
aws iam put-role-policy \
  --role-name m2-github-actions-role \
  --policy-name DeployAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "ecs:DescribeServices",
          "ecs:UpdateService",
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": "iam:PassRole",
        "Resource": [
          "arn:aws:iam::367012942826:role/m2-ecs-execution-role",
          "arn:aws:iam::367012942826:role/m2-ecs-task-role"
        ]
      }
    ]
  }'
```

---

## Step 3: Secrets Manager にシークレット登録

```bash
# データベース接続URL
aws secretsmanager create-secret \
  --name m2b/database-url \
  --secret-string "postgresql://postgres:<パスワード>@<RDSエンドポイント>:5432/management_system?schema=public"

# NextAuth URL（環境Bのドメイン）
aws secretsmanager create-secret \
  --name m2b/nextauth-url \
  --secret-string "https://manage.1quon.com"

# NextAuth シークレット（新しいランダム値を生成）
aws secretsmanager create-secret \
  --name m2b/nextauth-secret \
  --secret-string "$(openssl rand -base64 32)"

# メール API キー
aws secretsmanager create-secret \
  --name m2b/email-api-key \
  --secret-string "<ResendのAPIキー>"

# メール送信元
aws secretsmanager create-secret \
  --name m2b/email-from \
  --secret-string "noreply@1quon.com"

# S3 バケット名
aws secretsmanager create-secret \
  --name m2b/s3-bucket \
  --secret-string "m2-management-system-b-uploads"

# Cron シークレット
aws secretsmanager create-secret \
  --name m2b/cron-secret \
  --secret-string "$(openssl rand -hex 32)"
```

---

## Step 4: ECS クラスタ & サービス作成

### 4.1 VPC / サブネット / セキュリティグループ

環境Aと同様にVPCを構築するか、既存VPCを使用。
ALBのセキュリティグループでポート443/80を許可し、ECSタスクのSGでALBからの3000番ポートのみ許可。

### 4.2 ECS クラスタ

```bash
aws ecs create-cluster --cluster-name m2-cluster-b
```

### 4.3 ALB (Application Load Balancer)

AWS Console またはCLIで作成:
- ターゲットグループ: ポート3000、ヘルスチェック `/api/health`
- HTTPS リスナー: ACM証明書を設定

### 4.4 ECS サービス

```bash
aws ecs create-service \
  --cluster m2-cluster-b \
  --service-name m2-service-b \
  --task-definition m2-management-system-b \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-xxxxx", "subnet-yyyyy"],
      "securityGroups": ["sg-xxxxx"],
      "assignPublicIp": "ENABLED"
    }
  }' \
  --load-balancers '[{
    "targetGroupArn": "arn:aws:elasticloadbalancing:...:targetgroup/m2-tg-b/...",
    "containerName": "app",
    "containerPort": 3000
  }]'
```

---

## Step 5: タスク定義の更新

`.aws/task-definition-b.json` のプレースホルダーを実際の値に置換:

1. `367012942826` → 新AWSアカウントID
2. `XXXXXX` → 各シークレットの自動生成サフィックス

シークレットのARN確認:
```bash
aws secretsmanager list-secrets --filter Key=name,Values=m2b/ \
  --query 'SecretList[].{Name:Name, ARN:ARN}' --output table
```

---

## Step 6: GitHub Secrets 設定

リポジトリの Settings > Secrets and variables > Actions に追加:

| Secret名 | 値 |
|-----------|-----|
| `AWS_ROLE_ARN_B` | `arn:aws:iam::367012942826:role/m2-github-actions-role` |

既存の `AWS_ROLE_ARN` (環境A) はそのまま残す。

---

## Step 7: DB マイグレーション

初回デプロイ後、ECSタスクの `docker-entrypoint.sh` が自動で `prisma migrate deploy` を実行。

もしベースラインが必要な場合:
```bash
# RDSに直接接続して実行
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

---

## Step 8: 初期データ投入

```bash
DATABASE_URL="postgresql://..." npx prisma db seed
```

---

## デプロイ方法

### 環境A（自動）
`main` ブランチにpushすると自動デプロイ。

### 環境B（手動）
1. GitHub > Actions > "Deploy to AWS ECS (環境B)"
2. "Run workflow" をクリック
3. ブランチを選択（通常は `main`）
4. "Run workflow" を実行

---

## 環境Bを自動デプロイに変更する場合

`deploy-b.yml` の `on:` セクションを変更:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

これで環境Aと同様にmainブランチpush時に自動デプロイされます。

---

## トラブルシューティング

### デプロイ失敗時
```bash
# ECSサービスのイベント確認
aws ecs describe-services --cluster m2-cluster-b --services m2-service-b \
  --query 'services[0].events[:5]'

# タスクのログ確認
aws logs tail /ecs/m2-management-system-b --follow
```

### ヘルスチェック失敗
- RDSのセキュリティグループでECSタスクからの5432アクセスが許可されているか確認
- Secrets Manager のシークレット値が正しいか確認
- `docker-entrypoint.sh` でのマイグレーション失敗ログを確認
