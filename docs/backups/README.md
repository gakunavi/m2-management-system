# 本番の設定を直す前の控え

事業マスタのカスタム項目定義など、**本番 DB の設定を直す前の状態**をそのまま置く。
お客様のデータ（案件・顧客の値）は置かない。

## ファイル

| ファイル | 中身 | 取った日 |
|---------|------|---------|
| `light-project-fields-20261107-before.json` | ライト事業の案件カスタム項目定義 29件（「中企庁ステータス」への改名と工業会・中企庁の日付8件を足す前） | 2026-11-07 |

## 戻し方

`scripts/light-project-date-fields.js` の `MODE=restore` に控えをそのまま渡す。
`projectFields` を控えの内容で置き換え、`version` を1つ上げる（他の設定は触らない）。

```bash
sh scripts/run-prod-task.sh scripts/light-project-date-fields.js \
  MODE=restore RESTORE_JSON="$(python3 -c 'import json,sys;print(json.dumps(json.load(open("docs/backups/light-project-fields-20261107-before.json")),ensure_ascii=False))')"
```

- 戻すと足した8項目は画面から消えるが、**入力済みの値は `project_custom_data` に残る**
  （定義が無い間は画面に出ないだけ）。同じキーで定義を足し直せばまた出る
- ECS の command 上書きは 8192 バイト上限。控えが大きいときは項目を分けて渡すこと
