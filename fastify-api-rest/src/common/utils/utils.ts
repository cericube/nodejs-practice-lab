import { format } from 'sql-formatter';

export function clearSql(sql: string) {
  const stripped = sql.replace(/"([^"]+)"/g, '$1');

  return format(stripped, {
    language: 'postgresql',
  });
}
