import { AlertSource, Environment, Severity, ValidationAlertItem } from "./types";

export interface SimulatedAlertInput {
  source: AlertSource;
  external_id: string;
  offsetMinutesAgo: number;
  title: string;
  description: string;
  severity: Severity;
  service: string;
  environment: Environment;
  host: string;
  entity_tags: Record<string, string>;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  subtitle: string;
  alertCount: number;
  badge: string;
  alerts: SimulatedAlertInput[];
}

export const SCENARIOS: Record<string, ScenarioDefinition> = {
  expired_cert: {
    id: "expired_cert",
    name: "Expired TLS Certificate Cascade",
    subtitle:
      "12 alerts across 4 services (edge-gateway, checkout-api, billing-worker, auth-proxy) tracing to expired cert *.prod.internal.acme.io",
    alertCount: 12,
    badge: "12 Alerts → 1 Incident",
    alerts: [
      {
        source: "datadog",
        external_id: "dd-cert-101",
        offsetMinutesAgo: 11,
        title: "[Synthetics] TLS Handshake Failed on edge-gateway",
        description:
          "x509: certificate has expired or is not yet valid: CN=*.prod.internal.acme.io (CERT_HAS_EXPIRED) on edge-gateway-prod-01",
        severity: "critical",
        service: "edge-gateway",
        environment: "production",
        host: "edge-gateway-prod-01",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
          upstream_service: "edge-gateway",
        },
      },
      {
        source: "aws_cloudwatch",
        external_id: "cw-alb-102",
        offsetMinutesAgo: 10,
        title: "CloudWatch Alarm: prod-alb-TargetTLSNegotiationErrorCount-High",
        description:
          "TargetTLSNegotiationErrorCount > 250/min for target group tg-edge-gateway-prod using certificate *.prod.internal.acme.io",
        severity: "high",
        service: "edge-gateway",
        environment: "production",
        host: "alb-prod-us-east-1",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
          region: "us-east-1",
        },
      },
      {
        source: "pagerduty",
        external_id: "pd-chk-103",
        offsetMinutesAgo: 9,
        title: "HTTP 502 Bad Gateway Surge on checkout-api",
        description:
          "Upstream mTLS connection to edge-gateway rejected: SSL routines:tls_process_server_certificate:certificate verify failed (CN=*.prod.internal.acme.io)",
        severity: "critical",
        service: "checkout-api",
        environment: "production",
        host: "checkout-api-prod-02",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
          upstream_service: "edge-gateway",
        },
      },
      {
        source: "datadog",
        external_id: "dd-chk-104",
        offsetMinutesAgo: 9,
        title: "[APM] checkout-api p99 error rate > 38%",
        description:
          "Spike in TLS handshake exception CERT_HAS_EXPIRED calling https://internal.acme.io/v2/tokenize",
        severity: "high",
        service: "checkout-api",
        environment: "production",
        host: "checkout-api-prod-01",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
        },
      },
      {
        source: "pagerduty",
        external_id: "pd-auth-105",
        offsetMinutesAgo: 8,
        title: "OIDC Token Introspection Failing on auth-proxy",
        description:
          "auth-proxy unable to verify peer certificate *.prod.internal.acme.io on upstream edge-gateway",
        severity: "high",
        service: "auth-proxy",
        environment: "production",
        host: "auth-proxy-prod-01",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
          upstream_service: "edge-gateway",
        },
      },
      {
        source: "datadog",
        external_id: "dd-auth-106",
        offsetMinutesAgo: 8,
        title: "High 401/503 Authentication Rejections on auth-proxy",
        description:
          "JWKS fetch failed with X509_V_ERR_CERT_HAS_EXPIRED for domain *.prod.internal.acme.io",
        severity: "warning",
        service: "auth-proxy",
        environment: "production",
        host: "auth-proxy-prod-02",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
        },
      },
      {
        source: "datadog",
        external_id: "dd-bill-107",
        offsetMinutesAgo: 7,
        title: "Stripe Webhook Forwarder Retry Queue Growing on billing-worker",
        description:
          "TLS handshake error to internal gateway (CN=*.prod.internal.acme.io): CERT_HAS_EXPIRED",
        severity: "warning",
        service: "billing-worker",
        environment: "production",
        host: "billing-worker-prod-01",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
        },
      },
      {
        source: "pagerduty",
        external_id: "pd-bill-108",
        offsetMinutesAgo: 7,
        title: "Invoice Capture Job Failing on billing-worker",
        description:
          " Worker failed 50 consecutive RPC calls to checkout-api due to expired certificate *.prod.internal.acme.io",
        severity: "high",
        service: "billing-worker",
        environment: "production",
        host: "billing-worker-prod-03",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
        },
      },
      {
        source: "aws_cloudwatch",
        external_id: "cw-chk-109",
        offsetMinutesAgo: 6,
        title: "CloudWatch Alarm: checkout-api-HTTPCode_ELB_502_Count",
        description:
          "ELB 502 count exceeded threshold (410 in 1 min) due to upstream TLS cert *.prod.internal.acme.io expiration",
        severity: "high",
        service: "checkout-api",
        environment: "production",
        host: "alb-prod-us-east-1",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
        },
      },
      {
        source: "datadog",
        external_id: "dd-edge-110",
        offsetMinutesAgo: 6,
        title: "Envoy Proxy Upstream TLS Error Burst on edge-gateway",
        description:
          "envoy.cluster.upstream_cx_connect_fail spiking on listener 443 with cert *.prod.internal.acme.io",
        severity: "warning",
        service: "edge-gateway",
        environment: "production",
        host: "edge-gateway-prod-02",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
        },
      },
      {
        source: "pagerduty",
        external_id: "pd-chk-111",
        offsetMinutesAgo: 5,
        title: "Checkout Conversion Drop SLO Burn Rate > 14x",
        description:
          "Fast burn SLO alert on checkout-api caused by CERT_HAS_EXPIRED on *.prod.internal.acme.io",
        severity: "critical",
        service: "checkout-api",
        environment: "production",
        host: "checkout-api-prod-01",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
        },
      },
      {
        source: "datadog",
        external_id: "dd-cert-112",
        offsetMinutesAgo: 5,
        title: "Cert-Manager Renewal Secret Sync Failed on edge-gateway",
        description:
          "Kubernetes secret tls-prod-internal-acme-io failed ingress reload for *.prod.internal.acme.io",
        severity: "high",
        service: "edge-gateway",
        environment: "production",
        host: "edge-gateway-prod-01",
        entity_tags: {
          cert_cn: "*.prod.internal.acme.io",
          error_code: "CERT_HAS_EXPIRED",
        },
      },
    ],
  },

  db_pool_exhaustion: {
    id: "db_pool_exhaustion",
    name: "RDS Connection Pool Exhaustion",
    subtitle:
      "8 alerts across orders-service, inventory-api, and reporting-worker tracing to pgbouncer-prod-01",
    alertCount: 8,
    badge: "8 Alerts → 1 Incident",
    alerts: [
      {
        source: "aws_cloudwatch",
        external_id: "cw-rds-201",
        offsetMinutesAgo: 18,
        title: "CloudWatch Alarm: rds-orders-primary-DatabaseConnections-Max",
        description:
          "DatabaseConnections reached 99.4% of max_connections on rds-orders-primary (pgbouncer-prod-01)",
        severity: "high",
        service: "orders-service",
        environment: "production",
        host: "rds-orders-primary",
        entity_tags: {
          db_cluster: "rds-orders-primary",
          error_code: "FATAL_TOO_MANY_CONNECTIONS",
        },
      },
      {
        source: "datadog",
        external_id: "dd-ord-202",
        offsetMinutesAgo: 17,
        title: "PgBouncer Client Wait Time > 4500ms on orders-service",
        description:
          "Pool exhaustion on rds-orders-primary: FATAL_TOO_MANY_CONNECTIONS for role orders_app",
        severity: "high",
        service: "orders-service",
        environment: "production",
        host: "pgbouncer-prod-01",
        entity_tags: {
          db_cluster: "rds-orders-primary",
          error_code: "FATAL_TOO_MANY_CONNECTIONS",
        },
      },
      {
        source: "pagerduty",
        external_id: "pd-ord-203",
        offsetMinutesAgo: 16,
        title: "orders-service HTTP 500 Internal Server Error Spike",
        description:
          "PrismaClientInitializationError: Too many database connections open on rds-orders-primary (FATAL_TOO_MANY_CONNECTIONS)",
        severity: "critical",
        service: "orders-service",
        environment: "production",
        host: "orders-service-prod-01",
        entity_tags: {
          db_cluster: "rds-orders-primary",
          error_code: "FATAL_TOO_MANY_CONNECTIONS",
        },
      },
      {
        source: "datadog",
        external_id: "dd-inv-204",
        offsetMinutesAgo: 15,
        title: "Stock Reservation Query Timeout on inventory-api",
        description:
          "Timed out acquiring connection from pool rds-orders-primary after 5000ms (FATAL_TOO_MANY_CONNECTIONS)",
        severity: "high",
        service: "inventory-api",
        environment: "production",
        host: "inventory-api-prod-02",
        entity_tags: {
          db_cluster: "rds-orders-primary",
          error_code: "FATAL_TOO_MANY_CONNECTIONS",
        },
      },
      {
        source: "pagerduty",
        external_id: "pd-inv-205",
        offsetMinutesAgo: 15,
        title: "inventory-api gRPC Deadline Exceeded Rate > 15%",
        description:
          "Downstream DB lock contention on rds-orders-primary starving inventory-api read replicas",
        severity: "warning",
        service: "inventory-api",
        environment: "production",
        host: "inventory-api-prod-01",
        entity_tags: {
          db_cluster: "rds-orders-primary",
          error_code: "FATAL_TOO_MANY_CONNECTIONS",
        },
      },
      {
        source: "datadog",
        external_id: "dd-rep-206",
        offsetMinutesAgo: 14,
        title: "Long-Running Unindexed Aggregation Query on reporting-worker",
        description:
          "PID 48192 on rds-orders-primary holding ExclusiveLock for 410s during hourly ledger export",
        severity: "warning",
        service: "reporting-worker",
        environment: "production",
        host: "reporting-worker-prod-01",
        entity_tags: {
          db_cluster: "rds-orders-primary",
          error_code: "FATAL_TOO_MANY_CONNECTIONS",
        },
      },
      {
        source: "aws_cloudwatch",
        external_id: "cw-rds-207",
        offsetMinutesAgo: 13,
        title: "CloudWatch Alarm: rds-orders-primary-CPUUtilization > 94%",
        description:
          "Sustained CPU and connection lock saturation on rds-orders-primary",
        severity: "high",
        service: "orders-service",
        environment: "production",
        host: "rds-orders-primary",
        entity_tags: {
          db_cluster: "rds-orders-primary",
          error_code: "FATAL_TOO_MANY_CONNECTIONS",
        },
      },
      {
        source: "datadog",
        external_id: "dd-ord-208",
        offsetMinutesAgo: 12,
        title: "Deadlock & Connection Pool Queue Full on orders-service",
        description:
          "128 waiting clients in pgbouncer queue for rds-orders-primary",
        severity: "high",
        service: "orders-service",
        environment: "production",
        host: "orders-service-prod-03",
        entity_tags: {
          db_cluster: "rds-orders-primary",
          error_code: "FATAL_TOO_MANY_CONNECTIONS",
        },
      },
    ],
  },

  credential_stuffing: {
    id: "credential_stuffing",
    name: "Credential Stuffing & IAM Anomaly",
    subtitle:
      "6 security & ops alerts across GuardDuty, Datadog & PagerDuty tracing to threat actor IP 185.220.101.42",
    alertCount: 6,
    badge: "6 Alerts → 1 Incident",
    alerts: [
      {
        source: "aws_guardduty",
        external_id: "gd-sec-301",
        offsetMinutesAgo: 24,
        title: "GuardDuty: UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration",
        description:
          "Anomalous STS AssumeRole & ListSecrets API calls from external IP 185.220.101.42 using principal svc-checkout-deployer",
        severity: "critical",
        service: "auth-service",
        environment: "production",
        host: "iam-us-east-1",
        entity_tags: {
          attacker_ip: "185.220.101.42",
          iam_principal: "svc-checkout-deployer",
          error_code: "AUTH_BRUTE_FORCE",
        },
      },
      {
        source: "datadog",
        external_id: "dd-sec-302",
        offsetMinutesAgo: 23,
        title: "[Security] High Velocity Failed Login Surge (4,200/min) on auth-service",
        description:
          "Credential stuffing signature AUTH_BRUTE_FORCE detected from source IP 185.220.101.42 against /v1/oauth/token",
        severity: "high",
        service: "auth-service",
        environment: "production",
        host: "auth-service-prod-01",
        entity_tags: {
          attacker_ip: "185.220.101.42",
          iam_principal: "svc-checkout-deployer",
          error_code: "AUTH_BRUTE_FORCE",
        },
      },
      {
        source: "aws_cloudwatch",
        external_id: "cw-waf-303",
        offsetMinutesAgo: 22,
        title: "CloudWatch Alarm: prod-waf-RateLimitRule-Triggered",
        description:
          "AWS WAF rate-based rule triggered for IP 185.220.101.42 on edge-gateway /v1/oauth/*",
        severity: "warning",
        service: "edge-gateway",
        environment: "production",
        host: "waf-global-edge",
        entity_tags: {
          attacker_ip: "185.220.101.42",
          error_code: "AUTH_BRUTE_FORCE",
        },
      },
      {
        source: "pagerduty",
        external_id: "pd-sec-304",
        offsetMinutesAgo: 21,
        title: "Auth Redis Rate-Limiter CPU Saturation on auth-service",
        description:
          "Auth rate-limiter hot-key contention caused by brute-force flood from 185.220.101.42",
        severity: "high",
        service: "auth-service",
        environment: "production",
        host: "auth-service-prod-02",
        entity_tags: {
          attacker_ip: "185.220.101.42",
          error_code: "AUTH_BRUTE_FORCE",
        },
      },
      {
        source: "aws_guardduty",
        external_id: "gd-sec-305",
        offsetMinutesAgo: 20,
        title: "GuardDuty: Discovery:IAMUser/AnomalousBehavior",
        description:
          "Principal svc-checkout-deployer invoked GetSecretValue from 185.220.101.42 outside baseline ASN",
        severity: "critical",
        service: "auth-service",
        environment: "production",
        host: "iam-us-east-1",
        entity_tags: {
          attacker_ip: "185.220.101.42",
          iam_principal: "svc-checkout-deployer",
          error_code: "AUTH_BRUTE_FORCE",
        },
      },
      {
        source: "datadog",
        external_id: "dd-sec-306",
        offsetMinutesAgo: 19,
        title: "[Cloud SIEM] Suspicious OAuth Refresh Token Enumeration",
        description:
          "Correlated attack traffic from 185.220.101.42 hitting auth-service and user-profile endpoints",
        severity: "high",
        service: "user-profile",
        environment: "production",
        host: "user-profile-prod-01",
        entity_tags: {
          attacker_ip: "185.220.101.42",
          iam_principal: "svc-checkout-deployer",
          error_code: "AUTH_BRUTE_FORCE",
        },
      },
    ],
  },

  flapping_partner_sftp: {
    id: "flapping_partner_sftp",
    name: "Noisy Legacy Partner SFTP Cron Flapping",
    subtitle:
      "9 repetitive CRITICAL alerts in staging on a single batch service — low blast radius, ideal for 1-click 24h suppression",
    alertCount: 9,
    badge: "9 Noisy Alerts → Low Priority",
    alerts: Array.from({ length: 9 }).map((_, idx) => ({
      source: idx % 2 === 0 ? "pagerduty" : "datadog",
      external_id: `noisy-sftp-40${idx + 1}`,
      offsetMinutesAgo: 12 - idx,
      title: `CRITICAL: Partner SFTP Sync Connection Timeout (Attempt #${idx + 1})`,
      description:
        "Cron job legacy-sftp-sync failed to connect to sftp.acme-logistics-partner.ext:22 (ETIMEDOUT_PARTNER_FTP) in staging environment",
      severity: "critical",
      service: "legacy-sftp-sync",
      environment: "staging",
      host: "batch-cron-staging-01",
      entity_tags: {
        root_entity: "sftp.acme-logistics-partner.ext",
        error_code: "ETIMEDOUT_PARTNER_FTP",
      },
    })),
  },
};

