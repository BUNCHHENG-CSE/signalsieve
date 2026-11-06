"use client";

import React, { useMemo, useState } from "react";
import { RawAlert, Severity } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Clock,
  Server,
  AlertOctagon,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Sparkles,
  Zap,
} from "lucide-react";

interface ClusterTimelineViewProps {
  alerts: RawAlert[];
}

const SOURCE_BADGES: Record<
  string,
  { label: string; dot: string; border: string; bg: string }
> = {
  pagerduty: {
    label: "PagerDuty",
    dot: "bg-emerald-400",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10 text-emerald-300",
  },
  datadog: {
    label: "Datadog",
    dot: "bg-purple-400",
    border: "border-purple-500/30",
    bg: "bg-purple-500/10 text-purple-300",
  },
  aws_cloudwatch: {
    label: "CloudWatch",
    dot: "bg-amber-400",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10 text-amber-300",
  },
  aws_guardduty: {
    label: "GuardDuty",
    dot: "bg-rose-400",
    border: "border-rose-500/30",
    bg: "bg-rose-500/10 text-rose-300",
  },
  generic_webhook: {
    label: "Webhook",
    dot: "bg-cyan-400",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/10 text-cyan-300",
  },
  csv_import: {
    label: "CSV Import",
    dot: "bg-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/10 text-blue-300",
  },
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-rose-500 ring-rose-500/30",
  high: "bg-amber-500 ring-amber-500/30",
  warning: "bg-yellow-500 ring-yellow-500/30",
  info: "bg-cyan-500 ring-cyan-500/30",
};

function formatOffset(diffSeconds: number): string {
  if (diffSeconds <= 0) return "+00:00 (Origin)";
  const mins = Math.floor(diffSeconds / 60);
  const secs = Math.floor(diffSeconds % 60);
  if (mins === 0) return `+00:${secs.toString().padStart(2, "0")}s`;
  return `+${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}m`;
}

export function ClusterTimelineView({ alerts }: ClusterTimelineViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Sort chronological (oldest to newest) to show cause-to-effect sequence
  const sortedAlerts = useMemo(() => {
    return [...alerts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [alerts]);

  const originTime = useMemo(() => {
    if (sortedAlerts.length === 0) return Date.now();
    return new Date(sortedAlerts[0].timestamp).getTime();
  }, [sortedAlerts]);

  const totalDurationSeconds = useMemo(() => {
    if (sortedAlerts.length < 2) return 0;
    const lastTime = new Date(
      sortedAlerts[sortedAlerts.length - 1].timestamp
    ).getTime();
    return Math.max(0, Math.round((lastTime - originTime) / 1000));
  }, [sortedAlerts, originTime]);

  const filteredAlerts = useMemo(() => {
    return sortedAlerts.filter((alert) => {
      if (filterSeverity !== "all" && alert.severity !== filterSeverity) return false;
      if (filterSource !== "all" && alert.source !== filterSource) return false;
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesTitle = alert.title.toLowerCase().includes(query);
        const matchesService = alert.service.toLowerCase().includes(query);
        const matchesHost = alert.host.toLowerCase().includes(query);
        if (!matchesTitle && !matchesService && !matchesHost) return false;
      }
      return true;
    });
  }, [sortedAlerts, filterSeverity, filterSource, searchTerm]);

  const handleCopyPayload = (id: string, payload: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (alerts.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground font-mono">
        No alert telemetry records found for this incident.
      </div>
    );
  }

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Waterfall Header Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-foreground flex items-center gap-2">
              <span>Chronological Incident Waterfall</span>
              <Badge variant="cyan" className="text-[9px] px-1.5 py-0 font-mono">
                {alerts.length} Events
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Incident unfolded over {formatOffset(totalDurationSeconds).replace("+", "")} across {new Set(alerts.map(a => a.service)).size} services
            </div>
          </div>
        </div>

        {/* Quick Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>

          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Sources</option>
            <option value="pagerduty">PagerDuty</option>
            <option value="datadog">Datadog</option>
            <option value="aws_cloudwatch">CloudWatch</option>
            <option value="aws_guardduty">GuardDuty</option>
          </select>
        </div>
      </div>

      {/* Timeline Stream */}
      <div className="relative pl-6 space-y-4">
        {/* Continuous vertical timeline connector line */}
        <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-border -translate-x-1/2" />

        {filteredAlerts.map((alert, index) => {
          const alertTime = new Date(alert.timestamp).getTime();
          const offsetSeconds = Math.max(0, (alertTime - originTime) / 1000);
          const isOrigin = index === 0;
          const isExpanded = expandedId === alert.id;
          const sourceBadge = SOURCE_BADGES[alert.source] || SOURCE_BADGES.generic_webhook;

          return (
            <div key={alert.id} className="relative group">
              {/* Timeline Node Dot */}
              <div
                className={`absolute -left-6 top-3 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-background ring-2 transition-transform ${
                  SEVERITY_DOT[alert.severity] || "bg-primary"
                } ${isOrigin ? "scale-125 ring-rose-500 animate-pulse" : ""}`}
              />

              {/* Event Card */}
              <div
                className={`rounded-md border transition-all ${
                  isOrigin
                    ? "border-rose-500/40 bg-rose-500/5 shadow-sm"
                    : "border-border/60 bg-card/60 hover:border-border"
                } p-3`}
              >
                {/* Event Top Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                        isOrigin
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {formatOffset(offsetSeconds)}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10px] font-semibold border ${sourceBadge.bg} ${sourceBadge.border}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${sourceBadge.dot}`} />
                      {sourceBadge.label}
                    </span>

                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Server className="h-2.5 w-2.5" />
                      <span className="font-semibold text-foreground">
                        {alert.service}
                      </span>
                      {alert.host && (
                        <span className="text-muted-foreground">({alert.host})</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                        alert.severity === "critical"
                          ? "bg-rose-500/20 text-rose-400"
                          : alert.severity === "high"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {alert.severity}
                    </span>

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Event Title */}
                <div className="text-xs font-semibold text-foreground">
                  {alert.title}
                </div>

                {/* Description Snippet */}
                {alert.description && (
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {alert.description}
                  </p>
                )}

                {/* Entity Tags */}
                {alert.entity_tags && Object.keys(alert.entity_tags).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(alert.entity_tags).map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded bg-secondary/80 border border-border/40 px-1.5 py-0.5 text-[9px] text-secondary-foreground"
                      >
                        <span className="text-muted-foreground">{k}:</span>
                        <span className="font-semibold text-cyan-300">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Collapsible Detail Section */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Exact Timestamp: {new Date(alert.timestamp).toLocaleString()}</span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleCopyPayload(alert.id, alert.raw_payload)}
                        className="h-5 text-[10px] gap-1"
                      >
                        {copiedId === alert.id ? (
                          <>
                            <Check className="h-2.5 w-2.5 text-emerald-400" />
                            <span>Copied JSON</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5" />
                            <span>Copy Payload</span>
                          </>
                        )}
                      </Button>
                    </div>

                    <pre className="max-h-48 overflow-auto rounded bg-secondary/60 p-2 text-[10px] text-secondary-foreground font-mono leading-tight">
                      {JSON.stringify(alert.raw_payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
