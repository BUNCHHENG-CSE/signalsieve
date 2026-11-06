import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Prisma } from "@prisma/client";
import { computePairCorrelation } from "./clustering";
import { buildPatternSignature, normalizeIncomingPayload } from "./normalizers";
import {
  configureRuntimePostgresPool,
  DatabaseHealthStatus,
  getDatabaseHealthStatus,
  getPrisma,
} from "./pg-pool";
import { computeClusterRanking } from "./ranking";
import { SCENARIOS } from "./scenarios";
import { generateDeterministicSummary, generateHybridClusterSummary } from "./summarizer";
import {
  AlertCluster,
  AlertSource,
  ClusteringConfig,
  ClusterStatus,
  RawAlert,
  SuppressionMatchCriteria,
  SuppressionRule,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "signalsieve.db");

declare global {
  // eslint-disable-next-line no-var
  var __signalSieveDb: DatabaseSync | undefined;
  // eslint-disable-next-line no-var
  var __signalSievePgSeeded: boolean | undefined;
}

// ============================================================================
// Row / Model Normalization Helpers (Prisma JSONB/Date & SQLite fallback)
// ============================================================================

function parseJsonColumn<T>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toIsoString(val: any): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function rowToAlert(row: Record<string, any>): RawAlert {
  return {
    id: String(row.id),
    source: row.source as AlertSource,
    external_id: String(row.external_id),
    timestamp: toIsoString(row.timestamp),
    ingested_at: toIsoString(row.ingested_at),
    title: String(row.title),
    description: String(row.description),
    severity: row.severity,
    service: String(row.service),
    environment: row.environment,
    host: String(row.host),
    entity_tags: parseJsonColumn(row.entity_tags, {}),
    fingerprint: String(row.fingerprint),
    cluster_id: row.cluster_id ? String(row.cluster_id) : null,
    suppressed: Boolean(row.suppressed),
    suppression_rule_id: row.suppression_rule_id ? String(row.suppression_rule_id) : null,
    raw_payload: parseJsonColumn(row.raw_payload, {}),
  };
}

function rowToCluster(row: Record<string, any>, alerts?: RawAlert[]): AlertCluster {
  const embeddedAlerts =
    alerts !== undefined
      ? alerts
      : Array.isArray(row.alerts)
      ? row.alerts.map(rowToAlert)
      : Array.isArray(row.alerts_json)
      ? row.alerts_json.map(rowToAlert)
      : undefined;

  return {
    id: String(row.id),
    title: String(row.title),
    context_summary: String(row.context_summary),
    root_cause_hypothesis: String(row.root_cause_hypothesis),
    recommended_action: String(row.recommended_action),
    summary_source: row.summary_source,
    status: row.status as ClusterStatus,
    urgency_score: Number(row.urgency_score),
    blast_radius_score: Number(row.blast_radius_score),
    ranking_breakdown: parseJsonColumn(row.ranking_breakdown, {} as any),
    dependency_graph: parseJsonColumn(row.dependency_graph, { nodes: [], edges: [] }),
    alert_count: Number(row.alert_count),
    sources: parseJsonColumn(row.sources, []),
    services: parseJsonColumn(row.services, []),
    entities: parseJsonColumn(row.entities, []),
    highest_severity: row.highest_severity,
    environment: row.environment,
    first_seen: toIsoString(row.first_seen),
    last_seen: toIsoString(row.last_seen),
    pattern_signature: String(row.pattern_signature),
    alerts: embeddedAlerts,
  };
}

function rowToSuppressionRule(row: Record<string, any>): SuppressionRule {
  return {
    id: String(row.id),
    name: String(row.name),
    pattern_signature: String(row.pattern_signature),
    match_criteria: parseJsonColumn(row.match_criteria, {}),
    reason: String(row.reason),
    created_by: String(row.created_by),
    created_at: toIsoString(row.created_at),
    expires_at: toIsoString(row.expires_at),
    is_active: Boolean(row.is_active),
    suppressed_count: Number(row.suppressed_count),
  };
}

// ============================================================================
// Local SQLite Fallback Initialization (When Postgres is offline)
// ============================================================================

