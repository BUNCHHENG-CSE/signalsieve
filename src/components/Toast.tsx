"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  text: string;
  type?: "success" | "error" | "warning" | "info";
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none font-mono">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const typeConfig = {
    success: {
      border: "border-emerald-500/40",
      bg: "bg-emerald-950/90 text-emerald-200",
      icon: CheckCircle2,
      iconColor: "text-emerald-400",
    },
    error: {
      border: "border-rose-500/40",
      bg: "bg-rose-950/90 text-rose-200",
      icon: AlertCircle,
      iconColor: "text-rose-400",
    },
    warning: {
      border: "border-amber-500/40",
      bg: "bg-amber-950/90 text-amber-200",
      icon: AlertTriangle,
      iconColor: "text-amber-400",
    },
    info: {
      border: "border-cyan-500/40",
      bg: "bg-cyan-950/90 text-cyan-200",
      icon: Info,
      iconColor: "text-cyan-400",
    },
  }[toast.type || "info"];

  const Icon = typeConfig.icon;

  return (
    <div
      className={`pointer-events-auto flex items-center justify-between gap-3 rounded-lg border ${typeConfig.border} ${typeConfig.bg} p-3 shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200 text-xs`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={`h-4 w-4 shrink-0 ${typeConfig.iconColor}`} />
        <span className="leading-snug">{toast.text}</span>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="rounded p-0.5 opacity-70 hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
