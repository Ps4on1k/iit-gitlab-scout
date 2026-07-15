import { createClient, type ClickHouseClient } from "@clickhouse/client";

let _client: ClickHouseClient | null = null;

export function getClickHouse(): ClickHouseClient {
  if (_client) return _client;

  const host = process.env.CLICKHOUSE_URL || "http://clickhouse:8123";
  const database = process.env.CLICKHOUSE_DB || "gitlab_scout";
  const username = process.env.CLICKHOUSE_USER || "admin";
  const password = process.env.CLICKHOUSE_PASSWORD || "changeme";

  _client = createClient({
    host,
    database,
    username,
    password,
  });

  return _client;
}

export async function closeClickHouse(): Promise<void> {
  if (_client) {
    await _client.close();
    _client = null;
  }
}