function getSqliteDb(): DatabaseSync {
  if (global.__signalSieveDb) {
    return global.__signalSieveDb;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS clustering_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      time_window_minutes INTEGER NOT NULL DEFAULT 15,
      entity_weight REAL NOT NULL DEFAULT 0.45,
      service_topology_weight REAL NOT NULL DEFAULT 0.30,
      text_similarity_weight REAL NOT NULL DEFAULT 0.25,
      similarity_threshold REAL NOT NULL DEFAULT 0.42,
      llm_provider TEXT NOT NULL DEFAULT 'deterministic',
      llm_api_key TEXT NOT NULL DEFAULT '',
      llm_model TEXT NOT NULL DEFAULT 'gpt-4o-mini'
    );

    INSERT OR IGNORE INTO clustering_config (
      id, time_window_minutes, entity_weight, service_topology_weight, text_similarity_weight, similarity_threshold, llm_provider, llm_api_key, llm_model
    ) VALUES (1, 15, 0.45, 0.30, 0.25, 0.42, 'deterministic', '', 'gpt-4o-mini');

    CREATE TABLE IF NOT EXISTS clusters (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      context_summary TEXT NOT NULL,
      root_cause_hypothesis TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      summary_source TEXT NOT NULL DEFAULT 'deterministic',
      status TEXT NOT NULL DEFAULT 'open',
      urgency_score REAL NOT NULL DEFAULT 50,
      blast_radius_score REAL NOT NULL DEFAULT 50,
      ranking_breakdown TEXT NOT NULL,
      dependency_graph TEXT NOT NULL,
      alert_count INTEGER NOT NULL DEFAULT 1,
      sources TEXT NOT NULL,
      services TEXT NOT NULL,
      entities TEXT NOT NULL,
      highest_severity TEXT NOT NULL,
      environment TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      pattern_signature TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppression_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pattern_signature TEXT NOT NULL,
      match_criteria TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      suppressed_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS raw_alerts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      service TEXT NOT NULL,
      environment TEXT NOT NULL,
      host TEXT NOT NULL,
      entity_tags TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      cluster_id TEXT,
      suppressed INTEGER NOT NULL DEFAULT 0,
      suppression_rule_id TEXT,
      raw_payload TEXT NOT NULL
    );
  `);

  global.__signalSieveDb = db;
  ensureSqliteInitialSeed(db);
  return db;
}

// ============================================================================
// Prisma ORM Seeding & Helpers
// ============================================================================

async function ensurePrismaInitialSeed(): Promise<void> {
  if (global.__signalSievePgSeeded) return;
  const prisma = await getPrisma();
  if (!prisma) return;

  const existingCount = await prisma.cluster.count();
  if (existingCount > 0) {
    global.__signalSievePgSeeded = true;
    return;
  }

  global.__signalSievePgSeeded = true;

  const now = new Date();
  const expires = new Date(now.getTime() + 21.5 * 60 * 60 * 1000);
  const created = new Date(now.getTime() - 2.5 * 60 * 60 * 1000);

  await prisma.suppressionRule.upsert({
    where: { id: "sup-seed-ntp-drift" },
    update: {},
    create: {
      id: "sup-seed-ntp-drift",
      name: "Staging Datadog Agent NTP Clock Skew Check",
      pattern_signature: "svc:datadog-agent:err:NTP_OFFSET_HIGH",
      match_criteria: {
        service: "datadog-agent",
        entity_key: "error_code",
        entity_value: "NTP_OFFSET_HIGH",
      },
      reason:
        "Known AWS Nitro hypervisor clock sync maintenance window in staging; non-actionable for on-call rotation (Tracked in OPS-412).",
      created_by: "sarah.chen@leanops.io (SecOps Lead)",
      created_at: created,
      expires_at: expires,
      is_active: true,
      suppressed_count: 18,
    },
  });

  const nowMs = Date.now();
  for (const scen of Object.values(SCENARIOS)) {
    for (const item of scen.alerts) {
      const ts = new Date(nowMs - item.offsetMinutesAgo * 60 * 1000).toISOString();
      await ingestAlertPayload(
        {
          ...item,
          timestamp: ts,
        },
        item.source
      );
    }
  }
}

function matchesSuppressionCriteria(
  rule: SuppressionRule,
  service: string,
  fingerprint: string,
  entityTags: Record<string, string>,
  patternSig: string
): boolean {
  if (rule.pattern_signature === patternSig) return true;
  const mc = rule.match_criteria;
  if (mc.pattern_signature && mc.pattern_signature === patternSig) return true;
  if (mc.entity_key && mc.entity_value) {
    if (entityTags[mc.entity_key]?.toLowerCase() === mc.entity_value.toLowerCase()) {
      return true;
    }
  }
  if (mc.service && mc.fingerprint) {
    if (mc.service === service && mc.fingerprint === fingerprint) return true;
  } else if (mc.service && !mc.fingerprint && !mc.entity_key) {
    if (mc.service === service) return true;
  }
  return false;
}

async function rebuildClusterFromAlertsPrisma(
  tx: Prisma.TransactionClient,
  clusterId: string,
  overrideStatus?: ClusterStatus
): Promise<AlertCluster | null> {
  const alertRows = await tx.rawAlert.findMany({
    where: { cluster_id: clusterId },
    orderBy: { timestamp: "asc" },
  });
  if (alertRows.length === 0) return null;

  const alerts = alertRows.map(rowToAlert);
  const ranking = computeClusterRanking(alerts);
  const synth = generateDeterministicSummary(alerts);

  const uniqueSources = Array.from(new Set(alerts.map((a) => a.source)));
  const uniqueServices = Array.from(new Set(alerts.map((a) => a.service)));

  const entitySet = new Set<string>();
  const mergedTags: Record<string, string> = {};
  for (const a of alerts) {
    for (const [k, v] of Object.entries(a.entity_tags)) {
      if (v) {
        entitySet.add(`${k}:${v}`);
        if (!mergedTags[k]) mergedTags[k] = v;
      }
    }
  }

  const firstSeen = new Date(alerts[0].timestamp);
  const lastSeen = new Date(alerts[alerts.length - 1].timestamp);
  const patternSig = buildPatternSignature(
    alerts[0].service,
    mergedTags,
    alerts[0].fingerprint
  );

  const existing = await tx.cluster.findUnique({
    where: { id: clusterId },
    select: { status: true },
  });
  const status: ClusterStatus =
    overrideStatus || (existing?.status as ClusterStatus) || "open";

  const upserted = await tx.cluster.upsert({
    where: { id: clusterId },
    create: {
      id: clusterId,
      title: synth.title,
      context_summary: synth.context_summary,
      root_cause_hypothesis: synth.root_cause_hypothesis,
      recommended_action: synth.recommended_action,
      summary_source: synth.summary_source,
      status,
      urgency_score: ranking.urgencyScore,
      blast_radius_score: ranking.blastRadiusScore,
      ranking_breakdown: ranking.breakdown as any,
      dependency_graph: ranking.dependencyGraph as any,
      alert_count: alerts.length,
      sources: uniqueSources as any,
      services: uniqueServices as any,
      entities: Array.from(entitySet) as any,
      highest_severity: ranking.highestSeverity,
      environment: ranking.dominantEnvironment,
      first_seen: firstSeen,
      last_seen: lastSeen,
      pattern_signature: patternSig,
    },
    update: {
      title: synth.title,
      context_summary: synth.context_summary,
      root_cause_hypothesis: synth.root_cause_hypothesis,
      recommended_action: synth.recommended_action,
      summary_source: synth.summary_source,
      status,
      urgency_score: ranking.urgencyScore,
      blast_radius_score: ranking.blastRadiusScore,
      ranking_breakdown: ranking.breakdown as any,
      dependency_graph: ranking.dependencyGraph as any,
      alert_count: alerts.length,
      sources: uniqueSources as any,
      services: uniqueServices as any,
      entities: Array.from(entitySet) as any,
      highest_severity: ranking.highestSeverity,
      environment: ranking.dominantEnvironment,
      first_seen: firstSeen,
      last_seen: lastSeen,
      pattern_signature: patternSig,
    },
  });

  return rowToCluster(upserted, alerts);
}

// ============================================================================
// Exported Async Database API (Prisma ORM Primary + Local SQLite Fallback)
// ============================================================================

export async function getDbStatus(): Promise<DatabaseHealthStatus> {
  return getDatabaseHealthStatus();
}

export async function switchPostgresConnection(url: string) {
  const res = await configureRuntimePostgresPool(url);
  if (res.ok && res.status.engine === "postgresql") {
    global.__signalSievePgSeeded = false;
    await ensurePrismaInitialSeed();
  }
  return res;
}

export async function getClusteringConfig(): Promise<ClusteringConfig> {
  const prisma = await getPrisma();
  if (prisma) {
    await ensurePrismaInitialSeed();
    const row = await prisma.clusteringConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    return {
      time_window_minutes: Number(row.time_window_minutes),
      entity_weight: Number(row.entity_weight),
      service_topology_weight: Number(row.service_topology_weight),
      text_similarity_weight: Number(row.text_similarity_weight),
      similarity_threshold: Number(row.similarity_threshold),
      llm_provider: row.llm_provider as any,
      llm_api_key: String(row.llm_api_key || ""),
      llm_model: String(row.llm_model || "gpt-4o-mini"),
    };
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM clustering_config WHERE id = 1")
    .get() as Record<string, any>;
  return {
    time_window_minutes: Number(row.time_window_minutes),
    entity_weight: Number(row.entity_weight),
    service_topology_weight: Number(row.service_topology_weight),
    text_similarity_weight: Number(row.text_similarity_weight),
    similarity_threshold: Number(row.similarity_threshold),
    llm_provider: row.llm_provider,
    llm_api_key: String(row.llm_api_key || ""),
    llm_model: String(row.llm_model || "gpt-4o-mini"),
  };
}

export async function updateClusteringConfig(
  partial: Partial<ClusteringConfig>
): Promise<ClusteringConfig> {
  const current = await getClusteringConfig();
  const next: ClusteringConfig = { ...current, ...partial };

  const prisma = await getPrisma();
  if (prisma) {
    await prisma.clusteringConfig.update({
      where: { id: 1 },
      data: {
        time_window_minutes: next.time_window_minutes,
        entity_weight: next.entity_weight,
        service_topology_weight: next.service_topology_weight,
        text_similarity_weight: next.text_similarity_weight,
        similarity_threshold: next.similarity_threshold,
        llm_provider: next.llm_provider,
        llm_api_key: next.llm_api_key,
        llm_model: next.llm_model,
      },
    });
    return next;
  }

  const db = getSqliteDb();
  db.prepare(
    `UPDATE clustering_config
     SET time_window_minutes = ?,
         entity_weight = ?,
         service_topology_weight = ?,
         text_similarity_weight = ?,
         similarity_threshold = ?,
         llm_provider = ?,
         llm_api_key = ?,
         llm_model = ?
     WHERE id = 1`
  ).run(
    next.time_window_minutes,
    next.entity_weight,
    next.service_topology_weight,
    next.text_similarity_weight,
    next.similarity_threshold,
    next.llm_provider,
    next.llm_api_key,
    next.llm_model
  );
  return next;
}

export async function ingestAlertPayload(
  rawPayload: Record<string, any>,
  explicitSource?: AlertSource
): Promise<{
  alert: RawAlert;
  suppressed: boolean;
  matchedRule: SuppressionRule | null;
  cluster: AlertCluster | null;
}> {
  const prisma = await getPrisma();
  if (prisma) {
    await ensurePrismaInitialSeed();
    return prisma.$transaction(async (tx) => {
      const normalized = normalizeIncomingPayload(rawPayload, explicitSource);
      const alertId = `alt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ingestedAt = new Date();
      const alertTimestamp = new Date(normalized.timestamp);
      const patternSig = buildPatternSignature(
        normalized.service,
        normalized.entity_tags,
        normalized.fingerprint
      );

      // Transaction-scoped PostgreSQL advisory lock via Prisma $executeRaw
      // Serializes simultaneous webhooks sharing the same patternSig without table locks
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${patternSig}))`;

      const cfgRow = await tx.clusteringConfig.findUnique({ where: { id: 1 } });
      const config: ClusteringConfig = {
        time_window_minutes: Number(cfgRow?.time_window_minutes ?? 15),
        entity_weight: Number(cfgRow?.entity_weight ?? 0.45),
        service_topology_weight: Number(cfgRow?.service_topology_weight ?? 0.3),
        text_similarity_weight: Number(cfgRow?.text_similarity_weight ?? 0.25),
        similarity_threshold: Number(cfgRow?.similarity_threshold ?? 0.42),
        llm_provider: (cfgRow?.llm_provider as any) || "deterministic",
        llm_api_key: String(cfgRow?.llm_api_key || ""),
        llm_model: String(cfgRow?.llm_model || "gpt-4o-mini"),
      };

      // Step 1: Check active 24h pattern suppressions via Prisma
      const activeRules = await tx.suppressionRule.findMany({
        where: {
          is_active: true,
          expires_at: { gt: new Date() },
        },
        orderBy: { created_at: "desc" },
      });

      let matchedRule: SuppressionRule | null = null;
      for (const rRow of activeRules) {
        const rule = rowToSuppressionRule(rRow);
        if (
          matchesSuppressionCriteria(
            rule,
            normalized.service,
            normalized.fingerprint,
            normalized.entity_tags,
            patternSig
          )
        ) {
          matchedRule = rule;
          break;
        }
      }

      if (matchedRule) {
        const inserted = await tx.rawAlert.create({
          data: {
            id: alertId,
            source: normalized.source,
            external_id: normalized.external_id,
            timestamp: alertTimestamp,
            ingested_at: ingestedAt,
            title: normalized.title,
            description: normalized.description,
            severity: normalized.severity,
            service: normalized.service,
            environment: normalized.environment,
            host: normalized.host,
            entity_tags: normalized.entity_tags as any,
            fingerprint: normalized.fingerprint,
            cluster_id: null,
            suppressed: true,
            suppression_rule_id: matchedRule.id,
            raw_payload: normalized.raw_payload as any,
          },
        });

        const updatedRule = await tx.suppressionRule.update({
          where: { id: matchedRule.id },
          data: { suppressed_count: { increment: 1 } },
        });

        return {
          alert: rowToAlert(inserted),
          suppressed: true,
          matchedRule: rowToSuppressionRule(updatedRule),
          cluster: null,
        };
      }

      // Step 2: Fetch open candidate clusters + recent alerts in 1 query
      const candidateClusters = await (tx.cluster.findMany as any)({
        where: { status: { in: ["open", "acknowledged"] } },
        relationLoadStrategy: "join",
        include: {
          alerts: {
            orderBy: { timestamp: "desc" },
            take: 12,
          },
        },
        orderBy: { last_seen: "desc" },
      });

      let targetClusterId: string | null = null;
      let bestScore = -1;

      for (const cRow of candidateClusters) {
        const members = cRow.alerts.map(rowToAlert);
        if (members.length === 0) continue;

        const latestMember = members[0];
        const windowCheck = computePairCorrelation(normalized, latestMember, config);
        if (!windowCheck.withinWindow) continue;

        if (cRow.pattern_signature === patternSig) {
          targetClusterId = cRow.id;
          bestScore = 1.0;
          break;
        }

        let maxClusterMemberScore = 0;
        for (const m of members) {
          const pair = computePairCorrelation(normalized, m, config);
          if (pair.score > maxClusterMemberScore) {
            maxClusterMemberScore = pair.score;
          }
        }

        if (
          maxClusterMemberScore >= config.similarity_threshold &&
          maxClusterMemberScore > bestScore
        ) {
          bestScore = maxClusterMemberScore;
          targetClusterId = cRow.id;
        }
      }

      const isNewCluster = !targetClusterId;
      if (!targetClusterId) {
        targetClusterId = `inc-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;

        await tx.cluster.create({
          data: {
            id: targetClusterId,
            title: normalized.title,
            context_summary: "",
            root_cause_hypothesis: "",
            recommended_action: "",
            summary_source: "deterministic",
            status: "open",
            urgency_score: 50,
            blast_radius_score: 50,
            ranking_breakdown: {},
            dependency_graph: { nodes: [], edges: [] },
            alert_count: 1,
            sources: [],
            services: [],
            entities: [],
            highest_severity: normalized.severity,
            environment: normalized.environment,
            first_seen: alertTimestamp,
            last_seen: alertTimestamp,
            pattern_signature: patternSig,
          },
        });
      }

      const insertedAlert = await tx.rawAlert.create({
        data: {
          id: alertId,
          source: normalized.source,
          external_id: normalized.external_id,
          timestamp: alertTimestamp,
          ingested_at: ingestedAt,
          title: normalized.title,
          description: normalized.description,
          severity: normalized.severity,
          service: normalized.service,
          environment: normalized.environment,
          host: normalized.host,
          entity_tags: normalized.entity_tags as any,
          fingerprint: normalized.fingerprint,
          cluster_id: targetClusterId,
          suppressed: false,
          suppression_rule_id: null,
          raw_payload: normalized.raw_payload as any,
        },
      });

      const cluster = await rebuildClusterFromAlertsPrisma(
        tx,
        targetClusterId,
        isNewCluster ? "open" : undefined
      );

      return {
        alert: rowToAlert(insertedAlert),
        suppressed: false,
        matchedRule: null,
        cluster,
      };
    });
  }

  return ingestAlertPayloadSqlite(rawPayload, explicitSource);
}

