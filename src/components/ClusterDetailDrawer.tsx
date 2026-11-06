"use client";

import React, { useState } from "react";
import { AlertCluster, RawAlert } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClusterTimelineView } from "@/components/ClusterTimelineView";
import { ExportIncidentModal } from "@/components/ExportIncidentModal";
import {
  X,
  Sparkles,
  ShieldOff,
  CheckCircle2,
  GitBranch,
  Activity,
  Clock,
  Layers,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Server,
  AlertOctagon,
  Flame,
  Copy,
  Check,
  FileText,
  Send,
} from "lucide-react";

interface ClusterDetailDrawerProps {
  cluster: AlertCluster | null;
  onClose: () => void;
  onSuppressClick: (cluster: AlertCluster) => void;
  onStatusChange: (
    clusterId: string,
    status: "open" | "acknowledged" | "resolved"
  ) => Promise<void>;
  onRegenerateSummary: (clusterId: string) => Promise<void>;
  onNotify?: (message: string, type?: "success" | "error" | "info") => void;
}

const SOURCE_BADGES: Record<
  string,
  { variant: "emerald" | "purple" | "amber" | "rose" | "cyan" | "secondary"; dot: string }
> = {
  pagerduty: { variant: "emerald", dot: "bg-emerald-400" },
  datadog: { variant: "purple", dot: "bg-purple-400" },
  aws_cloudwatch: { variant: "amber", dot: "bg-amber-400" },
  aws_guardduty: { variant: "rose", dot: "bg-rose-400" },
  generic_webhook: { variant: "cyan", dot: "bg-cyan-400" },
  csv_import: { variant: "secondary", dot: "bg-blue-400" },
};

const SOURCE_NAMES: Record<string, string> = {
  pagerduty: "PagerDuty",
  datadog: "Datadog",
  aws_cloudwatch: "AWS CloudWatch",
  aws_guardduty: "AWS GuardDuty",
  generic_webhook: "Webhook",
  csv_import: "CSV Import",
};

