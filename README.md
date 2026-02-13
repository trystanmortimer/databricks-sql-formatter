# Databricks SQL Formatter

A VS Code extension that formats Databricks SQL (Spark SQL) with style.

Built from scratch — no external SQL parser dependencies. Designed specifically for Databricks SQL syntax including Delta Lake operations, Unity Catalog, and Spark SQL extensions.

## Features

- **Databricks-first** — understands OPTIMIZE, ZORDER, MERGE, VACUUM, and all Databricks SQL syntax
- **Configurable** — keyword casing, indent size, comma position
- **Fast** — hand-written tokenizer, zero runtime dependencies
- **Format on save** — optional auto-formatting

## Installation

Search for "Databricks SQL Formatter" in the VS Code extensions marketplace.

## Configuration

| Setting | Default | Options |
|---------|---------|---------|
| `indentSize` | 2 | Any number |
| `keywordCase` | `upper` | `upper`, `lower`, `preserve` |
| `commaPosition` | `trailing` | `leading`, `trailing` |
| `formatOnSave` | `false` | `true`, `false` |

## Development

```bash
npm install
npm run test
npm run compile
npm run package
```

## Licence

MIT