export async function listClusters(options?: {
  status?: string;
  includeAlerts?: boolean;
}): Promise<AlertCluster[]> {
  const prisma = await getPrisma();
  if (prisma) {
    await ensurePrismaInitialSeed();
    const where: Prisma.ClusterWhereInput =
      options?.status && options.status !== "all"
        ? { status: options.status }
        : {};

    if (options?.includeAlerts) {
      // Prisma relation query compatible with both PostgreSQL and SQLite relation loaders
      const rows = await (prisma.cluster.findMany as any)({
        where,
        relationLoadStrategy: "join",
        include: {
          alerts: {
            orderBy: { timestamp: "desc" },
          },
        },
        orderBy: [
          { urgency_score: "desc" },
          { blast_radius_score: "desc" },
          { last_seen: "desc" },
        ],
      });
      return rows.map((r: any) => rowToCluster(r));
    }

    const rows = await prisma.cluster.findMany({
      where,
      orderBy: [
        { urgency_score: "desc" },
        { blast_radius_score: "desc" },
        { last_seen: "desc" },
      ],
    });
    return rows.map((r) => rowToCluster(r, []));
  }

  const db = getSqliteDb();
  let query = "SELECT * FROM clusters";
  const params: any[] = [];

  if (options?.status && options.status !== "all") {
    query += " WHERE status = ?";
    params.push(options.status);
  }

  query += " ORDER BY urgency_score DESC, blast_radius_score DESC, last_seen DESC";

  const rows = db.prepare(query).all(...params) as Record<string, any>[];
  return rows.map((row) => {
    let alerts: RawAlert[] | undefined;
    if (options?.includeAlerts) {
      const alertRows = db
        .prepare("SELECT * FROM raw_alerts WHERE cluster_id = ? ORDER BY timestamp DESC")
        .all(String(row.id)) as Record<string, any>[];
      alerts = alertRows.map(rowToAlert);
    }
    return rowToCluster(row, alerts);
  });
}

