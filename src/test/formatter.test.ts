import { describe, it, expect } from 'vitest';
import { formatDatabricksSQL } from '../formatter/formatter';

describe('formatDatabricksSQL', () => {
  it('formats a basic SELECT with trailing commas', () => {
    const input = 'select a, b, c from my_table where x = 1';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT\n' +
      '  a,\n' +
      '  b,\n' +
      '  c\n' +
      'FROM my_table\n' +
      'WHERE x = 1\n'
    );
  });

  it('formats a basic SELECT with leading commas', () => {
    const input = 'select a, b, c from my_table where x = 1';
    const result = formatDatabricksSQL(input, { commaPosition: 'leading' });
    expect(result).toBe(
      'SELECT\n' +
      '  a\n' +
      ', b\n' +
      ', c\n' +
      'FROM my_table\n' +
      'WHERE x = 1\n'
    );
  });

  it('handles Databricks-specific keywords', () => {
    const input = 'optimize my_table zorder by (col1, col2)';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('OPTIMIZE');
    expect(result).toContain('ZORDER BY');
    // Grouping parens should be inline
    expect(result).toContain('(col1, col2)');
  });

  it('preserves string literals', () => {
    const input = "select * from t where name = 'hello world'";
    const result = formatDatabricksSQL(input);
    expect(result).toContain("'hello world'");
  });

  it('handles subqueries with proper indentation', () => {
    const input = 'select * from (select a from b) t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM (\n' +
      '  SELECT a\n' +
      '  FROM b\n' +
      ') t\n'
    );
  });

  it('handles function calls inline without extra whitespace', () => {
    const input = 'select count(*), sum(x) from t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT\n' +
      '  COUNT(*),\n' +
      '  SUM(x)\n' +
      'FROM t\n'
    );
  });

  it('handles multi-arg functions inline', () => {
    const input = 'select coalesce(a, b, c) from t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT COALESCE(a, b, c)\n' +
      'FROM t\n'
    );
  });

  it('respects keyword case option', () => {
    const input = 'SELECT a FROM b';
    const lower = formatDatabricksSQL(input, { keywordCase: 'lower' });
    expect(lower).toContain('select');
    expect(lower).toContain('from');
  });

  it('handles CTE (WITH clause)', () => {
    const input = 'with cte as (select 1) select * from cte';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('WITH');
  });

  it('handles MERGE statement', () => {
    const input = 'merge into target using source on target.id = source.id when matched then update set target.val = source.val';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('MERGE INTO');
    expect(result).toContain('WHEN');
  });

  it('handles :parameter placeholders', () => {
    const input = "select * from :catalog.:schema.my_table where id = :id";
    const result = formatDatabricksSQL(input);
    expect(result).toContain(':catalog');
    expect(result).toContain(':schema');
    expect(result).toContain(':id');
    // Should not mangle the colon parameters
    expect(result).not.toContain('CATALOG');
  });

  it('handles ${var} style parameters', () => {
    const input = "select * from \${catalog}.\${schema}.my_table";
    const result = formatDatabricksSQL(input);
    expect(result).toContain('\${catalog}');
    expect(result).toContain('\${schema}');
  });

  it('handles window functions with OVER clause', () => {
    const input = 'select row_number() over (partition by dept order by salary desc) as rn from eordersloyees';
    const result = formatDatabricksSQL(input);
    // OVER( should open a subquery-like block since PARTITION BY is a clause keyword
    expect(result).toContain('OVER (');
    expect(result).toContain('PARTITION BY');
    expect(result).toContain('ORDER BY');
  });

  it('handles INSERT INTO with VALUES grouping', () => {
    const input = "insert into t values (1, 'a'), (2, 'b')";
    const result = formatDatabricksSQL(input);
    // Values tuples should be inline
    expect(result).toContain("(1, 'a')");
    expect(result).toContain("(2, 'b')");
  });

  it('handles nested subqueries', () => {
    const input = 'select * from (select * from (select 1 as x) inner_t) outer_t';
    const result = formatDatabricksSQL(input);
    // Should have nested indentation
    expect(result).toContain('  SELECT *');
    expect(result).toContain('    SELECT 1');
  });

  it('formats CREATE TABLE column definitions on separate lines', () => {
    const input = 'create table my_table (id int, name string, value double)';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'CREATE TABLE my_table (\n' +
      '  id INT,\n' +
      '  name STRING,\n' +
      '  value DOUBLE\n' +
      ')\n'
    );
  });

  it('formats CREATE TABLE IF NOT EXISTS', () => {
    const input = 'create table if not exists my_table (id int, name string)';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('CREATE TABLE IF NOT EXISTS my_table (');
    expect(result).toContain('  id INT,');
    expect(result).toContain('  name STRING');
  });

  it('handles CTAS without column definition parens', () => {
    const input = 'create table my_table as select a, b from t';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('CREATE TABLE my_table AS');
    expect(result).toContain('SELECT\n');
    expect(result).toContain('  a,');
  });

  it('does not indent statements after semicolons', () => {
    const input = 'select 1; create table t (a int, b string)';
    const result = formatDatabricksSQL(input);
    // CREATE should start at column 0, not indented
    expect(result).toContain(';\n\nCREATE TABLE');
  });

  it('formats CREATE TABLE with leading commas', () => {
    const input = 'create table t (a int, b string, c double)';
    const result = formatDatabricksSQL(input, { commaPosition: 'leading' });
    expect(result).toBe(
      'CREATE TABLE t (\n' +
      '  a INT\n' +
      '  , b STRING\n' +
      '  , c DOUBLE\n' +
      ')\n'
    );
  });

  it('does not indent CREATE OR REPLACE VIEW after USE CATALOG', () => {
    const input = 'USE CATALOG IDENTIFIER(:catalog); CREATE OR REPLACE VIEW myview AS SELECT 1';
    const result = formatDatabricksSQL(input);
    // CREATE should start at column 0, not indented
    expect(result).toContain(';\n\nCREATE OR REPLACE VIEW');
  });

  it('puts continuation args on new line after multi-line block close in function', () => {
    const input = 'SELECT CAST(COALESCE(LEAD(x) OVER (PARTITION BY a ORDER BY b), TIMESTAMP(\'9999-12-31\')) AS TIMESTAMP) AS end_date FROM t';
    const result = formatDatabricksSQL(input);
    // After the OVER block closes, TIMESTAMP should be on a new line
    expect(result).toContain('),\n');
    expect(result).toContain('TIMESTAMP(\'9999-12-31\')');
    // TIMESTAMP should not be on the same line as the closing paren of OVER
    expect(result).not.toMatch(/\), TIMESTAMP/);
  });

  it('does not force newline after OVER block when not inside a grouping paren', () => {
    const input = 'SELECT ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) AS rn FROM t';
    const result = formatDatabricksSQL(input);
    // The ) AS rn should stay on the same line — no enclosing grouping paren
    expect(result).toContain(') AS rn');
  });

  it('applies keyword case to built-in functions', () => {
    const input = 'select row_number() over (partition by a order by b), coalesce(x, y), lead(z, 1) over (order by a) from t';
    const upper = formatDatabricksSQL(input);
    expect(upper).toContain('ROW_NUMBER()');
    expect(upper).toContain('COALESCE(x, y)');
    expect(upper).toContain('LEAD(z, 1)');

    const lower = formatDatabricksSQL(input, { keywordCase: 'lower' });
    expect(lower).toContain('row_number()');
    expect(lower).toContain('coalesce(x, y)');
    expect(lower).toContain('lead(z, 1)');
  });

  it('applies keyword case to aggregate functions', () => {
    const input = 'SELECT count(*), sum(x), avg(y), min(z), max(z) FROM t GROUP BY a';
    const lower = formatDatabricksSQL(input, { keywordCase: 'lower' });
    expect(lower).toContain('count(*)');
    expect(lower).toContain('sum(x)');
    expect(lower).toContain('avg(y)');
    expect(lower).toContain('min(z)');
    expect(lower).toContain('max(z)');
  });

  it('formats TBLPROPERTIES on new line with multi-line properties', () => {
    const input = "CLUSTER BY (business_key) TBLPROPERTIES('delta.autoOptimize.optimizeWrite' = 'true', 'delta.autoOptimize.autoCoordersact' = 'true');";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'CLUSTER BY (business_key)\n' +
      'TBLPROPERTIES (\n' +
      "  'delta.autoOptimize.optimizeWrite' = 'true',\n" +
      "  'delta.autoOptimize.autoCoordersact' = 'true'\n" +
      ');\n'
    );
  });

  it('formats TBLPROPERTIES with single property', () => {
    const input = "CREATE TABLE t (id INT) TBLPROPERTIES('delta.enableChangeDataFeed' = 'true');";
    const result = formatDatabricksSQL(input);
    expect(result).toContain('TBLPROPERTIES (\n');
    expect(result).toContain("  'delta.enableChangeDataFeed' = 'true'\n");
    expect(result).toContain(');\n');
  });

  it('formats simple CASE expression with proper indentation', () => {
    const input = "SELECT CASE p.status_code WHEN 'A' THEN 'Active' WHEN 'I' THEN 'Inactive' WHEN 'P' THEN 'Pending' ELSE 'None' END AS status_label, other_col FROM t";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT\n' +
      '  CASE p.status_code\n' +
      "    WHEN 'A' THEN 'Active'\n" +
      "    WHEN 'I' THEN 'Inactive'\n" +
      "    WHEN 'P' THEN 'Pending'\n" +
      "    ELSE 'None'\n" +
      '  END AS status_label,\n' +
      '  other_col\n' +
      'FROM t\n'
    );
  });

  it('formats searched CASE expression', () => {
    const input = "SELECT CASE WHEN x > 0 THEN 'positive' WHEN x = 0 THEN 'zero' ELSE 'negative' END FROM t";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT\n' +
      '  CASE\n' +
      "    WHEN x > 0 THEN 'positive'\n" +
      "    WHEN x = 0 THEN 'zero'\n" +
      "    ELSE 'negative'\n" +
      '  END\n' +
      'FROM t\n'
    );
  });

  it('formats CASE without ELSE clause', () => {
    const input = "SELECT CASE WHEN x > 0 THEN 'positive' END FROM t";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT\n' +
      '  CASE\n' +
      "    WHEN x > 0 THEN 'positive'\n" +
      '  END\n' +
      'FROM t\n'
    );
  });

  it('formats CASE in WHERE clause', () => {
    const input = "SELECT a FROM t WHERE CASE WHEN x > 0 THEN 'yes' ELSE 'no' END = 'yes'";
    const result = formatDatabricksSQL(input);
    expect(result).toContain('WHERE\n');
    expect(result).toContain('  CASE\n');
    expect(result).toContain("    WHEN x > 0 THEN 'yes'\n");
    expect(result).toContain("    ELSE 'no'\n");
    expect(result).toContain("  END = 'yes'\n");
  });

  it('formats CASE inside function call', () => {
    const input = 'SELECT COALESCE(CASE WHEN x THEN 1 ELSE 0 END, other) FROM t';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('COALESCE(\n');
    expect(result).toContain('  CASE\n');
    expect(result).toContain('    WHEN x THEN 1\n');
    expect(result).toContain('    ELSE 0\n');
    expect(result).toContain('  END, other)\n');
  });

  it('does not alter MERGE WHEN formatting (regression)', () => {
    const input = 'merge into target using source on target.id = source.id when matched then update set target.val = source.val';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('MERGE INTO');
    // WHEN should still be at clause keyword level (not CASE-indented)
    expect(result).toContain('\nWHEN');
  });

  it('expands CONCAT with more than 2 args to multi-line', () => {
    const input = "SELECT CONCAT(x, y, z) FROM t";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT CONCAT(\n' +
      '  x,\n' +
      '  y,\n' +
      '  z\n' +
      ')\n' +
      'FROM t\n'
    );
  });

  it('keeps CONCAT with 2 or fewer args inline', () => {
    const input = "SELECT CONCAT(x, y) FROM t";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT CONCAT(x, y)\n' +
      'FROM t\n'
    );
  });

  it('expands CONCAT_WS with more than 2 args to multi-line', () => {
    const input = "SELECT CONCAT_WS('|', x, y, z) FROM t";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT CONCAT_WS(\n' +
      "  '|',\n" +
      '  x,\n' +
      '  y,\n' +
      '  z\n' +
      ')\n' +
      'FROM t\n'
    );
  });

  it('expands nested CONCAT inside another function', () => {
    const input = "SELECT MD5(CONCAT_WS('|', IFNULL(a, ''), IFNULL(b, ''), IFNULL(c, ''))) AS row_hash FROM t";
    const result = formatDatabricksSQL(input);
    expect(result).toContain('MD5(CONCAT_WS(\n');
    expect(result).toContain("IFNULL(a, '')");
    expect(result).toContain("IFNULL(b, '')");
    expect(result).toContain("IFNULL(c, '')");
    // Each IFNULL arg should be on its own line
    expect(result).toMatch(/IFNULL\(a, ''\),\n/);
    expect(result).toMatch(/IFNULL\(b, ''\),\n/);
  });

  it('expands CONCAT with leading commas', () => {
    const input = "SELECT CONCAT(x, y, z) FROM t";
    const result = formatDatabricksSQL(input, { commaPosition: 'leading' });
    expect(result).toBe(
      'SELECT CONCAT(\n' +
      '  x\n' +
      '  , y\n' +
      '  , z\n' +
      ')\n' +
      'FROM t\n'
    );
  });

  it('indents ON as a sub-clause of JOIN', () => {
    const input = 'select * from table1 join table2 on table1.id = table2.id';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM table1\n' +
      'JOIN table2\n' +
      '  ON table1.id = table2.id\n'
    );
  });

  it('indents ON as a sub-clause of LEFT JOIN', () => {
    const input = 'select * from table1 left join table2 on table1.id = table2.id';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM table1\n' +
      'LEFT JOIN table2\n' +
      '  ON table1.id = table2.id\n'
    );
  });

  it('indents ON for multiple JOINs', () => {
    const input = 'select * from a inner join b on a.id = b.id left join c on b.id = c.id';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM a\n' +
      'INNER JOIN b\n' +
      '  ON a.id = b.id\n' +
      'LEFT JOIN c\n' +
      '  ON b.id = c.id\n'
    );
  });

  it('indents ON correctly inside a subquery', () => {
    const input = 'select * from (select a.x from a join b on a.id = b.id) t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM (\n' +
      '  SELECT a.x\n' +
      '  FROM a\n' +
      '  JOIN b\n' +
      '    ON a.id = b.id\n' +
      ') t\n'
    );
  });

  it('respects custom indent size for ON indentation', () => {
    const input = 'select * from a join b on a.id = b.id';
    const result = formatDatabricksSQL(input, { indentSize: 4 });
    expect(result).toBe(
      'SELECT *\n' +
      'FROM a\n' +
      'JOIN b\n' +
      '    ON a.id = b.id\n'
    );
  });

  it('handles multiple OVER blocks inside function args', () => {
    const input = 'SELECT COALESCE(LAG(x) OVER (PARTITION BY a ORDER BY b), LEAD(x) OVER (PARTITION BY a ORDER BY b)) FROM t';
    const result = formatDatabricksSQL(input);
    // Each OVER block close inside COALESCE should force continuation on new line
    expect(result).not.toMatch(/\), LEAD/);
    expect(result).toContain('),\n');
  });

  it('keeps single column on the SELECT line', () => {
    const input = 'select a from t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT a\n' +
      'FROM t\n'
    );
  });

  it('puts first column on new line when there are two columns', () => {
    const input = 'select a, b from t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT\n' +
      '  a,\n' +
      '  b\n' +
      'FROM t\n'
    );
  });

  it('keeps DISTINCT on SELECT line with multi-column newline', () => {
    const input = 'select distinct a, b, c from t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT DISTINCT\n' +
      '  a,\n' +
      '  b,\n' +
      '  c\n' +
      'FROM t\n'
    );
  });

  it('handles subquery with multi-column newline', () => {
    const input = 'select * from (select a, b, c from t) sub';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM (\n' +
      '  SELECT\n' +
      '    a,\n' +
      '    b,\n' +
      '    c\n' +
      '  FROM t\n' +
      ') sub\n'
    );
  });

  // --- Comment handling ---

  it('adds blank line before block comment preceding LEFT JOIN', () => {
    const input = 'SELECT * FROM orders /* Get link */ LEFT JOIN order_lines ON orders.id = order_lines.id';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM orders\n' +
      '\n' +
      '/* Get link */\n' +
      'LEFT JOIN order_lines\n' +
      '  ON orders.id = order_lines.id\n'
    );
  });

  it('adds blank line before line comment preceding JOIN', () => {
    const input = 'SELECT * FROM a\n-- join to b\nJOIN b ON a.id = b.id';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM a\n' +
      '\n' +
      '-- join to b\n' +
      'JOIN b\n' +
      '  ON a.id = b.id\n'
    );
  });

  it('forces inline block comment to its own line with blank line', () => {
    const input = 'SELECT a /* inline */ FROM t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT a\n' +
      '\n' +
      '/* inline */\n' +
      'FROM t\n'
    );
  });

  it('indents comment in SELECT column list after comma without blank line', () => {
    const input = 'SELECT a, /* comment about b */ b, c FROM t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT\n' +
      '  a,\n' +
      '  /* comment about b */\n' +
      '  b,\n' +
      '  c\n' +
      'FROM t\n'
    );
  });

  it('groups multiple consecutive comments without blank lines between them', () => {
    const input = 'SELECT * FROM a /* first comment */ /* second comment */ LEFT JOIN b ON a.id = b.id';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM a\n' +
      '\n' +
      '/* first comment */\n' +
      '/* second comment */\n' +
      'LEFT JOIN b\n' +
      '  ON a.id = b.id\n'
    );
  });

  it('indents comment inside a subquery at the correct nesting level', () => {
    const input = 'SELECT * FROM (SELECT a FROM x /* link tables */ JOIN y ON x.id = y.id) t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM (\n' +
      '  SELECT a\n' +
      '  FROM x\n' +
      '\n' +
      '  /* link tables */\n' +
      '  JOIN y\n' +
      '    ON x.id = y.id\n' +
      ') t\n'
    );
  });

  it('does not add blank line before comment at start of statement', () => {
    const input = '/* Starting comment */ SELECT a FROM t';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      '/* Starting comment */\n' +
      'SELECT a\n' +
      'FROM t\n'
    );
  });

  it('aligns comment with ON when comment precedes ON clause', () => {
    const input = 'SELECT * FROM a LEFT JOIN b /* join condition */ ON a.id = b.id';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM a\n' +
      'LEFT JOIN b\n' +
      '\n' +
      '  /* join condition */\n' +
      '  ON a.id = b.id\n'
    );
  });

  it('adds space before parentheses in IN clause', () => {
    const input = "SELECT * FROM t WHERE x IN (1, 2, 3)";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM t\n' +
      'WHERE x IN (1, 2, 3)\n'
    );
  });

  it('adds space before parentheses in NOT IN clause', () => {
    const input = "SELECT * FROM t WHERE x NOT IN (1, 2, 3)";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT *\n' +
      'FROM t\n' +
      'WHERE x NOT IN (1, 2, 3)\n'
    );
  });

  it('adds space before subquery in IN clause', () => {
    const input = "SELECT * FROM t WHERE x IN (SELECT id FROM other)";
    const result = formatDatabricksSQL(input);
    expect(result).toContain('IN (\n');
    expect(result).toContain('  SELECT id\n');
  });

  // --- Function statements ---

  it('formats CREATE OR REPLACE FUNCTION with RETURNS, COMMENT and RETURN', () => {
    const input = "CREATE OR REPLACE FUNCTION my_catalog.my_schema.my_func(x INT) RETURNS INT COMMENT 'Adds one' RETURN x + 1;";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'CREATE OR REPLACE FUNCTION my_catalog.my_schema.my_func(x INT)\n' +
      'RETURNS INT\n' +
      "COMMENT 'Adds one'\n" +
      'RETURN x + 1;\n'
    );
  });

  it('formats CREATE FUNCTION without COMMENT', () => {
    const input = 'CREATE FUNCTION my_func(a STRING, b STRING) RETURNS STRING RETURN CONCAT(a, b);';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'CREATE FUNCTION my_func(a STRING, b STRING)\n' +
      'RETURNS STRING\n' +
      'RETURN CONCAT(a, b);\n'
    );
  });

  it('formats CREATE OR REPLACE FUNCTION without COMMENT clause', () => {
    const input = 'CREATE OR REPLACE FUNCTION my_ns.double_it(val INT) RETURNS INT RETURN val * 2;';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'CREATE OR REPLACE FUNCTION my_ns.double_it(val INT)\n' +
      'RETURNS INT\n' +
      'RETURN val * 2;\n'
    );
  });

  it('aligns comment with WHEN inside CASE block', () => {
    const input = "SELECT CASE /* check value */ WHEN x > 0 THEN 'pos' ELSE 'neg' END FROM t";
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'SELECT\n' +
      '  CASE\n' +
      '    /* check value */\n' +
      "    WHEN x > 0 THEN 'pos'\n" +
      "    ELSE 'neg'\n" +
      '  END\n' +
      'FROM t\n'
    );
  });

  // --- Dollar-quoted strings / YAML blocks ---

  it('preserves dollar-quoted YAML block content verbatim', () => {
    const input =
      'USE CATALOG IDENTIFIER(:catalog);\n\n' +
      'CREATE OR REPLACE VIEW gold_model_schema.fact_metrics\n' +
      'WITH METRICS\n' +
      'LANGUAGE YAML\n' +
      'AS $$\n' +
      '  version: 1.1\n' +
      '  comment: "Fact Table Metric View"\n' +
      '  source: gold_model_schema.fact_table\n' +
      '  dimensions:\n' +
      '    - name: Snapshot Date\n' +
      '      expr: snapshot_date\n' +
      '    - name: Region\n' +
      '      expr: region\n' +
      '  measures:\n' +
      '    - name: Record Count\n' +
      '      expr: COUNT(1)\n' +
      '$$;';
    const result = formatDatabricksSQL(input);
    expect(result).toBe(
      'USE CATALOG IDENTIFIER(:catalog);\n\n' +
      'CREATE OR REPLACE VIEW gold_model_schema.fact_metrics\n' +
      'WITH METRICS\n' +
      'LANGUAGE YAML AS $$\n' +
      '  version: 1.1\n' +
      '  comment: "Fact Table Metric View"\n' +
      '  source: gold_model_schema.fact_table\n' +
      '  dimensions:\n' +
      '    - name: Snapshot Date\n' +
      '      expr: snapshot_date\n' +
      '    - name: Region\n' +
      '      expr: region\n' +
      '  measures:\n' +
      '    - name: Record Count\n' +
      '      expr: COUNT(1)\n' +
      '$$;\n'
    );
  });

  it('treats LANGUAGE as a clause keyword with newline', () => {
    const input = 'CREATE VIEW v WITH METRICS LANGUAGE YAML AS $$content$$;';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('\nLANGUAGE');
    expect(result).toContain('LANGUAGE YAML');
  });

  it('applies keyword case to METRICS', () => {
    const input = 'CREATE VIEW v WITH metrics LANGUAGE yaml AS $$x$$;';
    const upper = formatDatabricksSQL(input);
    expect(upper).toContain('METRICS');

    const lower = formatDatabricksSQL(input, { keywordCase: 'lower' });
    expect(lower).toContain('metrics');
  });

  it('does not treat colons inside $$ as parameter markers', () => {
    const input = 'SELECT $$ key: value $$';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('$$ key: value $$');
  });

  it('handles empty dollar-quoted string', () => {
    const input = 'SELECT $$$$ AS empty_body';
    const result = formatDatabricksSQL(input);
    expect(result).toContain('$$$$');
  });

  it('still handles ${var} parameters with dollar-quoted string support', () => {
    const input = "SELECT * FROM ${catalog}.${schema}.my_table";
    const result = formatDatabricksSQL(input);
    expect(result).toContain('${catalog}');
    expect(result).toContain('${schema}');
  });
});
