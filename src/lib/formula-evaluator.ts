/**
 * 安全な数式パーサー＋評価器。
 * eval() を使わず再帰降下パーサーで四則演算・括弧・フィールド参照を処理する。
 *
 * 対応:
 *   - 四則演算: +, -, *, /
 *   - 括弧: ()
 *   - 数値リテラル: 123, 1.5, .5
 *   - 単項マイナス: -price
 *   - フィールド参照: [a-z_][a-z0-9_]* 形式
 *
 * 参照先が null/undefined → 結果も null
 * ゼロ除算 → null
 */

import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// トークナイザー
// ============================================

type TokenType = 'NUMBER' | 'IDENT' | 'PLUS' | 'MINUS' | 'MUL' | 'DIV' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = formula.length;

  while (i < len) {
    const ch = formula[i];

    // 空白スキップ
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 数値リテラル
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < len && /[0-9.]/.test(formula[i])) {
        num += formula[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // 識別子（フィールド参照）
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < len && /[a-zA-Z0-9_]/.test(formula[i])) {
        ident += formula[i];
        i++;
      }
      tokens.push({ type: 'IDENT', value: ident });
      continue;
    }

    // 演算子・括弧
    switch (ch) {
      case '+': tokens.push({ type: 'PLUS', value: '+' }); break;
      case '-': tokens.push({ type: 'MINUS', value: '-' }); break;
      case '*': tokens.push({ type: 'MUL', value: '*' }); break;
      case '/': tokens.push({ type: 'DIV', value: '/' }); break;
      case '(': tokens.push({ type: 'LPAREN', value: '(' }); break;
      case ')': tokens.push({ type: 'RPAREN', value: ')' }); break;
      default:
        throw new Error(`不正な文字: '${ch}'`);
    }
    i++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ============================================
// 再帰降下パーサー＋評価器
// ============================================

class Parser {
  private tokens: Token[];
  private pos: number;
  private values: Record<string, unknown>;
  private nullEncountered: boolean;

  constructor(tokens: Token[], values: Record<string, unknown>) {
    this.tokens = tokens;
    this.pos = 0;
    this.values = values;
    this.nullEncountered = false;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(type?: TokenType): Token {
    const token = this.tokens[this.pos];
    if (type && token.type !== type) {
      throw new Error(`期待: ${type}, 実際: ${token.type} (${token.value})`);
    }
    this.pos++;
    return token;
  }

  parse(): number | null {
    const result = this.expr();
    if (this.peek().type !== 'EOF') {
      throw new Error(`式の末尾に余分な文字があります: ${this.peek().value}`);
    }
    return this.nullEncountered ? null : result;
  }

  // expr = term (('+' | '-') term)*
  private expr(): number {
    let left = this.term();
    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.consume();
      const right = this.term();
      left = op.type === 'PLUS' ? left + right : left - right;
    }
    return left;
  }

  // term = unary (('*' | '/') unary)*
  private term(): number {
    let left = this.unary();
    while (this.peek().type === 'MUL' || this.peek().type === 'DIV') {
      const op = this.consume();
      const right = this.unary();
      if (op.type === 'DIV') {
        if (right === 0) {
          this.nullEncountered = true;
          left = 0; // ゼロ除算 → null
        } else {
          left = left / right;
        }
      } else {
        left = left * right;
      }
    }
    return left;
  }

  // unary = '-' unary | primary
  private unary(): number {
    if (this.peek().type === 'MINUS') {
      this.consume();
      return -this.unary();
    }
    return this.primary();
  }

  // primary = NUMBER | IDENT | '(' expr ')'
  private primary(): number {
    const token = this.peek();

    if (token.type === 'NUMBER') {
      this.consume();
      const val = parseFloat(token.value);
      if (isNaN(val)) throw new Error(`不正な数値: ${token.value}`);
      return val;
    }

    if (token.type === 'IDENT') {
      this.consume();
      const fieldValue = this.values[token.value];
      if (fieldValue == null) {
        this.nullEncountered = true;
        return 0;
      }
      const num = Number(fieldValue);
      if (isNaN(num)) {
        this.nullEncountered = true;
        return 0;
      }
      return num;
    }

    if (token.type === 'LPAREN') {
      this.consume();
      const result = this.expr();
      this.consume('RPAREN');
      return result;
    }

    throw new Error(`予期しないトークン: ${token.type} (${token.value})`);
  }
}

// ============================================
// 公開 API
// ============================================

/**
 * 数式を評価して結果を返す。
 * 参照先が null/undefined の場合やゼロ除算の場合は null を返す。
 */
export function evaluateFormula(
  formula: string,
  values: Record<string, unknown>,
): number | null {
  if (!formula.trim()) return null;
  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens, values);
    return parser.parse();
  } catch {
    return null;
  }
}

