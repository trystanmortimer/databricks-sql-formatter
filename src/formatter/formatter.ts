import { tokenize } from '../parser/tokenizer';
import { Token, TokenType } from '../parser/tokens';
import { FormatOptions, DEFAULT_OPTIONS } from './options';
import { CLAUSE_KEYWORDS } from '../parser/keywords';

type ParenType = 'subquery' | 'grouping' | 'block' | 'concat';

const CONCAT_FUNCTIONS = new Set(['CONCAT', 'CONCAT_WS']);

// Keywords that take parenthesised arguments but are NOT function calls,
// so they should have a space before the opening paren: IN (1, 2, 3)
const NON_FUNCTION_KEYWORDS = new Set(['IN', 'NOT IN']);

export function formatDatabricksSQL(
  input: string,
  options: Partial<FormatOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tokens = tokenize(input);

  const result: string[] = [];
  let indentLevel = 0;
  let lineStart = true;
  let statementStart = true;
  const parenStack: ParenType[] = [];
  const caseStack: number[] = [];  // tracks indentLevel at each CASE entry
  let prevMeaningful: Token | null = null;

  // DDL context tracking for block paren detection (CREATE TABLE column defs)
  let ddlContext = false;
  let blockParenPending = false;

  // Track when a subquery/block paren closes inside a grouping paren,
  // so subsequent content goes on new lines instead of continuing inline
  let afterBlockClose = false;

  // Track when SELECT has multiple columns so first column goes on new line
  let needNewlineBeforeFirstColumn = false;

  const indent = () => ' '.repeat(opts.indentSize * indentLevel);

  function applyCase(token: Token): string {
    if (token.type !== TokenType.Keyword) return token.value;
    switch (opts.keywordCase) {
      case 'upper': return token.value.toUpperCase();
      case 'lower': return token.value.toLowerCase();
      case 'preserve': return token.original || token.value;
    }
  }

  // Merge keyword sequences like "GROUP BY", "ORDER BY", etc.
  const merged = mergeClauseKeywords(tokens);

  for (let i = 0; i < merged.length; i++) {
    const token = merged[i];

    // Skip original whitespace/newlines — we control formatting
    if (token.type === TokenType.Whitespace || token.type === TokenType.Newline) {
      continue;
    }

    // Preserve comments — always on their own line with proper indentation
    if (token.type === TokenType.Comment || token.type === TokenType.BlockComment) {
      // Force comment to its own line if not already at line start
      if (!lineStart) {
        result.push('\n');
        lineStart = true;
      }

      // Add blank line before for visual separation, EXCEPT:
      //   - At the start of output
      //   - At statement start
      //   - After a comma (we're in a column/arg list)
      //   - After another comment (consecutive comments stay grouped)
      //   - After an open paren
      //   - After CASE keyword (comment is inside the CASE block)
      const needsBlankLine = result.length > 0
        && !statementStart
        && !(prevMeaningful && prevMeaningful.type === TokenType.Comma)
        && !(prevMeaningful && (prevMeaningful.type === TokenType.Comment || prevMeaningful.type === TokenType.BlockComment))
        && !(prevMeaningful && prevMeaningful.type === TokenType.OpenParen)
        && !(prevMeaningful && prevMeaningful.type === TokenType.Keyword && prevMeaningful.value === 'CASE');

      if (needsBlankLine) {
        result.push('\n');
      }

      // Indentation: align with the next non-comment token (forward-looking)
      const nextMeaningful = findNextMeaningful(merged, i + 1);
      let commentIndent: string;

      if (nextMeaningful && nextMeaningful.type === TokenType.Keyword) {
        const val = nextMeaningful.value;
        // CASE-internal checks must come before CLAUSE_KEYWORDS (WHEN is in both)
        if ((val === 'WHEN' || val === 'ELSE') && caseStack.length > 0) {
          commentIndent = indent() + ' '.repeat(opts.indentSize);
        } else if (val === 'END' && caseStack.length > 0) {
          commentIndent = indent();
        } else if (val === 'ON') {
          // ON gets extra indentation as a sub-clause of JOIN
          commentIndent = indent() + ' '.repeat(opts.indentSize);
        } else if (CLAUSE_KEYWORDS.has(val)) {
          commentIndent = indent();
        } else if (val === 'CASE') {
          const topParen = parenStack.length > 0 ? parenStack[parenStack.length - 1] : null;
          commentIndent = (statementStart || topParen === 'block') ? indent() : indent() + ' '.repeat(opts.indentSize);
        } else {
          // Non-clause keyword (function name, etc.) — content level
          const topParen = parenStack.length > 0 ? parenStack[parenStack.length - 1] : null;
          commentIndent = (statementStart || topParen === 'block' || topParen === 'concat') ? indent() : indent() + ' '.repeat(opts.indentSize);
        }
      } else {
        // Non-keyword (identifier, etc.) or end of input — content level
        const topParen = parenStack.length > 0 ? parenStack[parenStack.length - 1] : null;
        commentIndent = (statementStart || topParen === 'block' || topParen === 'concat') ? indent() : indent() + ' '.repeat(opts.indentSize);
      }

      result.push(commentIndent + token.value);
      result.push('\n');
      lineStart = true;
      prevMeaningful = token;
      continue;
    }

    if (token.type === TokenType.EOF) break;

    // Track DDL context for block paren detection
    if (token.type === TokenType.Keyword) {
      const val = token.value;
      if (val === 'CREATE' || val === 'ALTER' || val === 'DROP') {
        ddlContext = true;
      } else if ((val === 'TABLE' || val === 'VIEW') && ddlContext) {
        blockParenPending = true;
      } else if (val === 'AS' && ddlContext) {
        // CTAS — no column definitions
        blockParenPending = false;
        ddlContext = false;
      }
      if (val === 'TBLPROPERTIES') {
        blockParenPending = true;
      }
    }

    // Semicolons — end statement
    if (token.type === TokenType.Semicolon) {
      result.push(';\n\n');
      indentLevel = 0;
      lineStart = true;
      statementStart = true;
      ddlContext = false;
      blockParenPending = false;
      afterBlockClose = false;
      caseStack.length = 0;
      needNewlineBeforeFirstColumn = false;
      prevMeaningful = token;
      continue;
    }

    // Open paren
    if (token.type === TokenType.OpenParen) {
      const nextNonWs = findNextNonWhitespace(merged, i + 1);
      const isSubquery = nextNonWs && nextNonWs.type === TokenType.Keyword && CLAUSE_KEYWORDS.has(nextNonWs.value);
      const isBlock = !isSubquery && blockParenPending;

      if (isBlock) blockParenPending = false;

      // Check for concat functions with >2 args — expand to multi-line
      const isConcatExpand = !isSubquery && !isBlock && prevMeaningful &&
        prevMeaningful.type === TokenType.Keyword &&
        CONCAT_FUNCTIONS.has(prevMeaningful.value) &&
        countTopLevelArgs(merged, i + 1) > 2;

      if (isSubquery || isBlock) {
        if (lineStart) {
          result.push(indent() + ' '.repeat(opts.indentSize));
        } else {
          result.push(' ');
        }
        result.push('(');
        parenStack.push(isSubquery ? 'subquery' : 'block');
        indentLevel++;
        result.push('\n');
        lineStart = true;
        statementStart = false;
      } else if (isConcatExpand) {
        // Concat function with many args — multi-line, but no space before (
        if (lineStart) {
          result.push(indent() + (statementStart ? '' : ' '.repeat(opts.indentSize)));
          statementStart = false;
        }
        result.push('(');
        parenStack.push('concat');
        indentLevel++;
        result.push('\n');
        lineStart = true;
      } else {
        // Function call or grouping — inline, no extra whitespace
        if (lineStart) {
          result.push(indent() + (statementStart ? '' : ' '.repeat(opts.indentSize)));
          statementStart = false;
        } else {
          // Add space unless preceded by a function-like token (identifier, backtick,
          // or non-clause keyword like COUNT/SUM)
          const isFunctionCall = prevMeaningful && (
            prevMeaningful.type === TokenType.Identifier ||
            prevMeaningful.type === TokenType.Backtick ||
            (prevMeaningful.type === TokenType.Keyword && !CLAUSE_KEYWORDS.has(prevMeaningful.value) && !NON_FUNCTION_KEYWORDS.has(prevMeaningful.value))
          );
          if (!isFunctionCall) {
            result.push(' ');
          }
        }
        result.push('(');
        parenStack.push('grouping');
        lineStart = false;
      }
      prevMeaningful = token;
      continue;
    }

    // Close paren
    if (token.type === TokenType.CloseParen) {
      const parenType = parenStack.length > 0 ? parenStack.pop()! : 'grouping';
      if (parenType === 'subquery' || parenType === 'block' || parenType === 'concat') {
        if (indentLevel > 0) indentLevel--;
        result.push('\n' + indent() + ')');
        // If enclosing context is a grouping paren, force subsequent content
        // onto new lines (multi-line block inside a function call)
        if (parenStack.length > 0 && parenStack[parenStack.length - 1] === 'grouping') {
          afterBlockClose = true;
        }
      } else {
        // Closing a grouping paren resets the afterBlockClose flag
        afterBlockClose = false;
        result.push(')');
      }
      lineStart = false;
      prevMeaningful = token;
      continue;
    }

    // CASE expression handling — must be before clause keyword handler
    // so that WHEN inside a CASE block is intercepted before the generic WHEN clause handler
    if (token.type === TokenType.Keyword && token.value === 'CASE') {
      if (afterBlockClose) {
        result.push('\n');
        lineStart = true;
        afterBlockClose = false;
      }
      // CASE always starts on a new line
      if (!lineStart) {
        result.push('\n');
        lineStart = true;
      }
      const topParen = parenStack.length > 0 ? parenStack[parenStack.length - 1] : null;
      if (statementStart) {
        result.push(indent());
      } else if (topParen === 'block') {
        result.push(indent());
      } else {
        result.push(indent() + ' '.repeat(opts.indentSize));
      }
      result.push(applyCase(token));
      caseStack.push(indentLevel);
      indentLevel++;
      lineStart = false;
      statementStart = false;
      prevMeaningful = token;
      continue;
    }

    // WHEN inside a CASE block — indented one level deeper than CASE
    if (token.type === TokenType.Keyword && token.value === 'WHEN' && caseStack.length > 0) {
      if (!lineStart) {
        result.push('\n');
      }
      result.push(indent() + ' '.repeat(opts.indentSize) + applyCase(token));
      lineStart = false;
      statementStart = false;
      prevMeaningful = token;
      continue;
    }

    // ELSE inside a CASE block — same indentation as WHEN
    if (token.type === TokenType.Keyword && token.value === 'ELSE' && caseStack.length > 0) {
      if (!lineStart) {
        result.push('\n');
      }
      result.push(indent() + ' '.repeat(opts.indentSize) + applyCase(token));
      lineStart = false;
      statementStart = false;
      prevMeaningful = token;
      continue;
    }

    // END closing a CASE block — aligned with CASE's logical position
    if (token.type === TokenType.Keyword && token.value === 'END' && caseStack.length > 0) {
      if (!lineStart) {
        result.push('\n');
      }
      result.push(indent() + applyCase(token));
      indentLevel = caseStack.pop()!;
      lineStart = false;
      statementStart = false;
      prevMeaningful = token;
      continue;
    }

    // Major clause keywords — newline before
    if (token.type === TokenType.Keyword && CLAUSE_KEYWORDS.has(token.value)) {
      if (!lineStart && result.length > 0) {
        result.push('\n');
      }
      const extraIndent = (token.value === 'ON') ? ' '.repeat(opts.indentSize) : '';
      result.push(indent() + extraIndent + applyCase(token));
      lineStart = false;
      statementStart = false;

      // If this is SELECT with multiple columns, flag for newline before first column
      if (token.value === 'SELECT') {
        const columnCount = countSelectColumns(merged, i + 1);
        if (columnCount > 1) {
          needNewlineBeforeFirstColumn = true;
        }
      }

      prevMeaningful = token;
      continue;
    }

    // Comma
    if (token.type === TokenType.Comma) {
      // Inside function call / grouping — keep inline, unless after a multi-line block close
      const topParen = parenStack.length > 0 ? parenStack[parenStack.length - 1] : null;
      if (topParen === 'grouping' && !afterBlockClose) {
        result.push(',');
        lineStart = false;
      } else if (opts.commaPosition === 'trailing') {
        result.push(',\n');
        lineStart = true;
      } else {
        // Leading comma
        result.push('\n' + indent() + ',');
        lineStart = false;
      }
      afterBlockClose = false;
      prevMeaningful = token;
      continue;
    }

    // Dot (no spaces around it)
    if (token.type === TokenType.Dot) {
      result.push('.');
      lineStart = false;
      prevMeaningful = token;
      continue;
    }
    if (prevMeaningful && prevMeaningful.type === TokenType.Dot) {
      result.push(applyCase(token));
      lineStart = false;
      prevMeaningful = token;
      continue;
    }

    // Default — add space and value

    // When SELECT has multiple columns, force first column onto new line
    // but keep DISTINCT/ALL on the SELECT line
    if (needNewlineBeforeFirstColumn) {
      if (token.type === TokenType.Keyword && (token.value === 'DISTINCT' || token.value === 'ALL')) {
        // Keep DISTINCT/ALL on the SELECT line, maintain the flag
      } else {
        // First actual column — force newline
        result.push('\n');
        lineStart = true;
        needNewlineBeforeFirstColumn = false;
      }
    }

    if (afterBlockClose) {
      // After a multi-line block close inside a grouping, force newline
      result.push('\n');
      lineStart = true;
      afterBlockClose = false;
    }
    if (!lineStart) {
      // No space directly after open paren
      if (prevMeaningful && prevMeaningful.type === TokenType.OpenParen) {
        // no space
      } else {
        result.push(' ');
      }
    } else {
      const topParen = parenStack.length > 0 ? parenStack[parenStack.length - 1] : null;
      if (statementStart) {
        // First token of a statement — no extra indent
        result.push(indent());
      } else if (topParen === 'block' || topParen === 'concat') {
        // Inside block paren (column definitions) or concat expansion — indent to paren level only
        result.push(indent());
      } else {
        // Clause content — indent past the keyword
        result.push(indent() + ' '.repeat(opts.indentSize));
      }
      lineStart = false;
    }
    result.push(applyCase(token));
    lineStart = false;
    statementStart = false;
    prevMeaningful = token;
  }

  return result.join('').trim() + '\n';
}

