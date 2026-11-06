#!/bin/sh
# ============================================
# 本番(manage.gakunavi.co.jp / AWS 480845173144)で単発タスクを実行する
# ============================================
#
# RDS(m2-db)は非公開サブネットにあり、ECS Exec も無効なので、DBに触るには
# 稼働中サービスと同じネットワーク設定のタスクを1回だけ起動するしかない。
# スクリプト本文をそのまま `node -e` に流し込むので、デプロイを挟まずに実行できる。
#
# 使い方:
#   sh scripts/run-prod-task.sh <スクリプト.js> [KEY=VALUE ...]
# 例:
#   sh scripts/run-prod-task.sh scripts/light-project-date-fields.js MODE=dump
#   sh scripts/run-prod-task.sh scripts/light-project-date-fields.js MODE=apply
#
# ECS の command 上書きは 8192 バイト上限。超えたらコメントを削って渡すこと。
set -e

# aws CLI は Intel 版と Apple Silicon 版が両方入っていることがある。動く方を使う
AWS=${AWS_CLI:-aws}
if ! "$AWS" --version >/dev/null 2>&1; then
  for candidate in /opt/homebrew/bin/aws /usr/local/bin/aws; do
    if "$candidate" --version >/dev/null 2>&1; then AWS="$candidate"; break; fi
  done
fi
if ! "$AWS" --version >/dev/null 2>&1; then
  echo "aws CLI が実行できません" >&2
  exit 1
fi

REGION=ap-northeast-1
CLUSTER=m2-cluster
SERVICE=m2-service
CONTAINER=app

SCRIPT_PATH="$1"
shift || true
if [ -z "$SCRIPT_PATH" ] || [ ! -f "$SCRIPT_PATH" ]; then
  echo "実行するスクリプトを指定してください（例: scripts/light-project-date-fields.js）" >&2
  exit 1
fi

ACCOUNT=$("$AWS" sts get-caller-identity --query Account --output text)
if [ "$ACCOUNT" != "480845173144" ]; then
  echo "アカウントが違います: $ACCOUNT （本番は 480845173144）" >&2
  exit 1
fi

echo "[1/4] 稼働中サービスからネットワーク設定とタスク定義を取得"
SVC=$("$AWS" ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION")
TASKDEF=$(echo "$SVC" | python3 -c 'import sys,json;print(json.load(sys.stdin)["services"][0]["taskDefinition"])')
NET=$(echo "$SVC" | python3 -c 'import sys,json;n=json.load(sys.stdin)["services"][0]["networkConfiguration"]["awsvpcConfiguration"];print(",".join(n["subnets"]));print(",".join(n["securityGroups"]));print(n.get("assignPublicIp","ENABLED"))')
SUBNETS=$(echo "$NET" | sed -n 1p)
SGS=$(echo "$NET" | sed -n 2p)
PUBIP=$(echo "$NET" | sed -n 3p)
echo "      taskDefinition=$TASKDEF assignPublicIp=$PUBIP"

# 環境変数は argv ではなく environment で渡す（`node -e <code> --flag` は node 自身が解釈して落ちる）
python3 - "$CONTAINER" "$SCRIPT_PATH" "$@" > /tmp/m2-prod-overrides.json <<'PY'
import json, sys
container, script_path = sys.argv[1], sys.argv[2]
env = []
for pair in sys.argv[3:]:
    name, _, value = pair.partition('=')
    env.append({"name": name, "value": value})
code = open(script_path, encoding='utf-8').read()
print(json.dumps({
    "containerOverrides": [{"name": container, "command": ["node", "-e", code], "environment": env}]
}, ensure_ascii=False))
PY

OV_SIZE=$(wc -c < /tmp/m2-prod-overrides.json | tr -d ' ')
if [ "$OV_SIZE" -gt 8192 ]; then
  echo "上書きJSONが $OV_SIZE バイトで上限8192を超えています" >&2
  exit 1
fi

echo "[2/4] タスク起動: $SCRIPT_PATH $* (overrides ${OV_SIZE}B)"
TASK_ARN=$("$AWS" ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASKDEF" \
  --launch-type FARGATE \
  --region "$REGION" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SGS],assignPublicIp=$PUBIP}" \
  --overrides file:///tmp/m2-prod-overrides.json \
  --query 'tasks[0].taskArn' --output text)
echo "      $TASK_ARN"

echo "[3/4] 完了待ち"
"$AWS" ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION"

TASK_ID=$(basename "$TASK_ARN")
LOG_GROUP=$("$AWS" ecs describe-task-definition --task-definition "$TASKDEF" --region "$REGION" \
  --query "taskDefinition.containerDefinitions[?name=='$CONTAINER']|[0].logConfiguration.options.\"awslogs-group\"" --output text)
LOG_PREFIX=$("$AWS" ecs describe-task-definition --task-definition "$TASKDEF" --region "$REGION" \
  --query "taskDefinition.containerDefinitions[?name=='$CONTAINER']|[0].logConfiguration.options.\"awslogs-stream-prefix\"" --output text)

echo "[4/4] 出力"
if ! "$AWS" logs get-log-events \
  --log-group-name "$LOG_GROUP" \
  --log-stream-name "$LOG_PREFIX/$CONTAINER/$TASK_ID" \
  --region "$REGION" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n'; then
  echo "ログがありません。タスクの停止理由:"
  "$AWS" ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION" \
    --query 'tasks[0].{stopCode:stopCode,reason:stoppedReason,exit:containers[0].exitCode}'
fi
