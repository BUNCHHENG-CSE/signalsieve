"use client";

import React, { useMemo, useState } from "react";
import { AlertCluster, RawAlert } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingDown,
  Sparkles,
  Clock,
  DollarSign,
  Server,
  ShieldAlert,
  Flame,
  Activity,
  BarChart3,
  Layers,
  ArrowUpRight,
} from "lucide-react";

interface AnalyticsTabProps {
  clusters: AlertCluster[];
  metrics: {
    totalRawAlerts: number;
    activeClusters: number;
    suppressedAlertsCount: number;
    activeSuppressionRulesCount: number;
    noiseReductionPercent: number;
    estimatedMinutesSaved: number;
  };
}

export function AnalyticsTab({ clusters, metrics }: AnalyticsTabProps) {
  const [hourlyRate, setHourlyRate] = useState<number>(85); // $85/hr standard SRE rate

  // Extract all alerts from clusters
  const allAlerts = useMemo(() => {
    const list: RawAlert[] = [];
    clusters.forEach((c) => {
      if (c.alerts) list.push(...c.alerts);
    });
    return list;
  }, [clusters]);

  // Top Noisy Services breakdown
  const serviceStats = useMemo(() => {
    const counts: Record<string, number> = {};
    allAlerts.forEach((a) => {
      counts[a.service] = (counts[a.service] || 0) + 1;
    });
    const total = allAlerts.length || 1;
    return Object.entries(counts)
      .map(([service, count]) => ({
        service,
        count,
        percent: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [allAlerts]);

  // Top Root Cause Entities
  const entityStats = useMemo(() => {
    const counts: Record<string, number> = {};
    clusters.forEach((c) => {
      c.entities.forEach((e) => {
        counts[e] = (counts[e] || 0) + c.alert_count;
      });
    });
    return Object.entries(counts)
      .map(([entity, alertCount]) => ({ entity, alertCount }))
      .sort((a, b) => b.alertCount - a.alertCount)
      .slice(0, 6);
  }, [clusters]);

  // Ingestion Source Distribution
  const sourceStats = useMemo(() => {
    const counts: Record<string, number> = {};
    allAlerts.forEach((a) => {
      counts[a.source] = (counts[a.source] || 0) + 1;
    });
    const total = allAlerts.length || 1;
    return Object.entries(counts)
      .map(([source, count]) => ({
        source,
        count,
        percent: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [allAlerts]);

  // Urgency Tier Distribution
  const urgencyTiers = useMemo(() => {
    let extreme = 0;
    let high = 0;
    let moderate = 0;
    let low = 0;

    clusters.forEach((c) => {
      if (c.urgency_score >= 80) extreme++;
      else if (c.urgency_score >= 60) high++;
      else if (c.urgency_score >= 40) moderate++;
      else low++;
    });

    return [
      { label: "Extreme (80-100)", count: extreme, color: "bg-rose-500", text: "text-rose-400" },
      { label: "High (60-79)", count: high, color: "bg-amber-500", text: "text-amber-400" },
      { label: "Moderate (40-59)", count: moderate, color: "bg-cyan-500", text: "text-cyan-400" },
      { label: "Low (<40)", count: low, color: "bg-slate-500", text: "text-slate-400" },
    ];
  }, [clusters]);

  const hoursSaved = (metrics.estimatedMinutesSaved / 60).toFixed(1);
  const dollarsSaved = Math.round(
    (metrics.estimatedMinutesSaved / 60) * (hourlyRate || 0)
  ).toLocaleString();

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Banner / Value Calculator */}
      <Card className="border-border bg-gradient-to-r from-cyan-950/20 via-background to-purple-950/20 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-foreground">
                Engineering Operational Value & Toil Reduction
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              By grouping multi-service alert cascades into deterministic root-cause incidents and enforcing 24h pattern suppression, TCT SignalSieve frees on-call engineers from manual log collation.
            </p>
          </div>

          {/* Interactive Calculator */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card/60 p-4">
            <div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                Estimated On-Call Rate
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-muted-foreground">$</span>
                <input
                  type="number"
                  min="20"
                  max="300"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value) || 0)}
                  className="w-16 rounded border border-border bg-background px-2 py-0.5 text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">/ hr</span>
              </div>
            </div>

            <div className="h-8 w-px bg-border" />

            <div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                Total Value Recovered
              </div>
              <div className="mt-1 text-lg font-bold text-emerald-400 font-mono">
                ${dollarsSaved}
              </div>
            </div>

            <div className="h-8 w-px bg-border" />

            <div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                Toil Eliminated
              </div>
              <div className="mt-1 text-lg font-bold text-purple-400 font-mono">
                {hoursSaved} hrs
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Grid of Analytical Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Top Noisy Services */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-cyan-400" />
              <span>Top Noisy Services</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Alert Volume
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {serviceStats.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[11px]">
                No telemetry alerts recorded yet.
              </div>
            ) : (
              serviceStats.map((item) => (
                <div key={item.service} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-foreground truncate max-w-[170px]">
                      {item.service}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {item.count} alerts ({item.percent}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Top Isolated Root Cause Entities */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              <span>Root Cause Entities</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Incidents
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {entityStats.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[11px]">
                No entity tags isolated yet.
              </div>
            ) : (
              entityStats.map((item) => (
                <div
                  key={item.entity}
                  className="flex items-center justify-between rounded border border-border/50 bg-secondary/30 p-2 text-[11px]"
                >
                  <span className="font-semibold text-cyan-300 truncate max-w-[180px]">
                    {item.entity}
                  </span>
                  <Badge variant="secondary" className="text-[10px] py-0 font-mono">
                    {item.alertCount} alerts
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Ingestion Source Distribution */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-purple-400" />
              <span>Telemetry Source Mix</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Distribution
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {sourceStats.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[11px]">
                No telemetry sources available.
              </div>
            ) : (
              sourceStats.map((item) => (
                <div key={item.source} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="capitalize font-semibold text-foreground">
                      {item.source.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {item.count} ({item.percent}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Urgency Score Tier Breakdown */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
              <Flame className="h-3.5 w-3.5 text-rose-500" />
              <span>Incident Urgency Distribution (0–100 Scale)</span>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              TCT SignalSieve weighs Blast Radius (42%), Velocity (23%), Root Cause (20%), and Severity (15%).
            </p>
          </div>

          <Badge variant="cyan" className="self-start sm:self-auto font-mono text-[10px]">
            {clusters.length} Total Incidents
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {urgencyTiers.map((tier) => (
            <div
              key={tier.label}
              className="rounded-md border border-border bg-secondary/20 p-3 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {tier.label}
                </span>
                <span className={`h-2 w-2 rounded-full ${tier.color}`} />
              </div>
              <div className={`mt-2 text-2xl font-bold font-mono ${tier.text}`}>
                {tier.count}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {clusters.length > 0
                  ? `${((tier.count / clusters.length) * 100).toFixed(0)}% of queue`
                  : "0%"}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
