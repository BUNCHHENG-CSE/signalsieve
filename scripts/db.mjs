import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, ".env");
const PRISMA_DIR = path.join(ROOT_DIR, "prisma");
const SCHEMA_MAIN = path.join(PRISMA_DIR, "schema.prisma");
const SCHEMA_SQLITE = path.join(PRISMA_DIR, "schema.sqlite.prisma");
const SCHEMA_POSTGRES = path.join(PRISMA_DIR, "schema.postgres.prisma");
const PRISMA_CLI = path.join(ROOT_DIR, "node_modules", "prisma", "build", "index.js");

function readEnvDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
      if (match) return match[1].trim();
    }
  }
  return "";
}

function updateEnvDatabaseUrl(newUrl) {
  let content = "";
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, "utf-8");
    if (/^DATABASE_URL\s*=/m.test(content)) {
      content = content.replace(/^DATABASE_URL\s*=.*$/m, `DATABASE_URL="${newUrl}"`);
    } else {
      content = `DATABASE_URL="${newUrl}"\n` + content;
    }
  } else {
    content = `DATABASE_URL="${newUrl}"\nPG_POOL_MAX=20\nPG_IDLE_TIMEOUT_MS=30000\nPG_CONN_TIMEOUT_MS=5000\nPG_SSL=true\n`;
  }
  fs.writeFileSync(ENV_PATH, content, "utf-8");
}

function detectEngine(url) {
  if (!url) return "sqlite";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return "postgres";
  }
  return "sqlite";
}

function syncSchema(engine) {
  const source = engine === "postgres" ? SCHEMA_POSTGRES : SCHEMA_SQLITE;
  if (!fs.existsSync(source)) {
    console.error(`[db.mjs] Source schema not found: ${source}`);
    process.exit(1);
  }
  const content = fs.readFileSync(source, "utf-8");
  fs.writeFileSync(SCHEMA_MAIN, content, "utf-8");
  console.log(`[db.mjs] Active Prisma schema synced to: ${engine.toUpperCase()} (${source})`);
}

function runPrismaCommand(subcommand, extraArgs = []) {
  const url = readEnvDatabaseUrl();
  const engine = detectEngine(url);
  syncSchema(engine);

  const command = `node "${PRISMA_CLI}" ${subcommand} --schema="${SCHEMA_MAIN}" ${extraArgs.join(" ")}`;
  console.log(`[db.mjs] Executing: ${command}`);
  try {
    execSync(command, { stdio: "inherit", env: process.env });
  } catch (err) {
    process.exit(err.status || 1);
  }
}

const action = process.argv[2] || "generate";

switch (action) {
  case "generate": {
    runPrismaCommand("generate");
    break;
  }
  case "push": {
    runPrismaCommand("db push", process.argv.slice(3));
    break;
  }
  case "studio": {
    runPrismaCommand("studio", process.argv.slice(3));
    break;
  }
  case "use:sqlite": {
    const sqliteUrl = "file:./data/signalsieve.db";
    updateEnvDatabaseUrl(sqliteUrl);
    syncSchema("sqlite");
    console.log(`[db.mjs] Set DATABASE_URL to local SQLite: ${sqliteUrl}`);
    runPrismaCommand("generate");
    runPrismaCommand("db push");
    console.log("[db.mjs] Local SQLite environment is ready!");
    break;
  }
  case "use:neon":
  case "use:postgres": {
    const targetUrl =
      process.argv[3] ||
      readEnvDatabaseUrl() ||
      "postgresql://user:password@ep-cool-snowflake-123456.us-east-2.aws.neon.tech/neondb?sslmode=require";
    updateEnvDatabaseUrl(targetUrl);
    syncSchema("postgres");
    console.log(`[db.mjs] Set DATABASE_URL to Neon PostgreSQL: ${targetUrl}`);
    runPrismaCommand("generate");
    if (process.argv[3]) {
      runPrismaCommand("db push");
    } else {
      console.log(
        "[db.mjs] Neon PostgreSQL schema active! Set your actual Neon connection string in .env and run 'bun run db:push'."
      );
    }
    break;
  }
  default: {
    runPrismaCommand(action, process.argv.slice(3));
    break;
  }
}
