export enum TokenType {
  Keyword = 'KEYWORD',
  Identifier = 'IDENTIFIER',
  Number = 'NUMBER',
  String = 'STRING',
  Operator = 'OPERATOR',
  Comma = 'COMMA',
  OpenParen = 'OPEN_PAREN',
  CloseParen = 'CLOSE_PAREN',
  Semicolon = 'SEMICOLON',
  Dot = 'DOT',
  Whitespace = 'WHITESPACE',
  Comment = 'COMMENT',
  BlockComment = 'BLOCK_COMMENT',
  Newline = 'NEWLINE',
  Backtick = 'BACKTICK_IDENT',
  Parameter = 'PARAMETER',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  original?: string; // preserve original casing for identifiers
}