function mergeClauseKeywords(tokens: Token[]): Token[] {
  const result: Token[] = [];
  const mergeables: Record<string, string[]> = {
    'GROUP': ['BY'],
    'ORDER': ['BY'],
    'DISTRIBUTE': ['BY'],
    'SORT': ['BY'],
    'CLUSTER': ['BY'],
    'PARTITION': ['BY'],
    'INSERT': ['INTO', 'OVERWRITE'],
    'MERGE': ['INTO'],
    'LEFT': ['JOIN', 'OUTER JOIN', 'SEMI JOIN', 'ANTI JOIN'],
    'RIGHT': ['JOIN', 'OUTER JOIN'],
    'FULL': ['JOIN', 'OUTER JOIN'],
    'INNER': ['JOIN'],
    'CROSS': ['JOIN'],
    'NOT': ['IN'],
    'UNION': ['ALL'],
    'LATERAL': ['VIEW'],
    'ZORDER': ['BY'],
    'FULL OUTER': ['JOIN'],
    'LEFT OUTER': ['JOIN'],
    'RIGHT OUTER': ['JOIN'],
    'LEFT SEMI': ['JOIN'],
    'LEFT ANTI': ['JOIN'],
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === TokenType.Keyword && mergeables[t.value]) {
      // Try to merge with following keyword(s)
      const suffixes = mergeables[t.value];
      let merged = false;
      for (const suffix of suffixes) {
        const parts = suffix.split(' ');
        let match = true;
        let j = i + 1;
        const consumed: number[] = [];
        for (const part of parts) {
          // skip whitespace/newlines
          while (j < tokens.length && (tokens[j].type === TokenType.Whitespace || tokens[j].type === TokenType.Newline)) j++;
          if (j < tokens.length && tokens[j].type === TokenType.Keyword && tokens[j].value === part) {
            consumed.push(j);
            j++;
          } else {
            match = false;
            break;
          }
        }
        if (match) {
          result.push({ type: TokenType.Keyword, value: t.value + ' ' + suffix, original: t.original });
          i = consumed[consumed.length - 1];
          merged = true;
          break;
        }
      }
      if (!merged) result.push(t);
    } else {
      result.push(t);
    }
  }
  return result;
}