export async function getClusterById(clusterId: string): Promise<AlertCluster | null> {
  const prisma = await getPrisma();
  if (prisma) {
    await ensurePrismaInitialSeed();
    const row = await (prisma.cluster.findUnique as any)({
      where: { id: clusterId },
      relationLoadStrategy: "join",
      include: {
        alerts: {
          orderBy: { timestamp: "desc" },
        },
      },
    });
    if (!row) return null;
    return rowToCluster(row);
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM clusters WHERE id = ?")
    .get(clusterId) as Record<string, any> | undefined;
  if (!row) return null;

  const alertRows = db
    .prepare("SELECT * FROM raw_alerts WHERE cluster_id = ? ORDER BY timestamp DESC")
    .all(clusterId) as Record<string, any>[];
  return rowToCluster(row, alertRows.map(rowToAlert));
}

export async function updateClusterStatus(
  clusterId: string,
  status: ClusterStatus
): Promise<AlertCluster | null> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.cluster.update({
      where: { id: clusterId },
      data: { status },
    });
    return getClusterById(clusterId);
  }

  const db = getSqliteDb();
  db.prepare("UPDATE clusters SET status = ? WHERE id = ?").run(status, clusterId);
  return getClusterById(clusterId);
}

export async function bulkUpdateClusterStatus(
  clusterIds: string[],
  status: ClusterStatus
): Promise<number> {
  if (!clusterIds || clusterIds.length === 0) return 0;
  const prisma = await getPrisma();
  if (prisma) {
    const res = await prisma.cluster.updateMany({
      where: { id: { in: clusterIds } },
      data: { status },
    });
    return res.count;
  }

  const db = getSqliteDb();
  const placeholders = clusterIds.map(() => "?").join(",");
  const stmt = db.prepare(`UPDATE clusters SET status = ? WHERE id IN (${placeholders})`);
  const res = stmt.run(status, ...clusterIds);
  return Number(res.changes);
}

