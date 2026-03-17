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
];