export const SAMPLE_WEBHOOK_PAYLOADS: Record<
  "pagerduty" | "datadog" | "aws_cloudwatch",
  { label: string; description: string; payload: Record<string, unknown> }
> = {
  pagerduty: {
    label: "PagerDuty V3 Webhook",
    description:
      "Simulates a new PagerDuty incident triggered on checkout-api due to the expired *.prod.internal.acme.io TLS certificate (automatically merges into the active TLS Certificate cluster).",
    payload: {
      event: {
        id: "evt-pd-live-991",
        event_type: "incident.triggered",
        occurred_at: new Date().toISOString(),
        data: {
          id: "P991X8A",
          title: "Payment Tokenization TLS Handshake Error on checkout-api",
          urgency: "high",
          priority: { summary: "P1" },
          service: { summary: "checkout-api" },
          custom_details: {
            env: "production",
            host: "checkout-api-prod-04",
            cert_cn: "*.prod.internal.acme.io",
            error_code: "CERT_HAS_EXPIRED",
            message:
              "Upstream mTLS handshake to edge-gateway failed: certificate CN=*.prod.internal.acme.io has expired",
          },
        },
      },
    },
  },
  datadog: {
    label: "Datadog Monitor Webhook",
    description:
      "Simulates a Datadog APM monitor alert on orders-service caused by rds-orders-primary connection pool saturation.",
    payload: {
      id: "dd-evt-884120",
      alert_metric: "postgresql.connections.used",
      title: "[Datadog] orders-service DB Pool Acquisition Timeout > 5s",
      body: "Service orders-service failed to acquire connection from rds-orders-primary: FATAL_TOO_MANY_CONNECTIONS",
      priority: "P1",
      host: "orders-service-prod-02",
      tags: [
        "service:orders-service",
        "env:production",
        "db_cluster:rds-orders-primary",
        "error_code:FATAL_TOO_MANY_CONNECTIONS",
      ],
    },
  },
  aws_cloudwatch: {
    label: "AWS CloudWatch Alarm SNS",
    description:
      "Simulates an AWS CloudWatch Alarm payload for edge-gateway TLS negotiation errors.",
    payload: {
      AlarmName: "prod-edge-gateway-TLSNegotiationErrorSpike",
      NewStateValue: "ALARM",
      NewStateReason:
        "Threshold Crossed: 1 datapoint [382.0] was greater than the threshold (50.0) for certificate *.prod.internal.acme.io (CERT_HAS_EXPIRED).",
      Region: "us-east-1",
      StateChangeTime: new Date().toISOString(),
      Trigger: {
        MetricName: "ClientTLSNegotiationErrorCount",
        Namespace: "AWS/ApplicationELB",
        Dimensions: [
          { name: "ServiceName", value: "edge-gateway" },
          { name: "Environment", value: "production" },
        ],
      },
    },
  },
};

