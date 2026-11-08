#!/bin/sh
# ============================================
# 環境B(manage.1quon.com / AWS 367012942826)で単発タスクを実行する
# ============================================
#
# RDS は非公開サブネットにあるため、DBに触るにはVPC内からしか到達できない。
# 稼働中のサービスと同じネットワーク設定を引き写して、コマンドだけ差し替えた
# Fargate タスクを1回だけ起動する。
#
# repair-env-b.js は稼働中のイメージには入っていない（デプロイ済みの古いイメージ）。
# デプロイを挟まずに直せるよう、スクリプト本文をそのまま `node -e` に流し込む。
#
# 使い方:
#   AWS_PROFILE=<環境Bのプロファイル> sh scripts/run-env-b-task.sh                    # 調査のみ
#   AWS_PROFILE=<環境Bのプロファイル> sh scripts/run-env-b-task.sh --fix-duplicates
#   AWS_PROFILE=<環境Bのプロファイル> sh scripts/run-env-b-task.sh --set-password=a@b.com
#   AWS_PROFILE=<環境Bのプロファイル> sh scripts/run-env-b-task.sh --verify --email=a@b.com
#
# 引数を省略すると調査のみ（DBを変更しない）。
set -e

REGION=ap-northeast-1
CLUSTER=m2-cluster-b
SERVICE=m2-service-b
CONTAINER=app

if [ -z "$AWS_PROFILE" ]; then
  echo "AWS_PROFILE を指定してください（環境B: アカウント 367012942826）" >&2
  exit 1
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [ "$ACCOUNT" != "367012942826" ]; then
  echo "アカウントが違います: $ACCOUNT （環境Bは 367012942826）" >&2
  exit 1
fi

# ECS の command 上書きは 8192 バイト上限。コメントを削った .min.js を埋め込む
SCRIPT_PATH="$(dirname "$0")/repair-env-b.min.js"
if [ ! -f "$SCRIPT_PATH" ]; then
  echo "$SCRIPT_PATH が見つかりません" >&2
  exit 1
fi

echo "[1/4] 稼働中サービスからネットワーク設定とタスク定義を取得"
SVC=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION")
TASKDEF=$(echo "$SVC" | python3 -c 'import sys,json;print(json.load(sys.stdin)["services"][0]["taskDefinition"])')
SUBNETS=$(echo "$SVC" | python3 -c 'import sys,json;print(",".join(json.load(sys.stdin)["services"][0]["networkConfiguration"]["awsvpcConfiguration"]["subnets"]))')
SGS=$(echo "$SVC" | python3 -c 'import sys,json;print(",".join(json.load(sys.stdin)["services"][0]["networkConfiguration"]["awsvpcConfiguration"]["securityGroups"]))')
# パブリックIPはサービスに合わせる。DISABLED にすると NAT / VPCエンドポイントが無い構成では
# Secrets Manager に届かず ResourceInitializationError でタスクが起動しない。
PUBIP=$(echo "$SVC" | python3 -c 'import sys,json;print(json.load(sys.stdin)["services"][0]["networkConfiguration"]["awsvpcConfiguration"].get("assignPublicIp","ENABLED"))')
echo "      taskDefinition=$TASKDEF"
echo "      subnets=$SUBNETS"
echo "      securityGroups=$SGS"
echo "      assignPublicIp=$PUBIP"

# スクリプト本文を `node -e <本文> <フラグ...>` としてコマンド上書きに載せる。
# 引用符の取り回しを誤らないよう JSON の組み立ては python3 に任せ、ファイル渡しで実行する。
# フラグは argv ではなく REPAIR_ARGS 環境変数で渡す。
# `node -e <code> --diff` は node が --diff を自身のオプションとして解釈して落ちるため。
python3 - "$CONTAINER" "$SCRIPT_PATH" "$@" > /tmp/m2b-overrides.json <<'PY'
import json, sys
container, script_path = sys.argv[1], sys.argv[2]
flags = [f[2:] if f.startswith('--') else f for f in sys.argv[3:]]
code = open(script_path, encoding='utf-8').read()
print(json.dumps({
    "containerOverrides": [
        {
            "name": container,
            "command": ["node", "-e", code],
            "environment": [{"name": "REPAIR_ARGS", "value": " ".join(flags)}],
        }
    ]
}))
PY

OV_SIZE=$(wc -c < /tmp/m2b-overrides.json | tr -d ' ')
if [ "$OV_SIZE" -gt 8192 ]; then
  echo "上書きJSONが $OV_SIZE バイトで上限8192を超えています。スクリプトを削ってください" >&2
  exit 1
fi

echo "[2/4] タスク起動: repair-env-b.min.js $* (overrides ${OV_SIZE}B)"
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASKDEF" \
  --launch-type FARGATE \
  --region "$REGION" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SGS],assignPublicIp=$PUBIP}" \
  --overrides file:///tmp/m2b-overrides.json \
  --query 'tasks[0].taskArn' --output text)
echo "      $TASK_ARN"

echo "[3/4] 完了待ち"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION"

TASK_ID=$(basename "$TASK_ARN")
LOG_GROUP=$(aws ecs describe-task-definition --task-definition "$TASKDEF" --region "$REGION" \
  --query "taskDefinition.containerDefinitions[?name=='$CONTAINER']|[0].logConfiguration.options.\"awslogs-group\"" --output text)
LOG_PREFIX=$(aws ecs describe-task-definition --task-definition "$TASKDEF" --region "$REGION" \
  --query "taskDefinition.containerDefinitions[?name=='$CONTAINER']|[0].logConfiguration.options.\"awslogs-stream-prefix\"" --output text)

echo "[4/4] 出力"
if ! aws logs get-log-events \
  --log-group-name "$LOG_GROUP" \
  --log-stream-name "$LOG_PREFIX/$CONTAINER/$TASK_ID" \
  --region "$REGION" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n'; then
  # ログが無い＝コンテナが起動する前に落ちている。ECS 側の停止理由を出す
  echo "ログがありません。タスクの停止理由:"
  aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION" \
    --query 'tasks[0].{stopCode:stopCode,reason:stoppedReason,exit:containers[0].exitCode}'
fi
