"use client";

import React, { useState } from "react";
import { AlertCluster } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShieldOff, Clock, AlertTriangle, X } from "lucide-react";

interface SuppressModalProps {
  cluster: AlertCluster | null;
  onClose: () => void;
  onConfirm: (data: {
    name: string;
    pattern_signature: string;
    reason: string;
    created_by: string;
    durationHours: number;
    clusterId?: string;
  }) => Promise<void>;
}

const QUICK_REASONS = [
  "Known partner maintenance window — non-actionable for on-call",
  "Flapping staging/batch monitor threshold — tracked in backlog ticket",
  "Expected deployment migration artifact — safe to mute for 24h",
  "False positive signature verified by SecOps — awaiting upstream config fix",
];

export function SuppressModal({ cluster, onClose, onConfirm }: SuppressModalProps) {
  const [reason, setReason] = useState(QUICK_REASONS[0]);
  const [createdBy, setCreatedBy] = useState("alex@leanops.io (On-Call SRE)");
  const [durationHours, setDurationHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!cluster) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please enter a reason for the suppression audit log.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({
        name: cluster.title,
        pattern_signature: cluster.pattern_signature,
        reason: reason.trim(),
        created_by: createdBy.trim() || "oncall@leanops.io",
        durationHours,
        clusterId: cluster.id,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to create suppression rule");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card text-card-foreground shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-background/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <ShieldOff className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Suppress Pattern for 24 Hours
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Audited temporary silence for on-call handoff
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {/* Target Cluster Card */}
          <div className="rounded border border-border bg-background p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Target Cluster:</span>
              <Badge variant="amber" className="text-[9px] py-0">
                {cluster.alert_count} alerts correlated
              </Badge>
            </div>
            <p className="text-xs font-bold text-foreground">{cluster.title}</p>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[10px] text-muted-foreground">Pattern:</span>
              <code className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-primary">
                {cluster.pattern_signature}
              </code>
            </div>
          </div>

          {/* Quick Select Preset Reasons */}
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
              Quick-Select Reason Preset
            </label>
            <div className="grid grid-cols-1 gap-1">
              {QUICK_REASONS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`text-left text-[11px] px-2.5 py-1.5 rounded border transition-all ${
                    reason === preset
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-200 font-semibold"
                      : "border-border bg-background/50 text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Reason Log Input */}
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
              Audit Reason Log <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this pattern is being silenced..."
              className="w-full rounded border border-input bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          {/* Duration & Operator */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Duration (Auto-Expires)
              </label>
              <select
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="w-full rounded border border-input bg-background p-1.5 text-xs text-foreground focus:outline-none"
              >
                <option value={24}>24 Hours (Default Shift)</option>
                <option value={12}>12 Hours</option>
                <option value={4}>4 Hours</option>
                <option value={72}>72 Hours (Weekend)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Logged By (On-Call)
              </label>
              <Input
                type="text"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="amber"
              size="sm"
              disabled={submitting}
              className="font-bold"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>{submitting ? "Suppressing..." : `Suppress for ${durationHours}h`}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
