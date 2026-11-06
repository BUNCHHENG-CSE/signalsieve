"use client";

import React, { useState } from "react";
import { AlertSource, Environment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldOff, Clock, X, AlertOctagon, Check } from "lucide-react";

interface CreateSuppressionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRuleCreated: () => Promise<void>;
  onNotify?: (message: string, type?: "success" | "error") => void;
  availableServices?: string[];
}

export function CreateSuppressionModal({
  isOpen,
  onClose,
  onRuleCreated,
  onNotify,
  availableServices = [],
}: CreateSuppressionModalProps) {
  const [name, setName] = useState("");
  const [patternSignature, setPatternSignature] = useState("");
  const [service, setService] = useState("");
  const [source, setSource] = useState<string>("all");
  const [entityKey, setEntityKey] = useState("");
  const [entityValue, setEntityValue] = useState("");
  const [durationHours, setDurationHours] = useState<number>(24);
  const [reason, setReason] = useState("");
  const [createdBy, setCreatedBy] = useState("alex@leanops.io (On-Call SRE)");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError("An audit reason is required (e.g. Jira maintenance ticket or flapping root cause).");
      return;
    }

    const effectivePattern =
      patternSignature.trim() ||
      (service ? `service:${service}` : `custom-rule-${Date.now().toString(36)}`);

    setIsSubmitting(true);
    try {
      const match_criteria: Record<string, string> = {
        pattern_signature: effectivePattern,
      };
      if (service.trim()) match_criteria.service = service.trim();
      if (source !== "all") match_criteria.source = source as AlertSource;
      if (entityKey.trim() && entityValue.trim()) {
        match_criteria.entity_key = entityKey.trim();
        match_criteria.entity_value = entityValue.trim();
      }

      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `Suppress: ${effectivePattern}`,
          pattern_signature: effectivePattern,
          match_criteria,
          reason: reason.trim(),
          created_by: createdBy.trim(),
          durationHours,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create suppression rule");
      }

      onNotify?.(`Suppression rule active for next ${durationHours} hours!`, "success");
      await onRuleCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error creating suppression rule");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono animate-in fade-in duration-150">
      <div className="relative flex flex-col w-full max-w-xl rounded-lg border border-border bg-card text-card-foreground shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-foreground">
              Create Custom Suppression Rule
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-rose-300 flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground">
              Rule Display Name
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Planned Redis Maintenance Window"
              className="text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">
                Target Service (Optional)
              </label>
              <Input
                type="text"
                list="services-list"
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="e.g. edge-gateway, billing-worker"
                className="text-xs font-mono"
              />
              <datalist id="services-list">
                {availableServices.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">
                Target Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded border border-border bg-background p-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Telemetry Sources</option>
                <option value="pagerduty">PagerDuty Only</option>
                <option value="datadog">Datadog Only</option>
                <option value="aws_cloudwatch">AWS CloudWatch Only</option>
                <option value="aws_guardduty">AWS GuardDuty Only</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground">
              Pattern Signature Regex / Key
            </label>
            <Input
              type="text"
              value={patternSignature}
              onChange={(e) => setPatternSignature(e.target.value)}
              placeholder="e.g. staging.*-high-cpu or timeout.*"
              className="text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Incoming alerts matching this signature will be silently intercepted.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">
                Entity Filter Key (Optional)
              </label>
              <Input
                type="text"
                value={entityKey}
                onChange={(e) => setEntityKey(e.target.value)}
                placeholder="e.g. host, cert_cn, error_code"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">
                Entity Filter Value (Optional)
              </label>
              <Input
                type="text"
                value={entityValue}
                onChange={(e) => setEntityValue(e.target.value)}
                placeholder="e.g. staging-redis-02, ETIMEDOUT"
                className="text-xs font-mono"
              />
            </div>
          </div>

          {/* Duration Selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground flex items-center justify-between">
              <span>Suppression Duration</span>
              <span className="text-amber-500 font-bold">{durationHours} Hours</span>
            </label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { hours: 1, label: "1h" },
                { hours: 6, label: "6h" },
                { hours: 12, label: "12h" },
                { hours: 24, label: "24h (Standard)" },
                { hours: 48, label: "48h" },
                { hours: 168, label: "7 Days" },
              ].map((opt) => (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => setDurationHours(opt.hours)}
                  className={`rounded border px-2.5 py-1 text-[11px] transition-colors ${
                    durationHours === opt.hours
                      ? "border-amber-500 bg-amber-500/20 text-amber-300 font-bold"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mandatory Reason Log */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground flex items-center justify-between">
              <span>Audit Reason Log <span className="text-rose-400">*</span></span>
              <span className="text-[10px] text-muted-foreground">Required for team on-call log</span>
            </label>
            <Input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Jira INFRA-829 database migration in staging until 04:00 UTC"
              className="text-xs font-mono"
            />
          </div>

          {/* Operator Tag */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground">
              Operator
            </label>
            <Input
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="amber"
              size="sm"
              disabled={isSubmitting}
              className="gap-1.5 font-bold"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Creating..." : "Arm Suppression Rule"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
