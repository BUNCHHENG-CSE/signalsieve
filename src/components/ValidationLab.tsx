"use client";

import React, { useEffect, useState } from "react";
import {
  ClusteringConfig,
  ValidationAlertItem,
  ValidationReport,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  FlaskConical,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Save,
  RotateCcw,
} from "lucide-react";

interface ValidationLabProps {
  initialConfig: ClusteringConfig;
  onConfigSaved: () => Promise<void>;
}

export function ValidationLab({
  initialConfig,
  onConfigSaved,
}: ValidationLabProps) {
  const [config, setConfig] = useState<ClusteringConfig>(initialConfig);
  const [dataset, setDataset] = useState<ValidationAlertItem[]>([]);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProd, setSavingProd] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    fetchInitialValidation();
  }, []);

  const fetchInitialValidation = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/validate");
      const data = await res.json();
      if (data.config) setConfig(data.config);
      if (data.dataset) setDataset(data.dataset);
      if (data.report) setReport(data.report);
    } finally {
      setLoading(false);
    }
  };

  const runEvaluation = async (
    nextConfig: ClusteringConfig,
    customItems?: ValidationAlertItem[],
    applyToProd = false
  ) => {
    if (applyToProd) setSavingProd(true);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: nextConfig,
          items: customItems || dataset,
          applyToProd,
        }),
      });
      const data = await res.json();
      if (data.report) setReport(data.report);
      if (applyToProd) {
        setSavedBanner(true);
        setTimeout(() => setSavedBanner(false), 3000);
        await onConfigSaved();
      }
    } finally {
      if (applyToProd) setSavingProd(false);
    }
  };

  const handleSliderChange = (
    field: keyof ClusteringConfig,
    value: number
  ) => {
    const updated = { ...config, [field]: value };
    setConfig(updated);
    runEvaluation(updated);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");

    try {
      const text = await file.text();
      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : parsed.alerts || [];
        if (arr.length === 0) throw new Error("JSON file contains no alert items.");
        setDataset(arr);
        await runEvaluation(config, arr);
      } else {
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length < 2) throw new Error("CSV must have header and at least 1 row.");
        const headers = lines[0].split(",").map((h) => h.trim());
        const items: ValidationAlertItem[] = lines.slice(1).map((line, idx) => {
          const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          const row: Record<string, string> = {};
          headers.forEach((h, i) => {
            row[h] = cols[i] || "";
          });
          return {
            id: row.id || `csv-${idx + 1}`,
            timestamp: row.timestamp || new Date().toISOString(),
            source: (row.source as any) || "csv_import",
            service: row.service || "core-api",
            environment: (row.environment as any) || "production",
            severity: (row.severity as any) || "high",
            title: row.title || "Imported Alert",
            description: row.description || "",
            human_cluster_label: row.human_cluster_label || "Unlabeled Group",
          };
        });
        setDataset(items);
        await runEvaluation(config, items);
      }
    } catch (err: any) {
      setUploadError(err?.message || "Failed to parse uploaded file");
    }
  };

  const handleExportSampleJson = () => {
    const blob = new Blob([JSON.stringify(dataset, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "one-week-alerts-human-labeled.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !report) {
    return (
      <Card className="p-10 text-center text-xs text-muted-foreground font-mono">
        <div className="flex justify-center mb-2">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        Loading 1-Week Validation Lab...
      </Card>
    );
  }

  return (
    <div className="space-y-5 font-mono">
      {/* Header Card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">
                1-Week Historical Validation &amp; Consensus Lab
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Validate what &ldquo;related&rdquo; means for your team before trusting automated noise reduction. Compare your manual 1-week incident grouping against the correlation engine and tune parameters until consensus exceeds 85%.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={handleExportSampleJson}
              className="gap-1 font-mono"
            >
              <Download className="h-3 w-3 text-primary" />
              <span>Sample Export JSON</span>
            </Button>
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition">
              <Upload className="h-3 w-3 text-emerald-400" />
              <span>Upload Custom Data (JSON/CSV)</span>
              <input
                type="file"
                accept=".json,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {uploadError && (
          <div className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">
            {uploadError}
          </div>
        )}
      </Card>

      {/* Main Grid: Parameters + Scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Sliders */}
        <Card className="lg:col-span-5 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Correlation Parameters
              </h3>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const defaults: ClusteringConfig = {
                  ...config,
                  time_window_minutes: 15,
                  entity_weight: 0.45,
                  service_topology_weight: 0.30,
                  text_similarity_weight: 0.25,
                  similarity_threshold: 0.42,
                };
                setConfig(defaults);
                runEvaluation(defaults);
              }}
              className="gap-1 text-[11px]"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </Button>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-foreground">Correlation Time Window</span>
                <Badge variant="cyan" className="py-0 text-[10px]">
                  {config.time_window_minutes} mins
                </Badge>
              </div>
              <input
                type="range"
                min={2}
                max={60}
                step={1}
                value={config.time_window_minutes}
                onChange={(e) =>
                  handleSliderChange("time_window_minutes", Number(e.target.value))
                }
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-foreground">Shared Entity Weight</span>
                <Badge variant="cyan" className="py-0 text-[10px]">
                  {config.entity_weight.toFixed(2)}
                </Badge>
              </div>
              <input
                type="range"
                min={0.05}
                max={1.0}
                step={0.05}
                value={config.entity_weight}
                onChange={(e) =>
                  handleSliderChange("entity_weight", Number(e.target.value))
                }
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-foreground">Service Topology Weight</span>
                <Badge variant="cyan" className="py-0 text-[10px]">
                  {config.service_topology_weight.toFixed(2)}
                </Badge>
              </div>
              <input
                type="range"
                min={0.05}
                max={1.0}
                step={0.05}
                value={config.service_topology_weight}
                onChange={(e) =>
                  handleSliderChange("service_topology_weight", Number(e.target.value))
                }
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-foreground">Text / Token Weight</span>
                <Badge variant="cyan" className="py-0 text-[10px]">
                  {config.text_similarity_weight.toFixed(2)}
                </Badge>
              </div>
              <input
                type="range"
                min={0.05}
                max={1.0}
                step={0.05}
                value={config.text_similarity_weight}
                onChange={(e) =>
                  handleSliderChange("text_similarity_weight", Number(e.target.value))
                }
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-foreground">Minimum Merge Threshold</span>
                <Badge variant="amber" className="py-0 text-[10px]">
                  {config.similarity_threshold.toFixed(2)}
                </Badge>
              </div>
              <input
                type="range"
                min={0.15}
                max={0.85}
                step={0.02}
                value={config.similarity_threshold}
                onChange={(e) =>
                  handleSliderChange("similarity_threshold", Number(e.target.value))
                }
                className="w-full accent-amber-400"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <Button
              variant="emerald"
              size="sm"
              onClick={() => runEvaluation(config, dataset, true)}
              disabled={savingProd}
              className="w-full font-bold text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{savingProd ? "Applying to Engine..." : "Apply Tuned Parameters to Engine"}</span>
            </Button>
            {savedBanner && (
              <p className="text-center text-[11px] text-emerald-400 font-bold">
                ✓ Engine updated with new parameters!
              </p>
            )}
          </div>
        </Card>

        {/* Right Scorecard */}
        <div className="lg:col-span-7 space-y-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Card className="p-3">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Team F1</div>
              <div
                className={`text-xl font-bold mt-1 ${
                  report.f1AgreementScore >= 85
                    ? "text-emerald-600 dark:text-emerald-400"
                    : report.f1AgreementScore >= 65
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {report.f1AgreementScore}%
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">
                {report.status === "ready_for_prod" ? "✓ Prod Ready" : "Needs Tuning"}
              </div>
            </Card>

            <Card className="p-3">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Precision</div>
              <div className="text-xl font-bold mt-1 text-foreground">{report.pairwisePrecision}%</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">No false merges</div>
            </Card>

            <Card className="p-3">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Recall</div>
              <div className="text-xl font-bold mt-1 text-foreground">{report.pairwiseRecall}%</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Catches related</div>
            </Card>

            <Card className="p-3">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Clusters</div>
              <div className="text-xl font-bold mt-1 text-cyan-600 dark:text-cyan-400">
                {report.engineClusterCount}
                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                  vs {report.humanClusterCount}
                </span>
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">{report.totalAlerts} alerts</div>
            </Card>
          </div>

          {/* Disagreements */}
          <Card className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Consensus Disagreements
              </h3>
              <Badge variant="outline" className="font-mono text-[10px]">
                {report.disagreements.length} Mismatches
              </Badge>
            </div>

            {report.disagreements.length === 0 ? (
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>100% Consensus! Engine matches team labeling across all alerts.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {report.disagreements.map((d, idx) => (
                  <div key={idx} className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1 text-[11px]">
                        <AlertTriangle className="h-3 w-3" />
                        {d.type === "false_merge" ? "False Merge" : "Missed Merge"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">Score: {d.score}</span>
                    </div>
                    <div className="text-foreground text-[11px]">
                      <span className="font-bold text-primary">[{d.alertA.service}]</span> {d.alertA.title}{" "}
                      <span className="text-muted-foreground">↔</span>{" "}
                      <span className="font-bold text-primary">[{d.alertB.service}]</span> {d.alertB.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{d.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Generated Clusters */}
          <Card className="p-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Generated Clusters ({report.engineClusters.length})
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {report.engineClusters.map((ec) => (
                <div key={ec.clusterId} className="rounded border border-border bg-background p-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary text-[11px]">
                      Matched: {ec.dominantHumanLabel}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{ec.alertCount} alerts</span>
                      <Badge variant={ec.purity === 100 ? "emerald" : "amber"} className="py-0 text-[9px]">
                        Purity {ec.purity}%
                      </Badge>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">{ec.summary}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