export async function bulkSuppressClusters(
  clusterIds: string[],
  reason: string,
  createdBy: string = "alex@leanops.io (On-Call SRE)"
): Promise<number> {
  if (!clusterIds || clusterIds.length === 0) return 0;
  for (const clusterId of clusterIds) {
    const cluster = await getClusterById(clusterId);
    if (!cluster) continue;
    await createSuppressionRule({
      name: `Bulk 24h Suppress: ${cluster.title.slice(0, 50)}`,
      pattern_signature: cluster.pattern_signature,
      match_criteria: {
        pattern_signature: cluster.pattern_signature,
        service: cluster.services[0],
      },
      reason: reason.trim() || "Bulk suppressed via Triage Cockpit",
      created_by: createdBy,
      durationHours: 24,
      clusterId: cluster.id,
    });
  }
  return clusterIds.length;
}

export async function regenerateClusterSummaryWithLLM(
  clusterId: string
): Promise<AlertCluster | null> {
  const cluster = await getClusterById(clusterId);
  if (!cluster || !cluster.alerts || cluster.alerts.length === 0) return null;

  const config = await getClusteringConfig();
  const generated = await generateHybridClusterSummary(cluster.alerts, {
    provider: config.llm_provider,
    apiKey: config.llm_api_key,
    model: config.llm_model,
  });

  const prisma = await getPrisma();
  if (prisma) {
    await prisma.cluster.update({
      where: { id: clusterId },
      data: {
        title: generated.title,
        context_summary: generated.context_summary,
        root_cause_hypothesis: generated.root_cause_hypothesis,
        recommended_action: generated.recommended_action,
        summary_source: generated.summary_source,
      },
    });
    return getClusterById(clusterId);
  }

  const db = getSqliteDb();
  db.prepare(
    `UPDATE clusters
     SET title = ?,
         context_summary = ?,
         root_cause_hypothesis = ?,
         recommended_action = ?,
         summary_source = ?
     WHERE id = ?`
  ).run(
    generated.title,
    generated.context_summary,
    generated.root_cause_hypothesis,
    generated.recommended_action,
    generated.summary_source,
    clusterId
  );

  return getClusterById(clusterId);
}

export async function listSuppressionRules(): Promise<SuppressionRule[]> {
  const prisma = await getPrisma();
  if (prisma) {
    await ensurePrismaInitialSeed();
    const rows = await prisma.suppressionRule.findMany({
      orderBy: [{ is_active: "desc" }, { created_at: "desc" }],
    });
    return rows.map(rowToSuppressionRule);
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM suppression_rules ORDER BY is_active DESC, created_at DESC")
    .all() as Record<string, any>[];
  return rows.map(rowToSuppressionRule);
}

export async function createSuppressionRule(input: {
  name: string;
  pattern_signature: string;
  match_criteria?: SuppressionMatchCriteria;
  reason: string;
  created_by?: string;
  durationHours?: number;
  clusterId?: string;
}): Promise<SuppressionRule> {
  const id = `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const durationHours = input.durationHours || 24;
  const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  const matchCriteria: SuppressionMatchCriteria = input.match_criteria || {
    pattern_signature: input.pattern_signature,
  };

  const prisma = await getPrisma();
  if (prisma) {
    return prisma.$transaction(async (tx) => {
      await tx.suppressionRule.create({
        data: {
          id,
          name: input.name,
          pattern_signature: input.pattern_signature,
          match_criteria: matchCriteria as any,
          reason: input.reason,
          created_by: input.created_by || "alex@leanops.io (On-Call SRE)",
          created_at: now,
          expires_at: expiresAt,
          is_active: true,
          suppressed_count: 0,
        },
      });

      let affectedAlertsCount = 0;

      if (input.clusterId) {
        affectedAlertsCount = await tx.rawAlert.count({
          where: { cluster_id: input.clusterId },
        });
        await tx.cluster.update({
          where: { id: input.clusterId },
          data: { status: "suppressed" },
        });
        await tx.rawAlert.updateMany({
          where: { cluster_id: input.clusterId },
          data: { suppressed: true, suppression_rule_id: id },
        });
      } else {
        const matchingClusters = await tx.cluster.findMany({
          where: {
            pattern_signature: input.pattern_signature,
            status: { in: ["open", "acknowledged"] },
          },
          select: { id: true, alert_count: true },
        });
        for (const mc of matchingClusters) {
          affectedAlertsCount += Number(mc.alert_count);
          await tx.cluster.update({
            where: { id: mc.id },
            data: { status: "suppressed" },
          });
          await tx.rawAlert.updateMany({
            where: { cluster_id: mc.id },
            data: { suppressed: true, suppression_rule_id: id },
          });
        }
      }

      const updated = await tx.suppressionRule.update({
        where: { id },
        data: { suppressed_count: affectedAlertsCount },
      });
      return rowToSuppressionRule(updated);
    });
  }

  const db = getSqliteDb();
  let affectedAlertsCount = 0;

  if (input.clusterId) {
    const clusterAlerts = db
      .prepare("SELECT COUNT(*) as cnt FROM raw_alerts WHERE cluster_id = ?")
      .get(input.clusterId) as { cnt: number };
    affectedAlertsCount = Number(clusterAlerts?.cnt || 0);

    db.prepare("UPDATE clusters SET status = 'suppressed' WHERE id = ?").run(
      input.clusterId
    );
    db.prepare(
      "UPDATE raw_alerts SET suppressed = 1, suppression_rule_id = ? WHERE cluster_id = ?"
    ).run(id, input.clusterId);
  } else {
    const matchingClusters = db
      .prepare(
        "SELECT id, alert_count FROM clusters WHERE pattern_signature = ? AND status IN ('open', 'acknowledged')"
      )
      .all(input.pattern_signature) as { id: string; alert_count: number }[];

    for (const mc of matchingClusters) {
      affectedAlertsCount += Number(mc.alert_count);
      db.prepare("UPDATE clusters SET status = 'suppressed' WHERE id = ?").run(mc.id);
      db.prepare(
        "UPDATE raw_alerts SET suppressed = 1, suppression_rule_id = ? WHERE cluster_id = ?"
      ).run(id, mc.id);
    }
  }

  db.prepare(
    `INSERT INTO suppression_rules (
      id, name, pattern_signature, match_criteria, reason, created_by,
      created_at, expires_at, is_active, suppressed_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    input.name,
    input.pattern_signature,
    JSON.stringify(matchCriteria),
    input.reason,
    input.created_by || "alex@leanops.io (On-Call SRE)",
    now.toISOString(),
    expiresAt.toISOString(),
    affectedAlertsCount
  );

  const row = db
    .prepare("SELECT * FROM suppression_rules WHERE id = ?")
    .get(id) as Record<string, any>;
  return rowToSuppressionRule(row);
}

export async function revokeSuppressionRule(
  ruleId: string
): Promise<SuppressionRule | null> {
  const prisma = await getPrisma();
  if (prisma) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.suppressionRule.findUnique({
        where: { id: ruleId },
      });
      if (!existing) return null;

      await tx.cluster.updateMany({
        where: {
          pattern_signature: existing.pattern_signature,
          status: "suppressed",
        },
        data: { status: "open" },
      });

      await tx.rawAlert.updateMany({
        where: { suppression_rule_id: ruleId },
        data: { suppressed: false, suppression_rule_id: null },
      });

      const updated = await tx.suppressionRule.update({
        where: { id: ruleId },
        data: { is_active: false },
      });
      return rowToSuppressionRule(updated);
    });
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM suppression_rules WHERE id = ?")
    .get(ruleId) as Record<string, any> | undefined;
  if (!row) return null;

  db.prepare("UPDATE suppression_rules SET is_active = 0 WHERE id = ?").run(ruleId);
  db.prepare(
    "UPDATE clusters SET status = 'open' WHERE pattern_signature = ? AND status = 'suppressed'"
  ).run(String(row.pattern_signature));
  db.prepare(
    "UPDATE raw_alerts SET suppressed = 0, suppression_rule_id = NULL WHERE suppression_rule_id = ?"
  ).run(ruleId);

  const updated = db
    .prepare("SELECT * FROM suppression_rules WHERE id = ?")
    .get(ruleId) as Record<string, any>;
  return rowToSuppressionRule(updated);
}