export const WEEKLY_VALIDATION_DATASET: ValidationAlertItem[] = [
  // Incident Group 1: Monday Expired Internal Cert (6 alerts)
  {
    id: "wk-01",
    timestamp: "2026-10-12T09:10:00Z",
    source: "datadog",
    service: "edge-gateway",
    environment: "production",
    severity: "critical",
    title: "TLS Certificate Expired on edge-gateway",
    description: "x509 certificate CN=*.prod.internal.acme.io expired (CERT_HAS_EXPIRED)",
    entity_tags: { cert_cn: "*.prod.internal.acme.io", error_code: "CERT_HAS_EXPIRED" },
    human_cluster_label: "INC-101: Expired Internal TLS Cert",
  },
  {
    id: "wk-02",
    timestamp: "2026-10-12T09:11:15Z",
    source: "pagerduty",
    service: "checkout-api",
    environment: "production",
    severity: "critical",
    title: "502 Bad Gateway calling edge-gateway",
    description: "SSL verify failed for CN=*.prod.internal.acme.io (CERT_HAS_EXPIRED)",
    entity_tags: { cert_cn: "*.prod.internal.acme.io", error_code: "CERT_HAS_EXPIRED" },
    human_cluster_label: "INC-101: Expired Internal TLS Cert",
  },
  {
    id: "wk-03",
    timestamp: "2026-10-12T09:12:30Z",
    source: "aws_cloudwatch",
    service: "edge-gateway",
    environment: "production",
    severity: "high",
    title: "ALB TargetTLSNegotiationErrorCount High",
    description: "TLS negotiation error on *.prod.internal.acme.io",
    entity_tags: { cert_cn: "*.prod.internal.acme.io", error_code: "CERT_HAS_EXPIRED" },
    human_cluster_label: "INC-101: Expired Internal TLS Cert",
  },
  {
    id: "wk-04",
    timestamp: "2026-10-12T09:14:00Z",
    source: "datadog",
    service: "auth-proxy",
    environment: "production",
    severity: "high",
    title: "JWKS Upstream Fetch TLS Handshake Error",
    description: "Certificate verify failed for *.prod.internal.acme.io (CERT_HAS_EXPIRED)",
    entity_tags: { cert_cn: "*.prod.internal.acme.io", error_code: "CERT_HAS_EXPIRED" },
    human_cluster_label: "INC-101: Expired Internal TLS Cert",
  },
  {
    id: "wk-05",
    timestamp: "2026-10-12T09:15:20Z",
    source: "pagerduty",
    service: "billing-worker",
    environment: "production",
    severity: "warning",
    title: "Billing RPC Client TLS Handshake Failure",
    description: "Failed mTLS handshake to *.prod.internal.acme.io",
    entity_tags: { cert_cn: "*.prod.internal.acme.io", error_code: "CERT_HAS_EXPIRED" },
    human_cluster_label: "INC-101: Expired Internal TLS Cert",
  },
  {
    id: "wk-06",
    timestamp: "2026-10-12T09:17:00Z",
    source: "datadog",
    service: "checkout-api",
    environment: "production",
    severity: "critical",
    title: "Checkout Error Budget Burn > 10x",
    description: "Cascading 502s due to expired cert *.prod.internal.acme.io",
    entity_tags: { cert_cn: "*.prod.internal.acme.io", error_code: "CERT_HAS_EXPIRED" },
    human_cluster_label: "INC-101: Expired Internal TLS Cert",
  },

  // Incident Group 2: Tuesday RDS Pool Exhaustion (5 alerts)
  {
    id: "wk-07",
    timestamp: "2026-10-13T14:02:00Z",
    source: "aws_cloudwatch",
    service: "orders-service",
    environment: "production",
    severity: "high",
    title: "RDS Max Connections Reached on rds-orders-primary",
    description: "DatabaseConnections at 100% on rds-orders-primary (FATAL_TOO_MANY_CONNECTIONS)",
    entity_tags: { db_cluster: "rds-orders-primary", error_code: "FATAL_TOO_MANY_CONNECTIONS" },
    human_cluster_label: "INC-102: Orders DB Pool Exhausted",
  },
  {
    id: "wk-08",
    timestamp: "2026-10-13T14:03:10Z",
    source: "pagerduty",
    service: "orders-service",
    environment: "production",
    severity: "critical",
    title: "orders-service HTTP 500 Spike",
    description: "FATAL_TOO_MANY_CONNECTIONS on rds-orders-primary pool",
    entity_tags: { db_cluster: "rds-orders-primary", error_code: "FATAL_TOO_MANY_CONNECTIONS" },
    human_cluster_label: "INC-102: Orders DB Pool Exhausted",
  },
  {
    id: "wk-09",
    timestamp: "2026-10-13T14:04:45Z",
    source: "datadog",
    service: "inventory-api",
    environment: "production",
    severity: "high",
    title: "Inventory DB Pool Wait Timeout > 5000ms",
    description: "Connection starvation on shared database rds-orders-primary",
    entity_tags: { db_cluster: "rds-orders-primary", error_code: "FATAL_TOO_MANY_CONNECTIONS" },
    human_cluster_label: "INC-102: Orders DB Pool Exhausted",
  },
  {
    id: "wk-10",
    timestamp: "2026-10-13T14:06:00Z",
    source: "datadog",
    service: "reporting-worker",
    environment: "production",
    severity: "warning",
    title: "Blocking ExclusiveLock Query on rds-orders-primary",
    description: "Batch export holding locks on rds-orders-primary",
    entity_tags: { db_cluster: "rds-orders-primary", error_code: "FATAL_TOO_MANY_CONNECTIONS" },
    human_cluster_label: "INC-102: Orders DB Pool Exhausted",
  },
  {
    id: "wk-11",
    timestamp: "2026-10-13T14:08:30Z",
    source: "pagerduty",
    service: "inventory-api",
    environment: "production",
    severity: "high",
    title: "Stock Sync gRPC Failure Spike",
    description: "Timeout waiting for rds-orders-primary connection pool",
    entity_tags: { db_cluster: "rds-orders-primary", error_code: "FATAL_TOO_MANY_CONNECTIONS" },
    human_cluster_label: "INC-102: Orders DB Pool Exhausted",
  },

  // Incident Group 3: Wednesday Threat Actor Brute Force (5 alerts)
  {
    id: "wk-12",
    timestamp: "2026-10-14T21:30:00Z",
    source: "aws_guardduty",
    service: "auth-service",
    environment: "production",
    severity: "critical",
    title: "GuardDuty Credential Exfiltration Attempt",
    description: "Suspicious API calls from 185.220.101.42 using svc-checkout-deployer",
    entity_tags: { attacker_ip: "185.220.101.42", error_code: "AUTH_BRUTE_FORCE" },
    human_cluster_label: "INC-103: Threat Actor 185.220.101.42",
  },
  {
    id: "wk-13",
    timestamp: "2026-10-14T21:31:00Z",
    source: "datadog",
    service: "auth-service",
    environment: "production",
    severity: "high",
    title: "OAuth Failed Login Surge from 185.220.101.42",
    description: "4,000 failed logins/min from IP 185.220.101.42 (AUTH_BRUTE_FORCE)",
    entity_tags: { attacker_ip: "185.220.101.42", error_code: "AUTH_BRUTE_FORCE" },
    human_cluster_label: "INC-103: Threat Actor 185.220.101.42",
  },
  {
    id: "wk-14",
    timestamp: "2026-10-14T21:32:30Z",
    source: "aws_cloudwatch",
    service: "edge-gateway",
    environment: "production",
    severity: "warning",
    title: "WAF Rate Limit Rule Triggered on /v1/oauth",
    description: "Rate limit exceeded by client IP 185.220.101.42",
    entity_tags: { attacker_ip: "185.220.101.42", error_code: "AUTH_BRUTE_FORCE" },
    human_cluster_label: "INC-103: Threat Actor 185.220.101.42",
  },
  {
    id: "wk-15",
    timestamp: "2026-10-14T21:34:00Z",
    source: "pagerduty",
    service: "auth-service",
    environment: "production",
    severity: "high",
    title: "Auth Redis Rate Limiter CPU > 90%",
    description: "Hot key flood from attacker IP 185.220.101.42",
    entity_tags: { attacker_ip: "185.220.101.42", error_code: "AUTH_BRUTE_FORCE" },
    human_cluster_label: "INC-103: Threat Actor 185.220.101.42",
  },
  {
    id: "wk-16",
    timestamp: "2026-10-14T21:36:10Z",
    source: "datadog",
    service: "user-profile",
    environment: "production",
    severity: "high",
    title: "Account Enumeration Anomaly on user-profile",
    description: "Sequential profile scraping from 185.220.101.42",
    entity_tags: { attacker_ip: "185.220.101.42", error_code: "AUTH_BRUTE_FORCE" },
    human_cluster_label: "INC-103: Threat Actor 185.220.101.42",
  },

  // Incident Group 4: Thursday Staging SFTP Flapping (5 alerts)
  {
    id: "wk-17",
    timestamp: "2026-10-15T03:00:00Z",
    source: "pagerduty",
    service: "legacy-sftp-sync",
    environment: "staging",
    severity: "critical",
    title: "Partner SFTP Connection Timeout #1",
    description: "ETIMEDOUT_PARTNER_FTP connecting to sftp.acme-logistics-partner.ext",
    entity_tags: { root_entity: "sftp.acme-logistics-partner.ext", error_code: "ETIMEDOUT_PARTNER_FTP" },
    human_cluster_label: "INC-104: Staging SFTP Partner Timeout",
  },
  {
    id: "wk-18",
    timestamp: "2026-10-15T03:05:00Z",
    source: "datadog",
    service: "legacy-sftp-sync",
    environment: "staging",
    severity: "critical",
    title: "Partner SFTP Connection Timeout #2",
    description: "ETIMEDOUT_PARTNER_FTP connecting to sftp.acme-logistics-partner.ext",
    entity_tags: { root_entity: "sftp.acme-logistics-partner.ext", error_code: "ETIMEDOUT_PARTNER_FTP" },
    human_cluster_label: "INC-104: Staging SFTP Partner Timeout",
  },
  {
    id: "wk-19",
    timestamp: "2026-10-15T03:10:00Z",
    source: "pagerduty",
    service: "legacy-sftp-sync",
    environment: "staging",
    severity: "critical",
    title: "Partner SFTP Connection Timeout #3",
    description: "ETIMEDOUT_PARTNER_FTP connecting to sftp.acme-logistics-partner.ext",
    entity_tags: { root_entity: "sftp.acme-logistics-partner.ext", error_code: "ETIMEDOUT_PARTNER_FTP" },
    human_cluster_label: "INC-104: Staging SFTP Partner Timeout",
  },
  {
    id: "wk-20",
    timestamp: "2026-10-15T03:15:00Z",
    source: "datadog",
    service: "legacy-sftp-sync",
    environment: "staging",
    severity: "critical",
    title: "Partner SFTP Connection Timeout #4",
    description: "ETIMEDOUT_PARTNER_FTP connecting to sftp.acme-logistics-partner.ext",
    entity_tags: { root_entity: "sftp.acme-logistics-partner.ext", error_code: "ETIMEDOUT_PARTNER_FTP" },
    human_cluster_label: "INC-104: Staging SFTP Partner Timeout",
  },
  {
    id: "wk-21",
    timestamp: "2026-10-15T03:20:00Z",
    source: "pagerduty",
    service: "legacy-sftp-sync",
    environment: "staging",
    severity: "critical",
    title: "Partner SFTP Connection Timeout #5",
    description: "ETIMEDOUT_PARTNER_FTP connecting to sftp.acme-logistics-partner.ext",
    entity_tags: { root_entity: "sftp.acme-logistics-partner.ext", error_code: "ETIMEDOUT_PARTNER_FTP" },
    human_cluster_label: "INC-104: Staging SFTP Partner Timeout",
  },

  // Incident Group 5: Friday Redis OOM on Payments (4 alerts)
  {
    id: "wk-22",
    timestamp: "2026-10-16T16:40:00Z",
    source: "aws_cloudwatch",
    service: "payments-service",
    environment: "production",
    severity: "critical",
    title: "ElastiCache redis-payments-prod Memory > 98% (OOM_KILLED)",
    description: "Redis cluster redis-payments-prod evicted keys and rejected writes with OOM_KILLED",
    entity_tags: { db_cluster: "redis-payments-prod", error_code: "OOM_KILLED" },
    human_cluster_label: "INC-105: Payments Redis OOM",
  },
  {
    id: "wk-23",
    timestamp: "2026-10-16T16:41:20Z",
    source: "pagerduty",
    service: "payments-service",
    environment: "production",
    severity: "critical",
    title: "Idempotency Key Cache Write Failure on payments-service",
    description: "OOM command not allowed when used memory > maxmemory on redis-payments-prod",
    entity_tags: { db_cluster: "redis-payments-prod", error_code: "OOM_KILLED" },
    human_cluster_label: "INC-105: Payments Redis OOM",
  },
  {
    id: "wk-24",
    timestamp: "2026-10-16T16:42:50Z",
    source: "datadog",
    service: "checkout-api",
    environment: "production",
    severity: "high",
    title: "Payment Intent Creation 503 Errors on checkout-api",
    description: "Upstream payments-service failing due to redis-payments-prod OOM_KILLED",
    entity_tags: { db_cluster: "redis-payments-prod", error_code: "OOM_KILLED" },
    human_cluster_label: "INC-105: Payments Redis OOM",
  },
  {
    id: "wk-25",
    timestamp: "2026-10-16T16:44:10Z",
    source: "datadog",
    service: "payments-service",
    environment: "production",
    severity: "high",
    title: "Redis Connection Reset & Eviction Spike",
    description: "Critical memory pressure on redis-payments-prod (OOM_KILLED)",
    entity_tags: { db_cluster: "redis-payments-prod", error_code: "OOM_KILLED" },
    human_cluster_label: "INC-105: Payments Redis OOM",
  },
];
