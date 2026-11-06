"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCluster,
  AlertSource,
  ClusteringConfig,
  Environment,
  Severity,
  SuppressionRule,
} from "@/lib/types";
import { ClusterDetailDrawer } from "@/components/ClusterDetailDrawer";
import { SuppressModal } from "@/components/SuppressModal";
import { IngestionSimulator } from "@/components/IngestionSimulator";
import { ValidationLab } from "@/components/ValidationLab";
import { AnalyticsTab } from "@/components/AnalyticsTab";
import { CreateSuppressionModal } from "@/components/CreateSuppressionModal";
import { ShortcutsModal } from "@/components/ShortcutsModal";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AutoRefreshDropdown } from "@/components/AutoRefreshDropdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ShieldAlert,
  Sparkles,
  ShieldOff,
  Activity,
  Clock,
  Layers,
  FlaskConical,
  Settings,
  CheckCircle2,
  ArrowUpDown,
  Server,
  ChevronRight,
  Trash2,
  Play,
  X,
  Flame,
  TrendingDown,
  Search,
  Copy,
  Check,
  Zap,
  ArrowUpRight,
  CheckCircle,
  BarChart3,
  SlidersHorizontal,
  Keyboard,
  RotateCcw,
  Plus,
  Radio,
  Download,
  Filter,
} from "lucide-react";

const SOURCE_LABELS: Record<string, string> = {
  pagerduty: "PagerDuty",
  datadog: "Datadog",
  aws_cloudwatch: "AWS CloudWatch",
  aws_guardduty: "AWS GuardDuty",
  generic_webhook: "Webhook",
  csv_import: "Imported",
};

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

const SEVERITY_CONFIG: Record<
  string,
  { label: string; variant: "rose" | "amber" | "secondary" | "cyan" }
> = {
  critical: { label: "CRITICAL", variant: "rose" },
  high: { label: "HIGH", variant: "amber" },
  warning: { label: "WARNING", variant: "amber" },
  info: { label: "INFO", variant: "cyan" },
};

function formatTimeRemaining(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Expired";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m left`;
}

