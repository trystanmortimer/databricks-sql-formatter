import { Token, TokenType } from './tokens';
import { KEYWORDS } from './keywords';

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Whitespace (not newlines)
    if (ch === ' ' || ch === '\t') {
      let ws = '';
      while (i < input.length && (input[i] === ' ' || input[i] === '\t')) {
        ws += input[i++];
      }
      tokens.push({ type: TokenType.Whitespace, value: ws });
      continue;
    }

    // Newlines
    if (ch === '\n' || ch === '\r') {
      let nl = '';
      if (ch === '\r' && i + 1 < input.length && input[i + 1] === '\n') {
        nl = '\r\n';
        i += 2;
      } else {
        nl = ch;
        i++;
      }
      tokens.push({ type: TokenType.Newline, value: nl });
      continue;
    }

    // Line comment
    if (ch === '-' && i + 1 < input.length && input[i + 1] === '-') {
      let comment = '';
      while (i < input.length && input[i] !== '\n') {
        comment += input[i++];
      }
      tokens.push({ type: TokenType.Comment, value: comment });
      continue;
    }

    // Block comment
    if (ch === '/' && i + 1 < input.length && input[i + 1] === '*') {
      let comment = '/*';
      i += 2;
      while (i < input.length && !(input[i] === '*' && i + 1 < input.length && input[i + 1] === '/')) {
        comment += input[i++];
      }
      if (i < input.length) {
        comment += '*/';
        i += 2;
      }
      tokens.push({ type: TokenType.BlockComment, value: comment });
      continue;
    }

    // Single-quoted string
    if (ch === "'") {
      let str = "'";
      i++;
      while (i < input.length) {
        if (input[i] === "'" && i + 1 < input.length && input[i + 1] === "'") {
          str += "''";
          i += 2;
        } else if (input[i] === "'") {
          str += "'";
          i++;
          break;
        } else {
          str += input[i++];
        }
      }
      tokens.push({ type: TokenType.String, value: str });
      continue;
    }

    // Double-quoted identifier
    if (ch === '"') {
      let str = '"';
      i++;
      while (i < input.length && input[i] !== '"') {
        str += input[i++];
      }
      if (i < input.length) {
        str += '"';
        i++;
      }
      tokens.push({ type: TokenType.Identifier, value: str });
      continue;
    }

    // Backtick identifier
    if (ch === '`') {
      let str = '`';
      i++;
      while (i < input.length && input[i] !== '`') {
        str += input[i++];
      }
      if (i < input.length) {
        str += '`';
        i++;
      }
      tokens.push({ type: TokenType.Backtick, value: str });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < input.length && /[0-9]/.test(input[i + 1]))) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i++];
      }
      // Scientific notation
      if (i < input.length && (input[i] === 'e' || input[i] === 'E')) {
        num += input[i++];
        if (i < input.length && (input[i] === '+' || input[i] === '-')) {
          num += input[i++];
        }
        while (i < input.length && /[0-9]/.test(input[i])) {
          num += input[i++];
        }
      }
      tokens.push({ type: TokenType.Number, value: num });
      continue;
    }

    // Symbols
    if (ch === '(') { tokens.push({ type: TokenType.OpenParen, value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TokenType.CloseParen, value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TokenType.Comma, value: ',' }); i++; continue; }
    if (ch === ';') { tokens.push({ type: TokenType.Semicolon, value: ';' }); i++; continue; }
    if (ch === '.') { tokens.push({ type: TokenType.Dot, value: '.' }); i++; continue; }

    // Multi-char operators
    const twoChar = input.slice(i, i + 2);
    if (['!=', '<>', '>=', '<=', '||', '->'].includes(twoChar)) {
      tokens.push({ type: TokenType.Operator, value: twoChar });
      i += 2;
      continue;
    }

    // Single-char operators
    if (['+', '-', '*', '/', '%', '=', '<', '>', '|', '&', '^', '~', '!'].includes(ch)) {
      tokens.push({ type: TokenType.Operator, value: ch });
      i++;
      continue;
    }

    // Dollar-quoted string ($$...$$) — preserves content verbatim
    if (ch === '$' && i + 1 < input.length && input[i + 1] === '$') {
      let str = '$$';
      i += 2;
      while (i < input.length) {
        if (input[i] === '$' && i + 1 < input.length && input[i + 1] === '$') {
          str += '$$';
          i += 2;
          break;
        }
        str += input[i++];
      }
      tokens.push({ type: TokenType.DollarQuotedString, value: str });
      continue;
    }

    // ${var} template parameters (Databricks widgets / Jinja)
    if (ch === '$' && i + 1 < input.length && input[i + 1] === '{') {
      let param = '${';
      i += 2;
      while (i < input.length && input[i] !== '}') {
        param += input[i++];
      }
      if (i < input.length) {
        param += '}';
        i++;
      }
      tokens.push({ type: TokenType.Parameter, value: param });
      continue;
    }

    // {{ jinja }} style parameters
    if (ch === '{' && i + 1 < input.length && input[i + 1] === '{') {
      let param = '{{';
      i += 2;
      while (i < input.length && !(input[i] === '}' && i + 1 < input.length && input[i + 1] === '}')) {
        param += input[i++];
      }
      if (i < input.length) {
        param += '}}';
        i += 2;
      }
      tokens.push({ type: TokenType.Parameter, value: param });
      continue;
    }

    // Parameter markers (:param, @param)
    if (ch === ':' || ch === '@') {
      let param = ch;
      i++;
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        param += input[i++];
      }
      tokens.push({ type: TokenType.Parameter, value: param });
      continue;
    }

    // Words (keywords or identifiers)
    if (/[a-zA-Z_]/.test(ch)) {
      let word = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        word += input[i++];
      }
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) {
        tokens.push({ type: TokenType.Keyword, value: upper, original: word });
      } else {
        tokens.push({ type: TokenType.Identifier, value: word });
      }
      continue;
    }

    // Fallback — emit as operator
    tokens.push({ type: TokenType.Operator, value: ch });
    i++;
  }

  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}