/**
 * 数式からフィールド参照（識別子）を抽出する。
 */
export function extractFieldReferences(formula: string): string[] {
  if (!formula.trim()) return [];
  try {
    const tokens = tokenize(formula);
    return tokens
      .filter((t) => t.type === 'IDENT')
      .map((t) => t.value)
      .filter((v, i, arr) => arr.indexOf(v) === i); // 重複除去
  } catch {
    return [];
  }
}

/**
 * 数式のバリデーション。
 * 構文エラーや未定義フィールド参照を検出する。
 */
export function validateFormula(
  formula: string,
  availableFields: string[],
): { valid: boolean; error?: string } {
  if (!formula.trim()) {
    return { valid: false, error: '計算式が空です' };
  }

  try {
    const tokens = tokenize(formula);
    // 構文チェック: ダミー値でパース
    const dummyValues: Record<string, number> = {};
    for (const field of availableFields) {
      dummyValues[field] = 1;
    }
    const parser = new Parser(tokens, dummyValues);
    parser.parse();

    // 未定義フィールドチェック
    const refs = extractFieldReferences(formula);
    const availableSet = new Set(availableFields);
    const unknowns = refs.filter((r) => !availableSet.has(r));
    if (unknowns.length > 0) {
      return {
        valid: false,
        error: `未定義のフィールド: ${unknowns.join(', ')}`,
      };
    }

    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : '不正な計算式です',
    };
  }
}

/**
 * フィールド定義配列から循環参照を検出する。
 * 循環がある場合はエラーメッセージを、ない場合は null を返す。
 */
export function detectCircularReferences(
  fields: ProjectFieldDefinition[],
): string | null {
  const formulaFields = fields.filter((f) => f.type === 'formula' && f.formula);
  if (formulaFields.length === 0) return null;

  // 依存グラフ構築
  const deps = new Map<string, string[]>();
  for (const field of formulaFields) {
    deps.set(field.key, extractFieldReferences(field.formula!));
  }

  // DFS で循環検出
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(key: string): string | null {
    if (inStack.has(key)) return key;
    if (visited.has(key)) return null;
    visited.add(key);
    inStack.add(key);

    const children = deps.get(key) ?? [];
    for (const child of children) {
      if (deps.has(child)) {
        const result = dfs(child);
        if (result) return result;
      }
    }

    inStack.delete(key);
    return null;
  }

  for (const field of formulaFields) {
    const cycleNode = dfs(field.key);
    if (cycleNode) {
      return `フィールド「${cycleNode}」に循環参照があります`;
    }
  }

  return null;
}

/**
 * 全 formula フィールドの計算結果をまとめて返す。
 * フィールド間の依存関係をトポロジカルソートし、
 * formula → formula 参照も安全に計算する。
 */
export function computeAllFormulas(
  fields: ProjectFieldDefinition[],
  customData: Record<string, unknown> | null,
): Record<string, number | null> {
  const results: Record<string, number | null> = {};
  const formulaFields = fields.filter((f) => f.type === 'formula' && f.formula);
  if (formulaFields.length === 0) return results;

  // 値のコピー（formula の計算結果を注入していく）
  const values: Record<string, unknown> = { ...(customData ?? {}) };

  // トポロジカルソート
  const sorted = topologicalSort(formulaFields);

  for (const field of sorted) {
    const result = evaluateFormula(field.formula!, values);
    results[field.key] = result;
    // 後続の formula が参照できるように values にも注入
    values[field.key] = result;
  }

  return results;
}

/**
 * formula フィールドをトポロジカルソートする。
 * 循環参照がある場合は元の順序を返す。
 */
function topologicalSort(
  formulaFields: ProjectFieldDefinition[],
): ProjectFieldDefinition[] {
  const keySet = new Set(formulaFields.map((f) => f.key));
  const fieldMap = new Map(formulaFields.map((f) => [f.key, f]));
  const deps = new Map<string, string[]>();

  for (const field of formulaFields) {
    const refs = extractFieldReferences(field.formula!).filter((r) => keySet.has(r));
    deps.set(field.key, refs);
  }

  const sorted: ProjectFieldDefinition[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(key: string): boolean {
    if (inStack.has(key)) return false; // 循環
    if (visited.has(key)) return true;
    visited.add(key);
    inStack.add(key);

    for (const dep of deps.get(key) ?? []) {
      if (!visit(dep)) return false;
    }

    inStack.delete(key);
    const field = fieldMap.get(key);
    if (field) sorted.push(field);
    return true;
  }

  for (const field of formulaFields) {
    if (!visit(field.key)) {
      // 循環検出時は元の順序を返す
      return formulaFields;
    }
  }

  return sorted;
}
