# Databricks SQL Formatter — VS Code Extension

A from-scratch SQL formatter specifically designed for Databricks SQL (Spark SQL superset).

## Architecture

```
src/
├── extension.ts              # VS Code entry point, registers formatter
├── parser/
│   ├── tokens.ts             # Token type enum and interface
│   ├── keywords.ts           # Databricks SQL keyword sets
│   └── tokenizer.ts          # Hand-written tokenizer (no regex engine)
├── formatter/
│   ├── options.ts            # Configuration types and defaults
│   └── formatter.ts          # Core formatting logic
└── test/
    └── formatter.test.ts     # Vitest tests
```

## Key Design Decisions

- **Hand-written tokenizer** — no dependency on external SQL parsers. Full control over Databricks-specific syntax.
- **Clause-based formatting** — major SQL clauses (SELECT, FROM, WHERE, etc.) start on new lines. Columns indent under their clause.
- **Keyword merging** — multi-word keywords (GROUP BY, LEFT OUTER JOIN, ZORDER BY) are merged during tokenization for correct formatting.
- **Databricks-first** — includes OPTIMIZE, ZORDER, VACUUM, MERGE, Delta Lake syntax, Unity Catalog keywords.

## Commands

```bash
npm install          # Install dependencies
npm run compile      # Build TypeScript
npm run test         # Run tests (vitest)
npm run test:watch   # Watch mode
npm run package      # Build .vsix for distribution
```

## Configuration

- `databricksSqlFormatter.indentSize` — spaces per indent (default: 2)
- `databricksSqlFormatter.keywordCase` — upper/lower/preserve (default: upper)
- `databricksSqlFormatter.commaPosition` — leading/trailing (default: trailing)
- `databricksSqlFormatter.formatOnSave` — auto-format on save (default: false)

## Testing

Add test cases to `src/test/formatter.test.ts`. Cover edge cases: nested subqueries, CTEs, MERGE statements, window functions, Databricks-specific syntax.

## Conventions

- British/Australian English in comments and docs
- All SQL keyword handling is case-insensitive
- Never add runtime dependencies — this must be pure TypeScript