export async function getDashboardMetrics() {
  const prisma = await getPrisma();
  if (prisma) {
    await ensurePrismaInitialSeed();
    // Pipelined Prisma $transaction batch aggregation
    const [totalRaw, suppressionAgg, clusterAgg] = await prisma.$transaction([
      prisma.rawAlert.count(),
      prisma.suppressionRule.aggregate({
        where: { is_active: true },
        _sum: { suppressed_count: true },
        _count: { _all: true },
      }),
      prisma.cluster.aggregate({
        where: { status: { in: ["open", "acknowledged"] } },
        _count: { _all: true },
        _sum: { alert_count: true },
      }),
    ]);

    const suppressedCount = Number(suppressionAgg._sum.suppressed_count || 0);
    const activeAlertsInClusters = Number(clusterAgg._sum.alert_count || 0);
    const totalRawAlerts = Math.max(
      totalRaw,
      activeAlertsInClusters + suppressedCount
    );
    const activeClusters = Number(clusterAgg._count._all || 0);
    const noiseReductionPercent =
      totalRawAlerts > 0
        ? Number(
            (((totalRawAlerts - activeClusters) / totalRawAlerts) * 100).toFixed(1)
          )
        : 0;
    const deduplicatedAlerts = Math.max(0, totalRawAlerts - activeClusters);
    const estimatedMinutesSaved = Math.round(deduplicatedAlerts * 6.5);

    return {
      totalRawAlerts,
      activeClusters,
      suppressedAlertsCount: suppressedCount,
      activeSuppressionRulesCount: Number(suppressionAgg._count._all || 0),
      noiseReductionPercent,
      estimatedMinutesSaved,
    };
  }

  const db = getSqliteDb();
  const totalRawRow = db
    .prepare("SELECT COUNT(*) as cnt FROM raw_alerts")
    .get() as { cnt: number };
  const suppressedAlertsRow = db
    .prepare(
      "SELECT SUM(suppressed_count) as cnt FROM suppression_rules WHERE is_active = 1"
    )
    .get() as { cnt: number | null };
  const activeClustersRow = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM clusters WHERE status IN ('open', 'acknowledged')"
    )
    .get() as { cnt: number };
  const activeRulesRow = db
    .prepare("SELECT COUNT(*) as cnt FROM suppression_rules WHERE is_active = 1")
    .get() as { cnt: number };

  const activeAlertsInOpenClustersRow = db
    .prepare(
      "SELECT COALESCE(SUM(alert_count), 0) as cnt FROM clusters WHERE status IN ('open', 'acknowledged')"
    )
    .get() as { cnt: number };

  const suppressedCount = Number(suppressedAlertsRow?.cnt || 0);
  const totalRawAlerts = Math.max(
    Number(totalRawRow?.cnt || 0),
    Number(activeAlertsInOpenClustersRow?.cnt || 0) + suppressedCount
  );
  const activeClusters = Number(activeClustersRow?.cnt || 0);

  const noiseReductionPercent =
    totalRawAlerts > 0
      ? Number(
          (((totalRawAlerts - activeClusters) / totalRawAlerts) * 100).toFixed(1)
        )
      : 0;

  const deduplicatedAlerts = Math.max(0, totalRawAlerts - activeClusters);
  const estimatedMinutesSaved = Math.round(deduplicatedAlerts * 6.5);

  return {
    totalRawAlerts,
    activeClusters,
    suppressedAlertsCount: suppressedCount,
    activeSuppressionRulesCount: Number(activeRulesRow?.cnt || 0),
    noiseReductionPercent,
    estimatedMinutesSaved,
  };
}