export default function SignalSieveDashboard() {
  const [activeTab, setActiveTab] = useState<
    "triage" | "suppressions" | "analytics" | "simulator" | "validation"
  >("triage");

  const [statusFilter, setStatusFilter] = useState<
    "open" | "acknowledged" | "resolved" | "suppressed" | "all"
  >("open");

  const [rankingMode, setRankingMode] = useState<"smart" | "raw_severity">("smart");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedPattern, setCopiedPattern] = useState<string | null>(null);

  // Advanced Filtering
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [sevFilter, setSevFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [minUrgency, setMinUrgency] = useState<number>(0);

  // Multi-Select Bulk Actions
  const [selectedClusterIds, setSelectedClusterIds] = useState<Set<string>>(new Set());

  // Auto-Refresh
  const [autoRefreshSecs, setAutoRefreshSecs] = useState<number>(0); // 0 = off, 5, 10, 30
  const [refreshCountdown, setRefreshCountdown] = useState<number>(0);

  // Keyboard navigation & Shortcuts
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback(
    (text: string, type: "success" | "error" | "warning" | "info" = "info") => {
      const id = Math.random().toString(36).slice(2, 9);
      setToasts((prev) => [...prev, { id, text, type }]);
    },
    []
  );
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Dashboard Data
  const [metrics, setMetrics] = useState({
    totalRawAlerts: 0,
    activeClusters: 0,
    suppressedAlertsCount: 0,
    activeSuppressionRulesCount: 0,
    noiseReductionPercent: 0,
    estimatedMinutesSaved: 0,
  });

  const [clusters, setClusters] = useState<AlertCluster[]>([]);
  const [suppressions, setSuppressions] = useState<SuppressionRule[]>([]);
  const [config, setConfig] = useState<ClusteringConfig | null>(null);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [pgUrlInput, setPgUrlInput] = useState("");
  const [pgConnMessage, setPgConnMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [sampleWebhooks, setSampleWebhooks] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Modals & Drawers
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [suppressingCluster, setSuppressingCluster] = useState<AlertCluster | null>(null);
  const [showCreateSuppressModal, setShowCreateSuppressModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/overview?status=all");
      const data = await res.json();
      if (data.metrics) setMetrics(data.metrics);
      if (data.clusters) setClusters(data.clusters);
      if (data.suppressions) setSuppressions(data.suppressions);
      if (data.config) setConfig(data.config);
      if (data.dbStatus) setDbStatus(data.dbStatus);
      if (data.scenarios) setScenarios(data.scenarios);
      if (data.sampleWebhooks) setSampleWebhooks(data.sampleWebhooks);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Live Auto-Refresh Interval Engine
  useEffect(() => {
    if (autoRefreshSecs <= 0) {
      setRefreshCountdown(0);
      return;
    }

    setRefreshCountdown(autoRefreshSecs);
    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          loadOverview();
          return autoRefreshSecs;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefreshSecs, loadOverview]);

  const selectedCluster =
    clusters.find((c) => c.id === selectedClusterId) || null;

  // Unique services list for filters and suppression rules
  const allUniqueServices = useMemo(() => {
    const s = new Set<string>();
    clusters.forEach((c) => c.services.forEach((svc) => s.add(svc)));
    return Array.from(s).sort();
  }, [clusters]);

  // Filter and sort clusters
  const filteredClusters = useMemo(() => {
    return clusters
      .filter((c) => {
        // Status filter
        if (statusFilter === "open") {
          if (c.status !== "open" && c.status !== "acknowledged") return false;
        } else if (statusFilter !== "all") {
          if (c.status !== statusFilter) return false;
        }

        // Advanced: Environment
        if (envFilter !== "all" && c.environment !== envFilter) return false;

        // Advanced: Severity
        if (sevFilter !== "all" && c.highest_severity !== sevFilter) return false;

        // Advanced: Service
        if (serviceFilter !== "all" && !c.services.includes(serviceFilter)) return false;

        // Advanced: Min Urgency
        if (minUrgency > 0 && c.urgency_score < minUrgency) return false;

        // Search text filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = c.title.toLowerCase().includes(q);
          const matchSummary = c.context_summary.toLowerCase().includes(q);
          const matchRoot = c.root_cause_hypothesis.toLowerCase().includes(q);
          const matchService = c.services.some((s) => s.toLowerCase().includes(q));
          const matchPattern = c.pattern_signature.toLowerCase().includes(q);
          const matchEnv = c.environment.toLowerCase().includes(q);
          if (
            !matchTitle &&
            !matchSummary &&
            !matchRoot &&
            !matchService &&
            !matchPattern &&
            !matchEnv
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (rankingMode === "smart") {
          if (b.urgency_score !== a.urgency_score) {
            return b.urgency_score - a.urgency_score;
          }
          return b.blast_radius_score - a.blast_radius_score;
        } else {
          // Legacy naive severity sort
          const sevRank: Record<string, number> = {
            critical: 4,
            high: 3,
            warning: 2,
            info: 1,
          };
          const diff =
            (sevRank[b.highest_severity] || 0) - (sevRank[a.highest_severity] || 0);
          if (diff !== 0) return diff;
          if (a.environment !== b.environment) {
            return a.environment === "staging" ? -1 : 1;
          }
          return b.alert_count - a.alert_count;
        }
      });
  }, [
    clusters,
    statusFilter,
    envFilter,
    sevFilter,
    serviceFilter,
    minUrgency,
    searchQuery,
    rankingMode,
  ]);

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        if (e.key === "Escape") {
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        if (selectedClusterId) setSelectedClusterId(null);
        if (showSettingsModal) setShowSettingsModal(false);
        if (showShortcutsModal) setShowShortcutsModal(false);
        if (showCreateSuppressModal) setShowCreateSuppressModal(false);
        if (suppressingCluster) setSuppressingCluster(null);
        return;
      }

      if (activeTab === "triage" && filteredClusters.length > 0) {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(filteredClusters.length - 1, prev + 1));
        } else if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(0, prev - 1));
        } else if (e.key === "Enter" && focusedIndex >= 0) {
          e.preventDefault();
          setSelectedClusterId(filteredClusters[focusedIndex].id);
        } else if (e.key === "a" && focusedIndex >= 0) {
          e.preventDefault();
          handleClusterStatusChange(filteredClusters[focusedIndex].id, "acknowledged");
        } else if (e.key === "r" && focusedIndex >= 0) {
          e.preventDefault();
          handleClusterStatusChange(filteredClusters[focusedIndex].id, "resolved");
        } else if (e.key === "s" && focusedIndex >= 0) {
          e.preventDefault();
          setSuppressingCluster(filteredClusters[focusedIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTab,
    filteredClusters,
    focusedIndex,
    selectedClusterId,
    showSettingsModal,
    showShortcutsModal,
    showCreateSuppressModal,
    suppressingCluster,
  ]);

  // Bulk Selection Handlers
  const toggleSelectAll = () => {
    if (selectedClusterIds.size === filteredClusters.length) {
      setSelectedClusterIds(new Set());
    } else {
      setSelectedClusterIds(new Set(filteredClusters.map((c) => c.id)));
    }
  };

  const toggleSelectCluster = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClusterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkStatusChange = async (
    status: "open" | "acknowledged" | "resolved"
  ) => {
    const ids = Array.from(selectedClusterIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/clusters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_status",
          clusterIds: ids,
          status,
        }),
      });
      if (res.ok) {
        addToast(`Marked ${ids.length} incidents as ${status}!`, "success");
        setSelectedClusterIds(new Set());
        await loadOverview();
      }
    } catch {
      addToast("Failed to update incident batch status", "error");
    }
  };

  const handleBulkSuppress = async () => {
    const ids = Array.from(selectedClusterIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/clusters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_suppress",
          clusterIds: ids,
          reason: "Bulk 24h suppression applied from Triage Cockpit",
        }),
      });
      if (res.ok) {
        addToast(`Suppressed ${ids.length} incidents for 24 hours!`, "success");
        setSelectedClusterIds(new Set());
        await loadOverview();
      }
    } catch {
      addToast("Failed to bulk suppress incidents", "error");
    }
  };

  const handleBulkExportJson = () => {
    const ids = Array.from(selectedClusterIds);
    const selected = clusters.filter((c) => ids.includes(c.id));
    const blob = new Blob([JSON.stringify(selected, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tct-signalsieve-incidents-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Exported ${selected.length} incidents as JSON`, "success");
  };

  const handleConfirmSuppress = async (payload: {
    name: string;
    pattern_signature: string;
    reason: string;
    created_by: string;
    durationHours: number;
    clusterId?: string;
  }) => {
    const res = await fetch("/api/suppressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      addToast(`Pattern ${payload.pattern_signature} suppressed for 24h!`, "success");
      await loadOverview();
    }
  };

  const handleClusterStatusChange = async (
    clusterId: string,
    status: "open" | "acknowledged" | "resolved"
  ) => {
    const res = await fetch(`/api/clusters/${clusterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      addToast(`Incident #${clusterId.slice(0, 8)} status set to ${status}`, "info");
      await loadOverview();
    }
  };

  const handleRegenerateSummary = async (clusterId: string) => {
    const res = await fetch(`/api/clusters/${clusterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerate_summary" }),
    });
    if (res.ok) {
      addToast("Incident context re-synthesized with LLM engine!", "success");
      await loadOverview();
    }
  };

  const handleRevokeSuppression = async (ruleId: string) => {
    const res = await fetch(`/api/suppressions?id=${ruleId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      addToast("Suppression rule revoked.", "info");
      await loadOverview();
    }
  };

  const handleTestSuppressedRule = async (rule: SuppressionRule) => {
    setTestingRuleId(rule.id);
    try {
      const simulatedPayload = {
        title: `[Synthetics] Alert matching ${rule.pattern_signature}`,
        service: rule.match_criteria?.service || "edge-gateway",
        severity: "critical",
        environment: "production",
        description: `Synthetic alarm to verify active 24h suppression pattern: ${rule.pattern_signature}`,
        source: rule.match_criteria?.source || "datadog",
        timestamp: new Date().toISOString(),
      };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(simulatedPayload),
      });
      const data = await res.json();
      if (data.suppressedCount > 0) {
        addToast(`Shield verified: ${rule.pattern_signature} intercepted and muted!`, "success");
      } else {
        addToast(`Alert ingested into queue (did not match pattern).`, "warning");
      }
      await loadOverview();
    } finally {
      setTestingRuleId(null);
    }
  };

  const copyPatternSignature = (sig: string) => {
    navigator.clipboard.writeText(sig);
    setCopiedPattern(sig);
    addToast(`Pattern ${sig} copied to clipboard`, "info");
    setTimeout(() => setCopiedPattern(null), 1800);
  };

  const resetAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("open");
    setEnvFilter("all");
    setSevFilter("all");
    setServiceFilter("all");
    setMinUrgency(0);
    addToast("All filters reset", "info");
  };

  const hasActiveFilters =
    searchQuery !== "" ||
    statusFilter !== "open" ||
    envFilter !== "all" ||
    sevFilter !== "all" ||
    serviceFilter !== "all" ||
    minUrgency > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background font-mono antialiased text-foreground">
      {/* Toast Feedback Layer */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header Bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-2.5">
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldAlert className="h-4 w-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-foreground font-mono">
                  <span className="text-primary">TCT</span> SIGNAL<span className="text-primary/70">SIEVE</span>
                </span>
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-mono">
                  base-mira
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground hidden sm:block">
                Alert Noise Reducer &amp; Blast-Radius Triage
              </p>
            </div>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="flex items-center gap-1 rounded-lg border border-border bg-card/60 p-1 overflow-x-auto">
            <Button
              variant={activeTab === "triage" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("triage")}
              className="gap-1.5 text-xs font-mono"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Triage</span>
              <span
                className={`ml-1 rounded px-1.5 py-0.2 text-[10px] font-bold ${
                  activeTab === "triage"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {metrics.activeClusters}
              </span>
            </Button>

            <Button
              variant={activeTab === "suppressions" ? "amber" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("suppressions")}
              className="gap-1.5 text-xs font-mono"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              <span>24h Suppress</span>
              <span className="ml-1 rounded bg-muted px-1.5 py-0.2 text-[10px] text-amber-300 font-bold">
                {metrics.activeSuppressionRulesCount}
              </span>
            </Button>

            <Button
              variant={activeTab === "analytics" ? "cyber" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("analytics")}
              className="gap-1.5 text-xs font-mono"
            >
              <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
              <span>Analytics &amp; ROI</span>
            </Button>

            <Button
              variant={activeTab === "simulator" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("simulator")}
              className="gap-1.5 text-xs font-mono"
            >
              <Zap className="h-3.5 w-3.5 text-purple-400" />
              <span>Simulator</span>
            </Button>

            <Button
              variant={activeTab === "validation" ? "emerald" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("validation")}
              className="gap-1.5 text-xs font-mono"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              <span>Validation Lab</span>
            </Button>
          </nav>

          {/* Engine Status, Auto-Refresh & Settings Trigger */}
          <div className="flex items-center gap-2">
            {/* Live Auto-Refresh Selector Dropdown */}
            <AutoRefreshDropdown
              autoRefreshSecs={autoRefreshSecs}
              onSelectSecs={(val) => {
                setAutoRefreshSecs(val);
                if (val > 0) addToast(`Auto-refresh set to ${val}s`, "info");
                else addToast("Auto-refresh turned off", "info");
              }}
              countdown={refreshCountdown}
              onManualRefresh={async () => {
                addToast("Refreshing telemetry clusters...", "info");
                await loadOverview();
                addToast("Dashboard refreshed", "success");
              }}
            />

            {/* Keyboard Shortcuts Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowShortcutsModal(true)}
              className="gap-1 text-[11px] h-7 px-2"
              title="Keyboard Shortcuts (?)"
            >
              <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden lg:inline">Hotkeys</span>
            </Button>

            {/* DB Status */}
            {dbStatus && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettingsModal(true)}
                className="gap-1.5 text-[11px] font-mono h-7"
                title="Database Engine Status"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    dbStatus.engine === "postgresql"
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-cyan-400"
                  }`}
                />
                <span>
                  {dbStatus.engine === "postgresql"
                    ? dbStatus.orm?.includes("Neon")
                      ? "Neon PG"
                      : `PG: ${dbStatus.pool.totalCount}/${dbStatus.pool.max}`
                    : "SQLite (Local)"}
                </span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettingsModal(true)}
              className="gap-1.5 text-xs h-7"
            >
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Settings</span>
            </Button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* KPI Scorecard Row (shadcn Cards) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Compression Funnel
              </span>
              <TrendingDown className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">
                {metrics.totalRawAlerts}
              </span>
              <span className="text-xs text-muted-foreground">raw</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400">
                {metrics.activeClusters}
              </span>
              <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                incidents
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <div className="h-1.5 w-full max-w-[130px] rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-cyan-600 dark:bg-cyan-400 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        10,
                        metrics.totalRawAlerts > 0
                          ? (metrics.activeClusters / metrics.totalRawAlerts) * 100
                          : 10
                      )
                    )}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-300 font-semibold">
                {metrics.totalRawAlerts > 0
                  ? `${(
                      (1 - metrics.activeClusters / metrics.totalRawAlerts) *
                      100
                    ).toFixed(0)}% Sifted`
                  : "100% Sifted"}
              </span>
            </div>
          </Card>

          <Card className="p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Noise Reduction
              </span>
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {metrics.noiseReductionPercent}%
              </span>
              <span className="text-xs text-muted-foreground">fewer pages</span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Multi-service cascades grouped</span>
            </div>
          </Card>

          <Card className="p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                24h Pattern Shields
              </span>
              <ShieldOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {metrics.suppressedAlertsCount}
              </span>
              <span className="text-xs text-muted-foreground">
                silenced ({metrics.activeSuppressionRulesCount} rules)
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Exact 24h auto-expiry guarantee</span>
            </div>
          </Card>

          <Card className="p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                On-Call Time Saved
              </span>
              <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                {(metrics.estimatedMinutesSaved / 60).toFixed(1)} hrs
              </span>
              <span className="text-xs text-muted-foreground">
                ({metrics.estimatedMinutesSaved} mins)
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Activity className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>Zero manual context stitching</span>
            </div>
          </Card>
        </section>

        {/* TAB 1: TRIAGE QUEUE */}
        {activeTab === "triage" && (
          <section className="space-y-4">
            {/* Filter & Search Bar */}
            <Card className="p-3">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by title, service, environment... (/)"
                    className="pl-8 text-xs font-mono"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Status Segmented Buttons */}
                <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-secondary/40 p-0.5">
                  {(
                    [
                      { id: "open", label: "Active Queue" },
                      { id: "suppressed", label: "Suppressed" },
                      { id: "resolved", label: "Resolved" },
                      { id: "all", label: "All" },
                    ] as const
                  ).map((st) => (
                    <Button
                      key={st.id}
                      variant={statusFilter === st.id ? "default" : "ghost"}
                      size="xs"
                      onClick={() => setStatusFilter(st.id)}
                      className="font-mono text-[11px]"
                    >
                      {st.label}
                    </Button>
                  ))}
                </div>

                {/* Rank Toggle & Advanced Filter Toggle */}
                <div className="flex items-center gap-2">
                  <Button
                    variant={showAdvancedFilters ? "secondary" : "outline"}
                    size="xs"
                    onClick={() => setShowAdvancedFilters((prev) => !prev)}
                    className="text-[11px] font-mono gap-1 h-7"
                  >
                    <SlidersHorizontal className="h-3 w-3 text-cyan-400" />
                    <span>Filters</span>
                    {hasActiveFilters && (
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    )}
                  </Button>

                  <div className="flex rounded-md border border-border bg-secondary/40 p-0.5">
                    <Button
                      variant={rankingMode === "smart" ? "cyber" : "ghost"}
                      size="xs"
                      onClick={() => setRankingMode("smart")}
                      className="text-[11px] font-mono"
                    >
                      <Flame className="h-3 w-3" />
                      <span>Smart Impact</span>
                    </Button>
                    <Button
                      variant={rankingMode === "raw_severity" ? "destructive" : "ghost"}
                      size="xs"
                      onClick={() => setRankingMode("raw_severity")}
                      className="text-[11px] font-mono"
                    >
                      <ArrowUpDown className="h-3 w-3" />
                      <span>Naive Severity</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Advanced Filter Drawer Section */}
              {showAdvancedFilters && (
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-in slide-in-from-top-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      Environment
                    </label>
                    <select
                      value={envFilter}
                      onChange={(e) => setEnvFilter(e.target.value)}
                      className="w-full rounded border border-border bg-background p-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="all">All Environments</option>
                      <option value="production">Production</option>
                      <option value="staging">Staging</option>
                      <option value="development">Development</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      Severity
                    </label>
                    <select
                      value={sevFilter}
                      onChange={(e) => setSevFilter(e.target.value)}
                      className="w-full rounded border border-border bg-background p-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="all">All Severities</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="warning">Warning</option>
                      <option value="info">Info</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      Target Service
                    </label>
                    <select
                      value={serviceFilter}
                      onChange={(e) => setServiceFilter(e.target.value)}
                      className="w-full rounded border border-border bg-background p-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="all">All Microservices</option>
                      {allUniqueServices.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-muted-foreground">
                      <span>Min Urgency</span>
                      <span className="text-cyan-400 font-bold">{minUrgency}/100</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="range"
                        min="0"
                        max="90"
                        step="10"
                        value={minUrgency}
                        onChange={(e) => setMinUrgency(Number(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                      {hasActiveFilters && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={resetAllFilters}
                          className="h-6 text-[10px] px-1 text-muted-foreground hover:text-foreground"
                          title="Reset All Filters"
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Select All / Batch Action Header */}
            {filteredClusters.length > 0 && (
              <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      selectedClusterIds.size === filteredClusters.length &&
                      filteredClusters.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary accent-cyan-500 cursor-pointer"
                  />
                  <span>
                    Select All ({filteredClusters.length} incidents shown)
                  </span>
                </div>

                <div className="text-[11px]">
                  Use <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">j</kbd> / <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">k</kbd> to navigate, <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">Enter</kbd> to inspect
                </div>
              </div>
            )}

            {/* Naive Ranking Banner */}
            {rankingMode === "raw_severity" && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold">⚠️ Naive Severity Active:</span> Monitor labels alone push flapping staging alerts to the top, burying production cascades.
                </div>
                <Button
                  variant="amber"
                  size="xs"
                  onClick={() => setRankingMode("smart")}
                  className="font-bold"
                >
                  Restore Smart Ranking
                </Button>
              </div>
            )}

            {/* Clusters Stream */}
            {loading ? (
              <Card className="p-12 text-center text-xs text-muted-foreground">
                <div className="flex justify-center mb-2">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
                Synthesizing incident context across telemetry sources...
              </Card>
            ) : filteredClusters.length === 0 ? (
              <Card className="p-12 text-center space-y-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-semibold text-foreground">
                  No incident clusters match your filter
                </div>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {hasActiveFilters
                    ? "Try loosening your search filters or status selection."
                    : "Queue is clean! Trigger a simulated alert storm from the Simulator tab."}
                </p>
                {hasActiveFilters ? (
                  <Button variant="outline" size="xs" onClick={resetAllFilters}>
                    Clear All Filters
                  </Button>
                ) : (
                  <Button
                    variant="cyber"
                    size="xs"
                    onClick={() => setActiveTab("simulator")}
                  >
                    Go to Incident Simulator
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-3.5">
                {filteredClusters.map((cluster, idx) => {
                  const isHighUrgency = cluster.urgency_score >= 80;
                  const isLowBlastNoisy =
                    cluster.blast_radius_score <= 45 && cluster.alert_count >= 5;
                  const sevInfo =
                    SEVERITY_CONFIG[cluster.highest_severity] ||
                    SEVERITY_CONFIG.warning;
                  const isSelected = selectedClusterIds.has(cluster.id);
                  const isFocused = focusedIndex === idx;

                  return (
                    <Card
                      key={cluster.id}
                      className={`relative overflow-hidden transition-all ${
                        isFocused ? "ring-2 ring-cyan-400" : ""
                      } ${
                        cluster.status === "suppressed"
                          ? "opacity-60 bg-card/40"
                          : isHighUrgency
                          ? "border-cyan-500/30 shadow-md shadow-cyan-950/20"
                          : "hover:border-border/80"
                      }`}
                    >
                      {/* Left Urgency Accent Line */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 ${
                          cluster.status === "suppressed"
                            ? "bg-muted-foreground"
                            : isHighUrgency
                            ? "bg-rose-500"
                            : "bg-cyan-500"
                        }`}
                      />

                      <CardContent className="p-4 sm:p-5 pl-5 sm:pl-6 space-y-3">
                        {/* Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onClick={(e) => toggleSelectCluster(cluster.id, e)}
                              onChange={() => {}}
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary accent-cyan-500 cursor-pointer mr-1"
                            />

                            {/* Rank */}
                            <Badge
                              variant={
                                idx === 0 && rankingMode === "smart"
                                  ? "cyan"
                                  : "secondary"
                              }
                              className="font-bold text-[10px]"
                            >
                              #{idx + 1} PRIORITY
                            </Badge>

                            {/* Status */}
                            <Badge
                              variant={
                                cluster.status === "open"
                                  ? "rose"
                                  : cluster.status === "acknowledged"
                                  ? "cyan"
                                  : cluster.status === "suppressed"
                                  ? "amber"
                                  : "emerald"
                              }
                              className="gap-1 font-bold"
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  cluster.status === "open"
                                    ? "bg-rose-400 animate-pulse"
                                    : cluster.status === "acknowledged"
                                    ? "bg-cyan-400"
                                    : cluster.status === "suppressed"
                                    ? "bg-amber-400"
                                    : "bg-emerald-400"
                                }`}
                              />
                              {cluster.status}
                            </Badge>

                            {/* Environment */}
                            <Badge
                              variant={
                                cluster.environment === "production"
                                  ? "emerald"
                                  : "outline"
                              }
                              className="font-bold"
                            >
                              {cluster.environment}
                            </Badge>

                            {/* Severity Label */}
                            <Badge variant={sevInfo.variant}>
                              {sevInfo.label}
                            </Badge>
                          </div>

                          {/* Right HUD: Dual Scores + Compression */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="rose" className="gap-1 py-0.5">
                              <Flame className="h-3 w-3 text-rose-400" />
                              <span>Urgency: {cluster.urgency_score}/100</span>
                            </Badge>

                            <Badge variant="cyan" className="gap-1 py-0.5">
                              <Activity className="h-3 w-3 text-cyan-400" />
                              <span>Blast: {cluster.blast_radius_score}/100</span>
                            </Badge>

                            <Badge variant="outline" className="font-bold py-0.5">
                              {cluster.alert_count} Alerts → 1 Incident
                            </Badge>
                          </div>
                        </div>

                        {/* Title & Scope */}
                        <div className="space-y-1.5">
                          <h3
                            onClick={() => setSelectedClusterId(cluster.id)}
                            className="text-sm sm:text-base font-bold text-foreground hover:text-primary cursor-pointer transition flex items-center gap-1.5"
                          >
                            <span>{cluster.title}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </h3>

                          {/* Services & Sources */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
                            <span className="text-[10px] uppercase font-semibold">
                              Impacted:
                            </span>
                            {cluster.services.map((svc) => (
                              <Badge
                                key={svc}
                                variant="secondary"
                                className="gap-1 font-mono text-[10px]"
                              >
                                <Server className="h-2.5 w-2.5 text-primary" />
                                {svc}
                              </Badge>
                            ))}

                            <span className="text-border">|</span>

                            <span className="text-[10px] uppercase font-semibold">
                              Sources:
                            </span>
                            {cluster.sources.map((src) => {
                              const b =
                                SOURCE_BADGES[src] || SOURCE_BADGES.generic_webhook;
                              return (
                                <Badge
                                  key={src}
                                  variant={b.variant}
                                  className="gap-1 font-mono text-[10px]"
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${b.dot}`}
                                  />
                                  {SOURCE_LABELS[src] || src}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>

                        {/* Shared Context Intelligence Box */}
                        <div className="rounded-md border border-border bg-background/60 p-3.5 space-y-2.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                            <div className="flex items-center gap-1.5 text-primary font-bold text-[11px] uppercase tracking-wider">
                              <Sparkles className="h-3 w-3" />
                              <span>Shared Context Summary</span>
                              <span className="text-muted-foreground font-normal text-[10px]">
                                ({cluster.summary_source})
                              </span>
                            </div>

                            <button
                              onClick={() =>
                                copyPatternSignature(cluster.pattern_signature)
                              }
                              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground font-mono"
                            >
                              <span>Pattern: {cluster.pattern_signature}</span>
                              {copiedPattern === cluster.pattern_signature ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>

                          <p className="text-foreground leading-relaxed text-xs">
                            {cluster.context_summary}
                          </p>

                          {/* Root Cause Box */}
                          <div className="rounded border border-rose-500/20 bg-rose-500/5 p-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-rose-800 dark:text-rose-300">
                              <span className="font-bold uppercase text-[10px] tracking-wider mr-1.5 text-rose-700 dark:text-rose-400">
                                Root Cause Diagnosis:
                              </span>
                              <span className="text-foreground text-xs">
                                {cluster.root_cause_hypothesis}
                              </span>
                            </div>

                            {isLowBlastNoisy && cluster.status !== "suppressed" && (
                              <Button
                                variant="amber"
                                size="xs"
                                onClick={() => setSuppressingCluster(cluster)}
                                className="font-bold text-[10px]"
                              >
                                <ShieldOff className="h-3 w-3" />
                                <span>Noisy? Suppress 24h</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Actions Footer */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50 text-[11px]">
                          <span className="text-muted-foreground font-mono">
                            ID:{" "}
                            <code className="text-foreground">
                              {cluster.id.slice(0, 8)}
                            </code>
                          </span>

                          <div className="flex items-center gap-2">
                            {cluster.status !== "suppressed" && (
                              <Button
                                variant="amber"
                                size="sm"
                                onClick={() => setSuppressingCluster(cluster)}
                                className="font-semibold text-xs h-7"
                              >
                                <ShieldOff className="h-3.5 w-3.5" />
                                <span>Suppress 24h</span>
                              </Button>
                            )}

                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => setSelectedClusterId(cluster.id)}
                              className="font-semibold text-xs h-7"
                            >
                              <span>Inspect Blast Radius &amp; Alerts</span>
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: SUPPRESSIONS */}
        {activeTab === "suppressions" && (
          <section className="space-y-4">
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldOff className="h-5 w-5 text-amber-400" />
                    <h2 className="text-sm font-bold text-foreground">
                      24-Hour Pattern Suppression Shields &amp; Audit Log
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Transient or flapping alerts are muted for exactly 24 hours with an operator audit note. Zero permanent unmonitored silences.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="amber"
                    size="sm"
                    onClick={() => setShowCreateSuppressModal(true)}
                    className="gap-1.5 font-bold font-mono text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Custom Rule</span>
                  </Button>

                  <Badge variant="amber" className="font-mono text-xs">
                    {metrics.activeSuppressionRulesCount} Active Rules •{" "}
                    {metrics.suppressedAlertsCount} Silenced
                  </Badge>
                </div>
              </div>
            </Card>

            {suppressions.length === 0 ? (
              <Card className="p-12 text-center text-xs text-muted-foreground space-y-2">
                <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground" />
                <p>No active 24h suppression rules right now.</p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setShowCreateSuppressModal(true)}
                  className="mt-2"
                >
                  Create Custom Suppression Rule
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {suppressions.map((rule) => (
                  <Card key={rule.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={rule.is_active ? "amber" : "secondary"}>
                            {rule.is_active ? "Active 24h Shield" : "Expired"}
                          </Badge>
                          <code className="rounded bg-muted px-2 py-0.5 text-xs text-primary font-mono">
                            {rule.pattern_signature}
                          </code>
                          {rule.is_active && (
                            <span className="flex items-center gap-1 text-xs text-amber-300 font-mono">
                              <Clock className="h-3 w-3" />
                              {formatTimeRemaining(rule.expires_at)}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-foreground">
                          {rule.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="rounded border border-border bg-background px-3 py-1.5 text-right font-mono">
                          <div className="text-[9px] uppercase text-muted-foreground font-semibold">
                            Silenced
                          </div>
                          <div className="text-base font-bold text-amber-400">
                            {rule.suppressed_count}
                          </div>
                        </div>

                        {rule.is_active && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="cyber"
                              size="xs"
                              onClick={() => handleTestSuppressedRule(rule)}
                              disabled={testingRuleId === rule.id}
                              className="font-mono"
                            >
                              <Play className="h-3 w-3" />
                              <span>
                                {testingRuleId === rule.id
                                  ? "Testing..."
                                  : "Test Shield"}
                              </span>
                            </Button>

                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() => handleRevokeSuppression(rule.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Unsuppress</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded border border-border bg-background/60 p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="text-foreground">
                        <span className="font-bold text-amber-400 text-[10px] uppercase mr-1">
                          Reason Log:
                        </span>
                        &ldquo;{rule.reason}&rdquo;
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        Logged by {rule.created_by} •{" "}
                        {new Date(rule.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: ANALYTICS & ROI */}
        {activeTab === "analytics" && (
          <AnalyticsTab clusters={clusters} metrics={metrics} />
        )}

        {/* TAB 4: SIMULATOR */}
        {activeTab === "simulator" && (
          <IngestionSimulator
            scenarios={scenarios}
            sampleWebhooks={sampleWebhooks}
            onRefreshDashboard={loadOverview}
            onNavigateToQueue={() => setActiveTab("triage")}
            onNotify={addToast}
          />
        )}

        {/* TAB 5: VALIDATION */}
        {activeTab === "validation" && config && (
          <ValidationLab initialConfig={config} onConfigSaved={loadOverview} />
        )}
      </main>

      {/* Floating Multi-Select Bulk Actions Toolbar */}
      {selectedClusterIds.size > 0 && activeTab === "triage" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-cyan-500/50 bg-background/95 px-5 py-2.5 shadow-2xl backdrop-blur-md font-mono text-xs animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2">
            <Badge variant="cyan" className="font-bold">
              {selectedClusterIds.size} Selected
            </Badge>
          </div>

          <div className="h-4 w-px bg-border" />

          <Button
            size="xs"
            variant="ghost"
            onClick={() => handleBulkStatusChange("acknowledged")}
            className="text-xs"
          >
            Ack All
          </Button>

          <Button
            size="xs"
            variant="emerald"
            onClick={() => handleBulkStatusChange("resolved")}
            className="text-xs"
          >
            Resolve All
          </Button>

          <Button
            size="xs"
            variant="amber"
            onClick={handleBulkSuppress}
            className="text-xs"
          >
            Silence 24h
          </Button>

          <Button
            size="xs"
            variant="outline"
            onClick={handleBulkExportJson}
            className="text-xs gap-1"
          >
            <Download className="h-3 w-3" />
            <span>Export JSON</span>
          </Button>

          <Button
            size="xs"
            variant="ghost"
            onClick={() => setSelectedClusterIds(new Set())}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Cluster Detail Drawer (with Waterfall Timeline & Export Modal) */}
      <ClusterDetailDrawer
        cluster={selectedCluster}
        onClose={() => setSelectedClusterId(null)}
        onSuppressClick={(c) => setSuppressingCluster(c)}
        onStatusChange={handleClusterStatusChange}
        onRegenerateSummary={handleRegenerateSummary}
        onNotify={addToast}
      />

      {/* 24h Suppress Modal (from Cluster) */}
      <SuppressModal
        cluster={suppressingCluster}
        onClose={() => setSuppressingCluster(null)}
        onConfirm={handleConfirmSuppress}
      />

      {/* Custom Suppression Rule Creator Modal */}
      <CreateSuppressionModal
        isOpen={showCreateSuppressModal}
        onClose={() => setShowCreateSuppressModal(false)}
        onRuleCreated={loadOverview}
        onNotify={addToast}
        availableServices={allUniqueServices}
      />

      {/* Keyboard Shortcuts Cheat Sheet */}
      <ShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Settings Modal (LLM Provider & Postgres Connection) */}
      {showSettingsModal && config && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
          <div className="relative flex flex-col w-full max-w-xl max-h-[90vh] rounded-lg border border-border bg-card text-card-foreground shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-5 py-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  Engine &amp; Database Settings
                </h2>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* PostgreSQL Config */}
              <div className="space-y-2 rounded-md border border-border bg-secondary/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">
                    Database Engine (Neon / SQLite)
                  </span>
                  <Badge variant={dbStatus?.engine === "postgresql" ? "emerald" : "outline"}>
                    {dbStatus?.engine === "postgresql"
                      ? dbStatus?.orm?.includes("Neon")
                        ? "Neon Serverless PG"
                        : "PostgreSQL (Pool Ready)"
                      : "SQLite (Local Active)"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Production uses Neon Serverless PostgreSQL with SSL. Local development uses zero-config SQLite (<code className="font-mono text-cyan-400">data/signalsieve.db</code>).
                </p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={pgUrlInput}
                    onChange={(e) => setPgUrlInput(e.target.value)}
                    placeholder="postgresql://user:password@ep-name.region.aws.neon.tech/neondb?sslmode=require"
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="cyber"
                    size="xs"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ postgres_url: pgUrlInput }),
                        });
                        const data = await res.json();
                        if (data.ok) {
                          setPgConnMessage({ type: "ok", text: "Connected successfully!" });
                          addToast("PostgreSQL connected successfully!", "success");
                          await loadOverview();
                        } else {
                          setPgConnMessage({ type: "err", text: data.error || "Failed" });
                          addToast(data.error || "PostgreSQL connection failed", "error");
                        }
                      } catch (err: any) {
                        setPgConnMessage({ type: "err", text: err?.message || "Failed" });
                      }
                    }}
                    className="shrink-0"
                  >
                    Connect
                  </Button>
                </div>
                {pgConnMessage && (
                  <p
                    className={`text-[11px] ${
                      pgConnMessage.type === "ok" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {pgConnMessage.text}
                  </p>
                )}
              </div>

              {/* LLM Provider Configuration */}
              <div className="space-y-3 rounded-md border border-border bg-secondary/20 p-3">
                <span className="font-bold text-foreground">
                  Summary Synthesizer Engine
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Select between offline deterministic synthesis (zero latency) or cloud LLM APIs.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "deterministic", label: "Deterministic (Offline)" },
                      { id: "openai", label: "OpenAI GPT-4o-mini" },
                      { id: "gemini", label: "Google Gemini 2.5" },
                      { id: "anthropic", label: "Anthropic Claude 3.5" },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setConfig({ ...config, llm_provider: p.id })}
                      className={`rounded border p-2 text-left text-xs transition-colors ${
                        config.llm_provider === p.id
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {config.llm_provider !== "deterministic" && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      API Key
                    </label>
                    <Input
                      type="password"
                      value={config.llm_api_key}
                      onChange={(e) =>
                        setConfig({ ...config, llm_api_key: e.target.value })
                      }
                      placeholder="sk-..."
                      className="font-mono text-xs"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettingsModal(false)}
              >
                Close
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={savingSettings}
                onClick={async () => {
                  setSavingSettings(true);
                  try {
                    await fetch("/api/settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(config),
                    });
                    addToast("Settings saved!", "success");
                    setShowSettingsModal(false);
                    await loadOverview();
                  } finally {
                    setSavingSettings(false);
                  }
                }}
              >
                {savingSettings ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
