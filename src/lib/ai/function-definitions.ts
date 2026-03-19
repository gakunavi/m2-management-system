// ============================================
// AI アシスタント: OpenAI Function 定義
// ============================================

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const aiFunctions: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_kpi_summary',
      description:
        '売上実績、達成率、受注件数、案件総数などのKPIサマリーを取得します。「今月の売上は？」「受注見込みは何件？」「達成率は？」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: '対象月 (YYYY-MM形式)。省略時は当月。例: "2026-03"',
          },
          business_id: {
            type: 'number',
            description: '事業ID。省略時は全事業横断で集計。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline',
      description:
        '営業パイプライン（ステータス別の案件数と金額）を取得します。「パイプラインの状況は？」「ステータス別の内訳は？」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: '対象月 (YYYY-MM形式)。省略時は当月。',
          },
          business_id: {
            type: 'number',
            description: '事業ID。省略時は全事業横断。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_partner_ranking',
      description:
        '代理店別の売上ランキングを取得します。「一番売ってる代理店は？」「代理店ランキングを見せて」「代理店の一覧を表にして」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: '対象月 (YYYY-MM形式)。省略時は当月。',
          },
          business_id: {
            type: 'number',
            description: '事業ID (必須)。',
          },
          limit: {
            type: 'number',
            description: '取得件数上限。デフォルト: 20。',
          },
        },
        required: ['business_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_revenue_trend',
      description:
        '月別の売上推移（目標 vs 実績）を取得します。「売上推移を見せて」「年間の売上は？」「先月と比べて売上どう？」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'number',
            description: '年度（4月始まり）。省略時は当年度。',
          },
          business_id: {
            type: 'number',
            description: '事業ID。省略時は全事業横断。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_list',
      description:
        '案件（契約マスタ）の一覧を取得します。「案件一覧を見せて」「受注済みの案件は？」「○○社の案件は？」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          business_id: {
            type: 'number',
            description: '事業ID。省略時は全事業横断。',
          },
          status: {
            type: 'string',
            description: '営業ステータスコードでフィルタ。例: "won", "lost", "negotiation"',
          },
          search: {
            type: 'string',
            description: '検索文字列（顧客名、代理店名、案件番号で部分一致検索）。',
          },
          limit: {
            type: 'number',
            description: '取得件数上限。デフォルト: 20。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_detail',
      description:
        '案件の詳細情報を取得します。案件番号を指定して「XX-0042の詳細は？」「この案件のサマリーを作って」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          project_no: {
            type: 'string',
            description: '案件番号。例: "XX-0042"',
          },
        },
        required: ['project_no'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_business_list',
      description:
        '事業マスタの一覧を取得します。「事業一覧」「どんな事業がある？」などの質問に使います。代理店ランキング等で business_id が必要な場合にも事前にこの関数で確認できます。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_list',
      description:
        '顧客マスタの一覧を検索・取得します。「顧客一覧」「○○社の情報は？」「法人顧客は何件？」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: '検索文字列（顧客名、顧客コードで部分一致検索）。',
          },
          customer_type: {
            type: 'string',
            description: '顧客区分でフィルタ。例: "法人", "個人"',
          },
          limit: {
            type: 'number',
            description: '取得件数上限。デフォルト: 20。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_partner_list',
      description:
        '代理店マスタの一覧を検索・取得します。「代理店一覧」「Tier1の代理店は？」「代理店の連絡先」などの質問に使います。階層・Tier情報付き。',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: '検索文字列（代理店名、代理店コードで部分一致検索）。',
          },
          tier: {
            type: 'string',
            description: 'Tier（階層レベル）でフィルタ。例: "Tier1", "1次"',
          },
          limit: {
            type: 'number',
            description: '取得件数上限。デフォルト: 20。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_kpi_comparison',
      description:
        '2つの期間のKPIを比較し、差分と変化率を返します。「先月と比べて売上どう？」「1月と3月を比較して」「前月比の受注率は？」などの比較・分析の質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          month_a: {
            type: 'string',
            description: '比較元の月 (YYYY-MM形式)。例: "2026-02"',
          },
          month_b: {
            type: 'string',
            description: '比較先の月 (YYYY-MM形式)。例: "2026-03"',
          },
          business_id: {
            type: 'number',
            description: '事業ID。省略時は全事業横断で比較。',
          },
        },
        required: ['month_a', 'month_b'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_partner_performance_change',
      description:
        '代理店のパフォーマンス変化を分析します。指定した2つの月の代理店別実績を比較し、大幅な変動（増加・減少）を検出します。「代理店の成績変化は？」「先月から受注が減った代理店は？」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          month_a: {
            type: 'string',
            description: '比較元の月 (YYYY-MM形式)。例: "2026-02"',
          },
          month_b: {
            type: 'string',
            description: '比較先の月 (YYYY-MM形式)。例: "2026-03"',
          },
          business_id: {
            type: 'number',
            description: '事業ID (必須)。',
          },
        },
        required: ['month_a', 'month_b', 'business_id'],
      },
    },
  },
  // ============================================
  // タスク管理系
  // ============================================
  {
    type: 'function',
    function: {
      name: 'get_my_tasks',
      description:
        '自分が担当しているタスクの一覧を取得します。「今日のタスクは？」「期限超過のタスクは？」「マイタスクを見せて」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done', 'on_hold'],
            description: 'ステータスでフィルター。省略時は完了以外の全ステータス。',
          },
          due_filter: {
            type: 'string',
            enum: ['overdue', 'today', 'this_week', 'all'],
            description:
              '期限フィルター。overdue=期限超過、today=今日期限、this_week=今週期限、all=全て。省略時はall。',
          },
          board_id: {
            type: 'number',
            description: 'ボードIDでフィルター。省略時は全ボード+マイタスク。',
          },
          limit: {
            type: 'number',
            description: '取得件数上限。デフォルト10。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_detail',
      description:
        'タスク番号またはIDでタスクの詳細情報を取得します。「TASK-0001の詳細は？」「タスクID 5の状況は？」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          task_no: {
            type: 'string',
            description: 'タスク番号。例: "TASK-0001"',
          },
          task_id: {
            type: 'number',
            description: 'タスクID。task_noが指定されている場合は不要。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_board_tasks',
      description:
        'グループボードのタスク一覧を取得します。「営業チームのタスクは？」「ボードの状況は？」などの質問に使います。',
      parameters: {
        type: 'object',
        properties: {
          board_id: {
            type: 'number',
            description: 'ボードID。必須。',
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done', 'on_hold'],
            description: 'ステータスでフィルター。省略時は全ステータス。',
          },
          limit: {
            type: 'number',
            description: '取得件数上限。デフォルト20。',
          },
        },
        required: ['board_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        '新しいタスクを作成します。「A社への提案タスクを作成して」「明日までにレポートを書くタスクを追加」などの指示に使います。',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'タスク名。必須。',
          },
          description: {
            type: 'string',
            description: '説明文。省略可。',
          },
          priority: {
            type: 'string',
            enum: ['urgent', 'high', 'medium', 'low'],
            description: '優先度。デフォルトはmedium。',
          },
          due_date: {
            type: 'string',
            description: '期限。YYYY-MM-DD形式。省略可。',
          },
          board_id: {
            type: 'number',
            description: 'ボードID。省略時はマイタスク。',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_status',
      description:
        'タスクのステータスを変更します。「TASK-0001を完了にして」「タスクID 3を進行中にして」などの指示に使います。',
      parameters: {
        type: 'object',
        properties: {
          task_no: {
            type: 'string',
            description: 'タスク番号。例: "TASK-0001"',
          },
          task_id: {
            type: 'number',
            description: 'タスクID。task_noが指定されている場合は不要。',
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done', 'on_hold'],
            description: '変更先のステータス。必須。',
          },
        },
        required: ['status'],
      },
    },
  },
];