function countTopLevelArgs(tokens: Token[], start: number): number {
  let depth = 0;
  let commas = 0;
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === TokenType.Whitespace || t.type === TokenType.Newline) continue;
    if (t.type === TokenType.OpenParen) depth++;
    else if (t.type === TokenType.CloseParen) {
      if (depth === 0) break;
      depth--;
    } else if (t.type === TokenType.Comma && depth === 0) {
      commas++;
    }
  }
  return commas + 1;
}

function countSelectColumns(tokens: Token[], start: number): number {
  let depth = 0;
  let commas = 0;
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === TokenType.Whitespace || t.type === TokenType.Newline) continue;
    if (t.type === TokenType.EOF) break;
    if (t.type === TokenType.OpenParen) { depth++; continue; }
    if (t.type === TokenType.CloseParen) {
      if (depth === 0) break;
      depth--;
      continue;
    }
    if (depth === 0) {
      if (t.type === TokenType.Semicolon) break;
      if (t.type === TokenType.Keyword && CLAUSE_KEYWORDS.has(t.value)) break;
      if (t.type === TokenType.Comma) commas++;
    }
  }
  return commas + 1;
}

function findNextNonWhitespace(tokens: Token[], start: number): Token | null {
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i].type !== TokenType.Whitespace && tokens[i].type !== TokenType.Newline) {
      return tokens[i];
    }
  }
  return null;
}

function findNextMeaningful(tokens: Token[], start: number): Token | null {
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== TokenType.Whitespace && t.type !== TokenType.Newline &&
        t.type !== TokenType.Comment && t.type !== TokenType.BlockComment) {
      return t;
    }
  }
  return null;
}
