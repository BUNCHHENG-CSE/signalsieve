"use client";

import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap,
  Webhook,
  Play,
  RotateCcw,
  CheckCircle2,
  ShieldOff,
  Copy,
  Terminal,
  ArrowUpRight,
  Server,
  Activity,
  Flame,
  ShieldAlert,
  Check,
  Pause,
  Radio,
} from "lucide-react";

interface ScenarioMeta {
  id: string;
  name: string;
  subtitle: string;
  alertCount: number;
  badge: string;
}

interface IngestionSimulatorProps {
  scenarios: ScenarioMeta[];
  sampleWebhooks: Record<
    string,
    { label: string; description: string; payload: Record<string, unknown> }
  >;
  onRefreshDashboard: () => Promise<void>;
  onNavigateToQueue: () => void;
  onNotify?: (message: string, type?: "success" | "error" | "info") => void;
}

const SCENARIO_ICONS: Record<string, any> = {
  db_cascade: Server,
  guardduty_crypto: ShieldAlert,
  payment_cascade: Flame,
  staging_flapping: Activity,
};

export function IngestionSimulator({
  scenarios,
  sampleWebhooks,
  onRefreshDashboard,
  onNavigateToQueue,
  onNotify,
}: IngestionSimulatorProps) {
  const [selectedSource, setSelectedSource] = useState<
    "pagerduty" | "datadog" | "aws_cloudwatch"
  >("pagerduty");
  const [payloadText, setPayloadText] = useState(() =>
    JSON.stringify(sampleWebhooks?.pagerduty?.payload || {}, null, 2)
  );
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [sendingWebhook, setSendingWebhook] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Streaming State
  const [streamingScenarioId, setStreamingScenarioId] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<{
    current: number;
    total: number;
    lastTitle: string;
  } | null>(null);
  const abortStreamRef = useRef<boolean>(false);

  const handleSourceTab = (src: "pagerduty" | "datadog" | "aws_cloudwatch") => {
    setSelectedSource(src);
    setPayloadText(JSON.stringify(sampleWebhooks?.[src]?.payload || {}, null, 2));
    setLastResult(null);
  };

  const handleRunScenario = async (scenarioId: string) => {
    setRunningScenario(scenarioId);
    setLastResult(null);
    try {
      const res = await fetch("/api/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate_scenario",
          scenario: scenarioId,
        }),
      });
      const data = await res.json();
      setLastResult({
        type: "scenario",
        scenarioId,
        ...data.result,
      });
      await onRefreshDashboard();
      onNotify?.(`Simulated storm: ${data.result?.ingestedCount || 0} alerts ingested!`, "success");
    } finally {
      setRunningScenario(null);
    }
  };

  const handleStreamLiveStorm = async (scenarioId: string) => {
    setStreamingScenarioId(scenarioId);
    abortStreamRef.current = false;
    setLastResult(null);

    try {
      // 1. Fetch raw alerts for scenario
      const metaRes = await fetch("/api/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_scenario_alerts",
          scenario: scenarioId,
        }),
      });
      const metaData = await metaRes.json();
      const alerts = metaData.scenario?.alerts || [];
      const total = alerts.length;

      if (total === 0) {
        throw new Error("No alerts found for this scenario");
      }

      onNotify?.(`Starting live real-time stream of ${total} alerts...`, "info");

      // 2. Stream alerts one by one with a delay
      let ingestedSoFar = 0;
      let suppressedSoFar = 0;

      for (let i = 0; i < total; i++) {
        if (abortStreamRef.current) {
          onNotify?.("Streaming alert storm aborted by user.", "info");
          break;
        }

        const alertInput = alerts[i];
        setStreamProgress({
          current: i + 1,
          total,
          lastTitle: alertInput.title,
        });

        // Ingest single alert
        const now = new Date();
        const alertTimestamp = new Date(
          now.getTime() - (alertInput.offsetMinutesAgo || 0) * 60 * 1000
        ).toISOString();

        const ingestRes = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...alertInput,
            timestamp: alertTimestamp,
          }),
        });

        const ingestData = await ingestRes.json();
        ingestedSoFar++;
        if (ingestData.suppressedCount > 0) suppressedSoFar += ingestData.suppressedCount;

        // Refresh dashboard UI live after each alert!
        await onRefreshDashboard();

        // 900ms interval between incoming alerts to visualize the cascade
        if (i < total - 1) {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }

      setLastResult({
        type: "scenario",
        scenarioId,
        ingestedCount: ingestedSoFar,
        suppressedCount: suppressedSoFar,
      });

      onNotify?.(`Stream complete: ${ingestedSoFar} alerts ingested in real time!`, "success");
    } catch (err: any) {
      setLastResult({
        type: "error",
        message: err?.message || "Failed to stream alert storm",
      });
    } finally {
      setStreamingScenarioId(null);
      setStreamProgress(null);
    }
  };

  const handleStopStream = () => {
    abortStreamRef.current = true;
  };

  const handleResetDemo = async () => {
    setRunningScenario("reset");
    setLastResult(null);
    try {
      await fetch("/api/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_demo" }),
      });
      await onRefreshDashboard();
      setLastResult({
        type: "reset",
        message: "Database reset to clean baseline scenarios.",
      });
      onNotify?.("Demo data re-seeded to clean baseline state.", "info");
    } finally {
      setRunningScenario(null);
    }
  };

  const handleSendWebhook = async () => {
    setSendingWebhook(true);
    setLastResult(null);
    try {
      const parsed = JSON.parse(payloadText);
      const res = await fetch(`/api/ingest?source=${selectedSource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setLastResult({
        type: "webhook",
        ...data,
      });
      await onRefreshDashboard();
      onNotify?.(`Webhook processed (${data.ingestedCount || 1} alert)`, "success");
    } catch (err: any) {
      setLastResult({
        type: "error",
        message: err?.message || "Invalid JSON payload",
      });
      onNotify?.("Failed to ingest webhook: invalid JSON", "error");
    } finally {
      setSendingWebhook(false);
    }
  };

  const copyCurlCommand = () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const compact = payloadText.replace(/\s+/g, " ").trim();
    const cmd = `curl -X POST "${origin}/api/ingest?source=${selectedSource}" -H "Content-Type: application/json" -d '${compact}'`;
    navigator.clipboard.writeText(cmd);
    setCopiedCurl(true);
    onNotify?.("cURL command copied to clipboard!", "success");
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="space-y-5 font-mono">
      {/* Active Streaming Alert Storm Overlay Banner */}
      {streamingScenarioId && streamProgress && (
        <Card className="border-cyan-500 bg-cyan-950/40 p-4 animate-pulse space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan-400 animate-spin" />
              <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">
                Streaming Real-Time Alert Cascade ({streamProgress.current} / {streamProgress.total})
              </span>
            </div>
            <Button
              variant="destructive"
              size="xs"
              onClick={handleStopStream}
              className="gap-1 font-bold text-[10px]"
            >
              <Pause className="h-3 w-3" />
              <span>Abort Stream</span>
            </Button>
          </div>

          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full transition-all duration-300"
              style={{
                width: `${(streamProgress.current / streamProgress.total) * 100}%`,
              }}
            />
          </div>

          <div className="text-[11px] text-cyan-300 truncate font-mono">
            Ingesting: <span className="font-semibold">{streamProgress.lastTitle}</span>
          </div>
        </Card>
      )}

      {/* Storm Scenarios */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">
                Chaos Incident Storm Simulator
              </h2>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              Inject realistic cascading storms spanning PagerDuty, Datadog, and AWS CloudWatch/GuardDuty to observe real-time compression and root-cause grouping.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDemo}
            disabled={runningScenario !== null || streamingScenarioId !== null}
            className="gap-1.5 font-mono"
          >
            <RotateCcw className="h-3 w-3 text-primary" />
            <span>Reset Demo Data</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {scenarios.map((scen) => {
            const IconComp = SCENARIO_ICONS[scen.id] || Zap;
            const isInjecting = runningScenario === scen.id;
            const isStreaming = streamingScenarioId === scen.id;

            return (
              <div
                key={scen.id}
                className="flex flex-col justify-between rounded-lg border border-border bg-background p-4 space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconComp className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        {scen.name}
                      </span>
                    </div>
                    <Badge variant="cyan" className="text-[9px] py-0">
                      {scen.badge}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
                    {scen.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 pl-5 border-t border-border/60">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {scen.alertCount} webhooks
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleStreamLiveStorm(scen.id)}
                      disabled={runningScenario !== null || streamingScenarioId !== null}
                      className="font-mono text-[10px] gap-1 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/10"
                      title="Stream alerts one by one with a delay to watch dynamic clustering"
                    >
                      <Radio className="h-2.5 w-2.5" />
                      <span>{isStreaming ? "Streaming..." : "Stream Live"}</span>
                    </Button>

                    <Button
                      variant="cyber"
                      size="xs"
                      onClick={() => handleRunScenario(scen.id)}
                      disabled={runningScenario !== null || streamingScenarioId !== null}
                      className="font-bold gap-1 text-[11px]"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>
                        {isInjecting
                          ? "Injecting..."
                          : `Fast Ingest All`}
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Live Result Banner */}
      {lastResult && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            {lastResult.suppressedCount > 0 ? (
              <ShieldOff className="h-4 w-4 text-amber-400 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5" />
            )}
            <div className="text-xs space-y-0.5">
              {lastResult.type === "scenario" && (
                <>
                  <div className="font-bold text-foreground">
                    Storm Processed: {lastResult.ingestedCount} Raw Alerts Ingested
                  </div>
                  <div className="text-muted-foreground text-[11px]">
                    {lastResult.suppressedCount > 0
                      ? `${lastResult.suppressedCount} alerts were caught and muted by an active 24h suppression rule!`
                      : `Correlated into ${lastResult.clustersTouched?.length || 1} incident cluster(s).`}
                  </div>
                </>
              )}

              {lastResult.type === "reset" && (
                <div className="font-bold text-foreground">{lastResult.message}</div>
              )}

              {lastResult.type === "webhook" && (
                <>
                  <div className="font-bold text-foreground">
                    Webhook Ingested: {lastResult.ingestedCount} Alert(s)
                  </div>
                  <div className="text-muted-foreground text-[11px]">
                    {lastResult.results?.[0]?.clusterTitle
                      ? `Clustered into: ${lastResult.results[0].clusterTitle} (Urgency: ${lastResult.results[0].clusterUrgency})`
                      : lastResult.results?.[0]?.suppressed
                      ? "Silenced by active 24h suppression pattern shield."
                      : "Processed successfully."}
                  </div>
                </>
              )}

              {lastResult.type === "error" && (
                <div className="font-bold text-rose-400">
                  Simulation Error: {lastResult.message}
                </div>
              )}
            </div>
          </div>

          <Button
            variant="emerald"
            size="xs"
            onClick={onNavigateToQueue}
            className="gap-1 font-bold text-xs"
          >
            <span>View in Triage Cockpit</span>
            <ArrowUpRight className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Manual Payload Testing Console */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-tight">
                Live Webhook Ingestion &amp; Payload Dispatcher
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Send raw vendor webhooks to <code className="text-primary font-mono font-bold">POST /api/ingest</code> to verify normalization.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={copyCurlCommand}
              className="gap-1 font-mono text-xs"
            >
              {copiedCurl ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span>cURL Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy cURL</span>
                </>
              )}
            </Button>

            <Button
              variant="cyber"
              size="xs"
              onClick={handleSendWebhook}
              disabled={sendingWebhook}
              className="gap-1.5 font-bold"
            >
              <Terminal className="h-3 w-3" />
              <span>{sendingWebhook ? "Dispatching..." : "Send Webhook"}</span>
            </Button>
          </div>
        </div>

        {/* Source Switcher */}
        <div className="flex flex-wrap gap-1 border-b border-border pb-2">
          {(["pagerduty", "datadog", "aws_cloudwatch"] as const).map((s) => (
            <Button
              key={s}
              variant={selectedSource === s ? "cyber" : "ghost"}
              size="xs"
              onClick={() => handleSourceTab(s)}
              className="text-xs font-mono capitalize"
            >
              {s.replace("_", " ")}
            </Button>
          ))}
        </div>

        {/* JSON Editor */}
        <div className="space-y-1.5">
          <textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={12}
            className="w-full rounded-md border border-border bg-card p-3 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
          />
        </div>
      </Card>
    </div>
  );
}
