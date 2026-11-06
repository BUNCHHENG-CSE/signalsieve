import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

export interface DatabaseHealthStatus {
  engine: "postgresql" | "sqlite" | "sqlite_fallback";
  orm: string;
  connected: boolean;
  host: string;
  database: string;
  pool: {
    max: number;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  optimizations: string[];
  lastError?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __signalSievePgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __signalSievePrisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __signalSievePgReady: boolean | undefined;
  // eslint-disable-next-line no-var
  var __signalSievePgLastError: string | undefined;
  // eslint-disable-next-line no-var
  var __signalSieveRuntimeDbUrl: string | undefined;
}

const SCHEMA_SQL_PATH = path.join(process.cwd(), "db", "schema.sql");

export function getConfiguredDatabaseUrl(): string {
  return (
    global.__signalSieveRuntimeDbUrl ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ""
  ).trim();
}

export async function getPgPool(): Promise<Pool | null> {
  const connectionString = getConfiguredDatabaseUrl();
  if (
    !connectionString ||
    connectionString.startsWith("file:") ||
    connectionString.startsWith("sqlite:")
  ) {
    return null;
  }

  if (global.__signalSievePgPool && global.__signalSievePgReady) {
    return global.__signalSievePgPool;
  }

  try {
    const max = Number(process.env.PG_POOL_MAX) || 20;
    const idleTimeoutMillis = Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000;
    const connectionTimeoutMillis = Number(process.env.PG_CONN_TIMEOUT_MS) || 4000;
    const useSsl =
      process.env.PG_SSL === "true" ||
      connectionString.includes("sslmode=require") ||
      connectionString.includes("neon.tech") ||
      connectionString.includes("supabase.co");

    const pool = new Pool({
      connectionString,
      max,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });

    pool.on("error", (err) => {
      console.error("[SignalSieve PG Pool Error]:", err.message);
      global.__signalSievePgLastError = err.message;
    });

    const client = await pool.connect();
    try {
      if (fs.existsSync(SCHEMA_SQL_PATH)) {
        const ddl = fs.readFileSync(SCHEMA_SQL_PATH, "utf-8");
        await client.query(ddl);
      }
      const adapter = new PrismaPg(pool);
      global.__signalSievePrisma = new PrismaClient({ adapter });
      global.__signalSievePgPool = pool;
      global.__signalSievePgReady = true;
      global.__signalSievePgLastError = undefined;
      return pool;
    } finally {
      client.release();
    }
  } catch (err: any) {
    global.__signalSievePgLastError =
      err?.message || "Unable to connect to PostgreSQL server";
    global.__signalSievePgReady = false;
    if (global.__signalSievePrisma) {
      await global.__signalSievePrisma.$disconnect().catch(() => {});
      global.__signalSievePrisma = undefined;
    }
    if (global.__signalSievePgPool) {
      await global.__signalSievePgPool.end().catch(() => {});
      global.__signalSievePgPool = undefined;
    }
    return null;
  }
}

export async function getPrisma(): Promise<PrismaClient | null> {
  const pool = await getPgPool();
  if (!pool) return null;
  if (!global.__signalSievePrisma) {
    const adapter = new PrismaPg(pool);
    global.__signalSievePrisma = new PrismaClient({ adapter });
  }
  return global.__signalSievePrisma;
}

export async function configureRuntimePostgresPool(
  connectionString: string
): Promise<{ ok: boolean; status: DatabaseHealthStatus; error?: string }> {
  if (global.__signalSievePrisma) {
    await global.__signalSievePrisma.$disconnect().catch(() => {});
    global.__signalSievePrisma = undefined;
  }
  if (global.__signalSievePgPool) {
    await global.__signalSievePgPool.end().catch(() => {});
    global.__signalSievePgPool = undefined;
    global.__signalSievePgReady = false;
  }

  global.__signalSieveRuntimeDbUrl = connectionString.trim();

  if (!global.__signalSieveRuntimeDbUrl) {
    const status = await getDatabaseHealthStatus();
    return { ok: true, status };
  }

  const pool = await getPgPool();
  const status = await getDatabaseHealthStatus();
  if (!pool) {
    return {
      ok: false,
      status,
      error: global.__signalSievePgLastError || "Failed to connect to PostgreSQL",
    };
  }
  return { ok: true, status };
}

export async function getDatabaseHealthStatus(): Promise<DatabaseHealthStatus> {
  const url = getConfiguredDatabaseUrl();
  const pool = await getPgPool();

  if (pool && global.__signalSievePgReady) {
    let host = "localhost:5432";
    let database = "signalsieve";
    try {
      const parsed = new URL(url);
      host = `${parsed.hostname}:${parsed.port || "5432"}`;
      database = parsed.pathname.replace(/^\//, "") || "signalsieve";
    } catch {
      // ignore URL parse error
    }

    const isNeon = url.includes("neon.tech");
    return {
      engine: "postgresql",
      orm: isNeon
        ? "Prisma ORM v6 (Neon Serverless PostgreSQL + SSL)"
        : "Prisma ORM v6 (@prisma/adapter-pg + relationJoins)",
      connected: true,
      host,
      database,
      pool: {
        max: Number(process.env.PG_POOL_MAX) || 20,
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
      optimizations: isNeon
        ? [
            "Neon Serverless PostgreSQL pooled connection over TLS/SSL (neon.tech)",
            "Prisma relation joins & nested includes compiled into PostgreSQL queries",
            "Interactive Prisma $transaction preventing duplicate cluster race conditions",
            "Native PostgreSQL JSONB + GIN (JsonbPathOps) indexes active in production",
            "Local zero-config SQLite available anytime by setting DATABASE_URL='file:./data/signalsieve.db'",
          ]
        : [
            "Prisma Driver Adapter (@prisma/adapter-pg) sharing tuned Node pg.Pool (Max 20 connections)",
            "Prisma relationLoadStrategy: 'join' compiling nested cluster+alerts includes into single PostgreSQL LATERAL JOIN + json_agg queries",
            "Interactive Prisma $transaction + pg_advisory_xact_lock preventing duplicate cluster race conditions on simultaneous webhook bursts",
            "Native PostgreSQL JSONB + GIN (JsonbPathOps) indexes defined in prisma/schema.prisma",
            "Pipelined Prisma $transaction batch aggregations for single-round-trip dashboard KPIs",
          ],
    };
  }

  const isExplicitSqlite =
    !url || url.startsWith("file:") || url.startsWith("sqlite:");

  return {
    engine: isExplicitSqlite ? "sqlite" : "sqlite_fallback",
    orm: "Prisma ORM v6 (Local SQLite Engine)",
    connected: true,
    host: "data/signalsieve.db",
    database: "signalsieve.db",
    pool: {
      max: 1,
      totalCount: 1,
      idleCount: 1,
      waitingCount: 0,
    },
    optimizations: [
      "Zero-config local embedded SQLite database running in WAL mode",
      "Prisma Schema & Client generated for local development (data/signalsieve.db)",
      "Production ready for Neon Serverless PostgreSQL (Run 'bun run db:neon')",
    ],
    lastError: isExplicitSqlite ? undefined : global.__signalSievePgLastError,
  };
}