export function ClusterDetailDrawer({
  cluster,
  onClose,
  onSuppressClick,
  onStatusChange,
  onRegenerateSummary,
  onNotify,
}: ClusterDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"topology" | "waterfall" | "alerts">("topology");
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copiedAlertId, setCopiedAlertId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  if (!cluster) return null;

  const rb = cluster.ranking_breakdown;
  const graph = cluster.dependency_graph;
  const rootNode = graph.nodes.find(
    (n) => n.type === "root_cause" || n.type === "external_actor"
  );
  const serviceNodes = graph.nodes.filter(
    (n) => n.type === "primary_service" || n.type === "downstream_service"
  );

  const handleRegen = async () => {
    setRegenerating(true);
    try {
      await onRegenerateSummary(cluster.id);
      onNotify?.("Incident context summary synthesized with LLM!", "success");
    } finally {
      setRegenerating(false);
    }
  };

  const copyPayload = (id: string, payload: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedAlertId(id);
    onNotify?.("Raw payload copied to clipboard", "info");
    setTimeout(() => setCopiedAlertId(null), 1800);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="relative flex h-full w-full max-w-3xl flex-col border-l border-border bg-card text-card-foreground shadow-2xl font-mono overflow-hidden">
          {/* Top Header */}
          <div className="flex items-start justify-between border-b border-border bg-background/90 px-5 py-3.5 backdrop-blur-md">
            <div className="space-y-1.5 pr-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="rose" className="gap-1 py-0.5">
                  <Flame className="h-3 w-3 text-rose-400" />
                  Urgency {cluster.urgency_score}/100
                </Badge>

                <Badge variant="cyan" className="gap-1 py-0.5">
                  <Activity className="h-3 w-3 text-cyan-400" />
                  Blast {cluster.blast_radius_score}/100
                </Badge>

                <Badge variant={cluster.environment === "production" ? "emerald" : "outline"}>
                  {cluster.environment}
                </Badge>

                <Badge variant="outline">
                  {cluster.alert_count} Alerts → 1 Incident
                </Badge>
              </div>

              <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight leading-snug">
                {cluster.title}
              </h2>
            </div>

            <button
              onClick={onClose}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-background/60 px-5 py-2.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground mr-1 uppercase font-semibold">
                Status:
              </span>
              <Button
                variant={cluster.status === "open" ? "destructive" : "ghost"}
                size="xs"
                onClick={() => {
                  onStatusChange(cluster.id, "open");
                  onNotify?.("Incident status marked Open", "info");
                }}
              >
                Open
              </Button>
              <Button
                variant={cluster.status === "acknowledged" ? "cyber" : "ghost"}
                size="xs"
                onClick={() => {
                  onStatusChange(cluster.id, "acknowledged");
                  onNotify?.("Incident status Acknowledged", "info");
                }}
              >
                Ack
              </Button>
              <Button
                variant={cluster.status === "resolved" ? "emerald" : "ghost"}
                size="xs"
                onClick={() => {
                  onStatusChange(cluster.id, "resolved");
                  onNotify?.("Incident status Resolved!", "success");
                }}
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Resolved</span>
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setShowExportModal(true)}
                className="gap-1 font-mono text-[11px]"
              >
                <FileText className="h-3 w-3 text-cyan-400" />
                <span>Export &amp; Post-Mortem</span>
              </Button>

              <Button
                variant="outline"
                size="xs"
                onClick={handleRegen}
                disabled={regenerating}
                className="gap-1 font-mono text-[11px]"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                <span>{regenerating ? "Synthesizing..." : "Re-Synthesize"}</span>
              </Button>

              <Button
                variant="amber"
                size="xs"
                onClick={() => onSuppressClick(cluster)}
                className="gap-1 font-mono font-bold text-[11px]"
              >
                <ShieldOff className="h-3 w-3" />
                <span>Suppress 24h</span>
              </Button>
            </div>
          </div>

          {/* View Tab Switcher */}
          <div className="flex items-center border-b border-border bg-secondary/30 px-5 pt-1.5">
            <button
              onClick={() => setActiveTab("topology")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "topology"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>Blast Radius &amp; Math</span>
            </button>

            <button
              onClick={() => setActiveTab("waterfall")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "waterfall"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Incident Waterfall Timeline</span>
              <Badge variant="cyan" className="text-[9px] py-0 px-1 font-mono">
                {cluster.alert_count}
              </Badge>
            </button>

            <button
              onClick={() => setActiveTab("alerts")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "alerts"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Raw Alert Telemetry</span>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Shared Context Intelligence (Always visible at top) */}
            <Card className="border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Shared Context Intelligence</span>
                </div>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                  Engine: {cluster.summary_source}
                </span>
              </div>

              <p className="text-xs text-foreground leading-relaxed">
                {cluster.context_summary}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                <div className="rounded border border-rose-500/20 bg-rose-500/5 p-2.5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                    Root Cause Diagnosis
                  </div>
                  <p className="text-[11px] text-foreground leading-relaxed">
                    {cluster.root_cause_hypothesis}
                  </p>
                </div>

                <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Recommended Action
                  </div>
                  <p className="text-[11px] text-foreground leading-relaxed">
                    {cluster.recommended_action}
                  </p>
                </div>
              </div>
            </Card>

            {/* TAB 1: TOPOLOGY & MATH */}
            {activeTab === "topology" && (
              <div className="space-y-5">
                {/* Topological Graph */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5 text-primary" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Blast Radius &amp; Topological Graph
                      </h3>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {cluster.services.length} Service{cluster.services.length > 1 ? "s" : ""} Impacted
                    </span>
                  </div>

                  <div className="rounded border border-border bg-background p-3.5 space-y-3">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                      {rootNode && (
                        <div className="w-full md:w-52 shrink-0 rounded border border-rose-500/40 bg-rose-500/10 p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                            <AlertOctagon className="h-3 w-3" />
                            <span>Root Origin</span>
                          </div>
                          <div className="font-mono text-xs font-bold text-foreground break-all">
                            {rootNode.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {rootNode.sublabel}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <span className="text-[9px] uppercase font-bold text-primary mb-0.5">
                          {graph.edges[0]?.relation || "Cascades To"}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      </div>

                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                        {serviceNodes.map((node) => (
                          <div
                            key={node.id}
                            className={`rounded border p-2.5 ${
                              node.type === "primary_service"
                                ? "border-amber-500/40 bg-amber-500/5"
                                : "border-border bg-card"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Server className="h-3 w-3 text-primary" />
                                <span className="font-mono text-xs font-bold text-foreground">
                                  {node.label}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono text-muted-foreground">
                                {node.sublabel}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground">
                                {node.type === "primary_service" ? "Tier-1 Origin" : "Downstream"}
                              </span>
                              <span className="uppercase font-bold text-amber-300">
                                {node.severity}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Score Math Breakdown */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-emerald-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Blast Radius &amp; Urgency Math
                      </h3>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Velocity: {rb.alertsPerMinute || 1.2} alerts/min
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded border border-border bg-background p-3 space-y-2">
                      <div className="flex justify-between font-bold">
                        <span className="text-muted-foreground uppercase text-[10px]">Blast Radius Factors</span>
                        <span className="text-foreground">{rb.blastRadiusTotal}/100</span>
                      </div>
                      <div className="space-y-1.5 text-[11px] text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Services Spread ({cluster.services.length}):</span>
                          <span className="font-mono text-foreground">+{rb.affectedServicesScore} / 35</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cross-Source Corroboration ({cluster.sources.length}):</span>
                          <span className="font-mono text-foreground">+{rb.crossSourceScore} / 15</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Environment ({cluster.environment}):</span>
                          <span className="font-mono text-foreground">+{rb.environmentWeight} / 25</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Service Tier Criticality:</span>
                          <span className="font-mono text-foreground">+{rb.tierCriticalityScore} / 25</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-border bg-background p-3 space-y-2">
                      <div className="flex justify-between font-bold">
                        <span className="text-muted-foreground uppercase text-[10px]">Composite Urgency</span>
                        <span className="text-rose-400">{rb.urgencyTotal}/100</span>
                      </div>
                      <div className="space-y-1.5 text-[11px] text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Blast Radius Component (42%):</span>
                          <span className="font-mono text-foreground">{Math.round(rb.blastRadiusTotal * 0.42)} pts</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Velocity Score (23%):</span>
                          <span className="font-mono text-foreground">{Math.round(rb.velocityScore * 0.23)} pts</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Root-Cause Isolation (20%):</span>
                          <span className="font-mono text-foreground">{Math.round(rb.rootCauseWeight * 0.20)} pts</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Raw Severity Weight (15%):</span>
                          <span className="font-mono text-foreground">{Math.round(rb.rawSeverityScore * 0.15)} pts</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* TAB 2: WATERFALL TIMELINE */}
            {activeTab === "waterfall" && (
              <ClusterTimelineView alerts={cluster.alerts || []} />
            )}

            {/* TAB 3: RAW ALERTS LIST */}
            {activeTab === "alerts" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-foreground">
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span>Correlated Telemetry Records ({cluster.alerts?.length || 0})</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Click alert to inspect raw JSON payload
                  </span>
                </div>

                <div className="space-y-2">
                  {(cluster.alerts || []).map((alert: RawAlert) => {
                    const isExpanded = expandedAlertId === alert.id;
                    const b = SOURCE_BADGES[alert.source] || SOURCE_BADGES.generic_webhook;

                    return (
                      <div
                        key={alert.id}
                        className="rounded border border-border bg-background overflow-hidden transition"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent/40 transition"
                        >
                          <div className="space-y-0.5 pr-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={b.variant} className="text-[9px] py-0 px-1.5">
                                {SOURCE_NAMES[alert.source] || alert.source}
                              </Badge>
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-bold text-foreground">
                                {alert.service}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {alert.host}
                              </span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {new Date(alert.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-xs font-medium text-foreground">
                              {alert.title}
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border bg-card p-3 space-y-2.5 text-xs">
                            <p className="text-muted-foreground text-xs leading-relaxed">
                              {alert.description}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(alert.entity_tags || {}).map(([k, v]) => (
                                <span
                                  key={k}
                                  className="rounded bg-muted px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300 font-mono"
                                >
                                  {k}: {v}
                                </span>
                              ))}
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                                <span>Fingerprint: {alert.fingerprint}</span>
                                <button
                                  type="button"
                                  onClick={() => copyPayload(alert.id, alert.raw_payload)}
                                  className="flex items-center gap-1 text-primary hover:underline"
                                >
                                  {copiedAlertId === alert.id ? (
                                    <>
                                      <Check className="h-3 w-3 text-emerald-400" />
                                      <span className="text-emerald-400">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" />
                                      <span>Copy JSON</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="max-h-40 overflow-auto rounded bg-background p-2.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300 border border-border">
                                {JSON.stringify(alert.raw_payload, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <ExportIncidentModal
          cluster={cluster}
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          onNotify={onNotify}
        />
      )}
    </>
  );
}