export async function triggerScenarioSimulation(scenarioKey: string): Promise<{
  ingestedCount: number;
  suppressedCount: number;
  clustersTouched: string[];
}> {
  const scenariosToRun =
    scenarioKey === "all"
      ? Object.values(SCENARIOS)
      : SCENARIOS[scenarioKey]
      ? [SCENARIOS[scenarioKey]]
      : [];

  let ingestedCount = 0;
  let suppressedCount = 0;
  const clustersSet = new Set<string>();
  const nowMs = Date.now();

  for (const scen of scenariosToRun) {
    for (const item of scen.alerts) {
      const ts = new Date(nowMs - item.offsetMinutesAgo * 60 * 1000).toISOString();
      const res = await ingestAlertPayload(
        {
          ...item,
          external_id: `${item.external_id}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: ts,
        },
        item.source
      );
      ingestedCount++;
      if (res.suppressed) {
        suppressedCount++;
      } else if (res.cluster) {
        clustersSet.add(res.cluster.id);
      }
    }
  }

  return {
    ingestedCount,
    suppressedCount,
    clustersTouched: Array.from(clustersSet),
  };
}

export async function resetAndReseedDatabase(): Promise<void> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.$transaction([
      prisma.rawAlert.deleteMany(),
      prisma.cluster.deleteMany(),
      prisma.suppressionRule.deleteMany(),
    ]);
    global.__signalSievePgSeeded = false;
    await ensurePrismaInitialSeed();
    return;
  }

  const db = getSqliteDb();
  db.exec("DELETE FROM raw_alerts;");
  db.exec("DELETE FROM clusters;");
  db.exec("DELETE FROM suppression_rules;");
  ensureSqliteInitialSeed(db);
}

// ============================================================================
// Internal SQLite Fallback Helpers
// ============================================================================

function rebuildClusterFromAlertsSqlite(
  db: DatabaseSync,
  clusterId: string,
  overrideStatus?: ClusterStatus
): AlertCluster | null {
  const alertRows = db
    .prepare("SELECT * FROM raw_alerts WHERE cluster_id = ? ORDER BY timestamp ASC")
    .all(clusterId) as Record<string, any>[];

  if (alertRows.length === 0) return null;

  const alerts = alertRows.map(rowToAlert);
  const ranking = computeClusterRanking(alerts);
  const synth = generateDeterministicSummary(alerts);

  const uniqueSources = Array.from(new Set(alerts.map((a) => a.source)));
  const uniqueServices = Array.from(new Set(alerts.map((a) => a.service)));

  const entitySet = new Set<string>();
  const mergedTags: Record<string, string> = {};
  for (const a of alerts) {
    for (const [k, v] of Object.entries(a.entity_tags)) {
      if (v) {
        entitySet.add(`${k}:${v}`);
        if (!mergedTags[k]) mergedTags[k] = v;
      }
    }
  }

  const firstSeen = alerts[0].timestamp;
  const lastSeen = alerts[alerts.length - 1].timestamp;
  const patternSig = buildPatternSignature(
    alerts[0].service,
    mergedTags,
    alerts[0].fingerprint
  );

  const existingRow = db
    .prepare("SELECT * FROM clusters WHERE id = ?")
    .get(clusterId) as Record<string, any> | undefined;

  const status: ClusterStatus =
    overrideStatus || (existingRow?.status as ClusterStatus) || "open";

  if (existingRow) {
    db.prepare(
      `UPDATE clusters
       SET title = ?,
           context_summary = ?,
           root_cause_hypothesis = ?,
           recommended_action = ?,
           summary_source = ?,
           status = ?,
           urgency_score = ?,
           blast_radius_score = ?,
           ranking_breakdown = ?,
           dependency_graph = ?,
           alert_count = ?,
           sources = ?,
           services = ?,
           entities = ?,
           highest_severity = ?,
           environment = ?,
           first_seen = ?,
           last_seen = ?,
           pattern_signature = ?
       WHERE id = ?`
    ).run(
      synth.title,
      synth.context_summary,
      synth.root_cause_hypothesis,
      synth.recommended_action,
      synth.summary_source,
      status,
      ranking.urgencyScore,
      ranking.blastRadiusScore,
      JSON.stringify(ranking.breakdown),
      JSON.stringify(ranking.dependencyGraph),
      alerts.length,
      JSON.stringify(uniqueSources),
      JSON.stringify(uniqueServices),
      JSON.stringify(Array.from(entitySet)),
      ranking.highestSeverity,
      ranking.dominantEnvironment,
      firstSeen,
      lastSeen,
      patternSig,
      clusterId
    );
  } else {
    db.prepare(
      `INSERT INTO clusters (
        id, title, context_summary, root_cause_hypothesis, recommended_action, summary_source,
        status, urgency_score, blast_radius_score, ranking_breakdown, dependency_graph,
        alert_count, sources, services, entities, highest_severity, environment,
        first_seen, last_seen, pattern_signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      clusterId,
      synth.title,
      synth.context_summary,
      synth.root_cause_hypothesis,
      synth.recommended_action,
      synth.summary_source,
      status,
      ranking.urgencyScore,
      ranking.blastRadiusScore,
      JSON.stringify(ranking.breakdown),
      JSON.stringify(ranking.dependencyGraph),
      alerts.length,
      JSON.stringify(uniqueSources),
      JSON.stringify(uniqueServices),
      JSON.stringify(Array.from(entitySet)),
      ranking.highestSeverity,
      ranking.dominantEnvironment,
      firstSeen,
      lastSeen,
      patternSig
    );
  }

  const updatedRow = db
    .prepare("SELECT * FROM clusters WHERE id = ?")
    .get(clusterId) as Record<string, any>;
  return rowToCluster(updatedRow, alerts);
}

function ingestAlertPayloadSqlite(
  rawPayload: Record<string, any>,
  explicitSource?: AlertSource,
  dbInstance?: DatabaseSync
) {
  const db = dbInstance || getSqliteDb();
  const cfgRow = db
    .prepare("SELECT * FROM clustering_config WHERE id = 1")
    .get() as Record<string, any>;
  const config: ClusteringConfig = {
    time_window_minutes: Number(cfgRow.time_window_minutes),
    entity_weight: Number(cfgRow.entity_weight),
    service_topology_weight: Number(cfgRow.service_topology_weight),
    text_similarity_weight: Number(cfgRow.text_similarity_weight),
    similarity_threshold: Number(cfgRow.similarity_threshold),
    llm_provider: cfgRow.llm_provider,
    llm_api_key: String(cfgRow.llm_api_key || ""),
    llm_model: String(cfgRow.llm_model || "gpt-4o-mini"),
  };

  const normalized = normalizeIncomingPayload(rawPayload, explicitSource);
  const alertId = `alt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ingestedAt = new Date().toISOString();

  const patternSig = buildPatternSignature(
    normalized.service,
    normalized.entity_tags,
    normalized.fingerprint
  );

  const nowIso = new Date().toISOString();
  const ruleRows = db
    .prepare(
      "SELECT * FROM suppression_rules WHERE is_active = 1 AND expires_at > ? ORDER BY created_at DESC"
    )
    .all(nowIso) as Record<string, any>[];

  let matchedRule: SuppressionRule | null = null;
  for (const rRow of ruleRows) {
    const rule = rowToSuppressionRule(rRow);
    if (
      matchesSuppressionCriteria(
        rule,
        normalized.service,
        normalized.fingerprint,
        normalized.entity_tags,
        patternSig
      )
    ) {
      matchedRule = rule;
      break;
    }
  }

  if (matchedRule) {
    db.prepare(
      `INSERT INTO raw_alerts (
        id, source, external_id, timestamp, ingested_at, title, description,
        severity, service, environment, host, entity_tags, fingerprint,
        cluster_id, suppressed, suppression_rule_id, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`
    ).run(
      alertId,
      normalized.source,
      normalized.external_id,
      normalized.timestamp,
      ingestedAt,
      normalized.title,
      normalized.description,
      normalized.severity,
      normalized.service,
      normalized.environment,
      normalized.host,
      JSON.stringify(normalized.entity_tags),
      normalized.fingerprint,
      matchedRule.id,
      JSON.stringify(normalized.raw_payload)
    );

    db.prepare(
      "UPDATE suppression_rules SET suppressed_count = suppressed_count + 1 WHERE id = ?"
    ).run(matchedRule.id);

    const insertedRow = db
      .prepare("SELECT * FROM raw_alerts WHERE id = ?")
      .get(alertId) as Record<string, any>;
    return {
      alert: rowToAlert(insertedRow),
      suppressed: true,
      matchedRule: {
        ...matchedRule,
        suppressed_count: matchedRule.suppressed_count + 1,
      },
      cluster: null,
    };
  }

  const openClusterRows = db
    .prepare(
      "SELECT * FROM clusters WHERE status IN ('open', 'acknowledged') ORDER BY last_seen DESC"
    )
    .all() as Record<string, any>[];

  let targetClusterId: string | null = null;
  let bestScore = -1;

  for (const cRow of openClusterRows) {
    const memberRows = db
      .prepare("SELECT * FROM raw_alerts WHERE cluster_id = ? ORDER BY timestamp DESC LIMIT 12")
      .all(String(cRow.id)) as Record<string, any>[];

    if (memberRows.length === 0) continue;
    const members = memberRows.map(rowToAlert);

    const latestMember = members[0];
    const windowCheck = computePairCorrelation(normalized, latestMember, config);
    if (!windowCheck.withinWindow) continue;

    if (String(cRow.pattern_signature) === patternSig) {
      targetClusterId = String(cRow.id);
      bestScore = 1.0;
      break;
    }

    let maxClusterMemberScore = 0;
    for (const m of members) {
      const pair = computePairCorrelation(normalized, m, config);
      if (pair.score > maxClusterMemberScore) {
        maxClusterMemberScore = pair.score;
      }
    }

    if (
      maxClusterMemberScore >= config.similarity_threshold &&
      maxClusterMemberScore > bestScore
    ) {
      bestScore = maxClusterMemberScore;
      targetClusterId = String(cRow.id);
    }
  }

  if (!targetClusterId) {
    targetClusterId = `inc-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
  }

  db.prepare(
    `INSERT INTO raw_alerts (
      id, source, external_id, timestamp, ingested_at, title, description,
      severity, service, environment, host, entity_tags, fingerprint,
      cluster_id, suppressed, suppression_rule_id, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`
  ).run(
    alertId,
    normalized.source,
    normalized.external_id,
    normalized.timestamp,
    ingestedAt,
    normalized.title,
    normalized.description,
    normalized.severity,
    normalized.service,
    normalized.environment,
    normalized.host,
    JSON.stringify(normalized.entity_tags),
    normalized.fingerprint,
    targetClusterId,
    JSON.stringify(normalized.raw_payload)
  );

  const cluster = rebuildClusterFromAlertsSqlite(db, targetClusterId);
  const insertedRow = db
    .prepare("SELECT * FROM raw_alerts WHERE id = ?")
    .get(alertId) as Record<string, any>;

  return {
    alert: rowToAlert(insertedRow),
    suppressed: false,
    matchedRule: null,
    cluster,
  };
}

function ensureSqliteInitialSeed(db: DatabaseSync) {
  const existingCount = db
    .prepare("SELECT COUNT(*) as cnt FROM clusters")
    .get() as { cnt: number };
  if (Number(existingCount.cnt) > 0) {
    return;
  }

  const now = new Date();
  const expires = new Date(now.getTime() + 21.5 * 60 * 60 * 1000).toISOString();
  const created = new Date(now.getTime() - 2.5 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO suppression_rules (
      id, name, pattern_signature, match_criteria, reason, created_by,
      created_at, expires_at, is_active, suppressed_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    "sup-seed-ntp-drift",
    "Staging Datadog Agent NTP Clock Skew Check",
    "svc:datadog-agent:err:NTP_OFFSET_HIGH",
    JSON.stringify({
      service: "datadog-agent",
      entity_key: "error_code",
      entity_value: "NTP_OFFSET_HIGH",
    }),
    "Known AWS Nitro hypervisor clock sync maintenance window in staging; non-actionable for on-call rotation (Tracked in OPS-412).",
    "sarah.chen@leanops.io (SecOps Lead)",
    created,
    expires,
    18
  );

  const nowMs = Date.now();
  for (const scen of Object.values(SCENARIOS)) {
    for (const item of scen.alerts) {
      const ts = new Date(nowMs - item.offsetMinutesAgo * 60 * 1000).toISOString();
      ingestAlertPayloadSqlite(
        {
          ...item,
          timestamp: ts,
        },
        item.source,
        db
      );
    }
  }
}
