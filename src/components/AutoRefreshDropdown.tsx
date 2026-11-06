"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Clock, RefreshCw, Zap } from "lucide-react";

export interface AutoRefreshDropdownProps {
  autoRefreshSecs: number;
  onSelectSecs: (secs: number) => void;
  countdown: number;
  onManualRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

interface RefreshOption {
  value: number;
  label: string;
  desc: string;
  badge: string;
  badgeClass: string;
}

const REFRESH_OPTIONS: RefreshOption[] = [
  {
    value: 0,
    label: "Off",
    desc: "Manual refresh only",
    badge: "Manual",
    badgeClass: "bg-muted/50 text-muted-foreground border-border",
  },
  {
    value: 5,
    label: "5 seconds",
    desc: "Aggressive live incident stream",
    badge: "Fast",
    badgeClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  },
  {
    value: 10,
    label: "10 seconds",
    desc: "Recommended polling balance",
    badge: "Optimal",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  {
    value: 30,
    label: "30 seconds",
    desc: "Low overhead telemetry polling",
    badge: "Relaxed",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  {
    value: 60,
    label: "60 seconds",
    desc: "Background audit & overview",
    badge: "Eco",
    badgeClass: "bg-secondary text-secondary-foreground border-border",
  },
];

export function AutoRefreshDropdown({
  autoRefreshSecs,
  onSelectSecs,
  countdown,
  onManualRefresh,
  isRefreshing = false,
}: AutoRefreshDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [manualSpinning, setManualSpinning] = useState(false);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const currentOption =
    REFRESH_OPTIONS.find((opt) => opt.value === autoRefreshSecs) ||
    REFRESH_OPTIONS[0];

  const handleManualClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onManualRefresh) {
      setManualSpinning(true);
      try {
        await onManualRefresh();
      } finally {
        setTimeout(() => setManualSpinning(false), 500);
      }
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`group flex items-center gap-1.5 h-7 rounded-md border px-2 py-1 text-[11px] font-mono transition-all select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring ${
          isOpen
            ? "border-primary/50 bg-secondary/80 text-foreground ring-1 ring-primary/20"
            : "border-border bg-secondary/30 hover:bg-secondary/60 text-foreground"
        }`}
        title={`Auto-Refresh: ${autoRefreshSecs === 0 ? "Off" : `${autoRefreshSecs}s`} (Click to configure)`}
      >
        {/* Pulsing Status Dot */}
        <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
          {autoRefreshSecs > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full transition-colors ${
              autoRefreshSecs > 0
                ? "bg-emerald-400 shadow-sm shadow-emerald-500/50"
                : "bg-muted-foreground/50"
            }`}
          />
        </span>

        {/* Label */}
        <span className="text-muted-foreground text-[10px] uppercase font-semibold">
          Auto:
        </span>
        <span className="font-semibold text-foreground">
          {autoRefreshSecs === 0 ? "Off" : `${autoRefreshSecs}s`}
        </span>

        {/* Live Countdown Badge when active */}
        {autoRefreshSecs > 0 && (
          <span className="flex items-center text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-1 py-0.2 rounded leading-none">
            {countdown}s
          </span>
        )}

        {/* Animated Chevron */}
        <ChevronDown
          className={`h-3 w-3 text-muted-foreground transition-transform duration-200 group-hover:text-foreground shrink-0 ${
            isOpen ? "rotate-180 text-foreground" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 mt-1.5 w-60 z-50 rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl p-1.5 font-mono text-xs text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-primary/70" />
              Auto-Refresh Rate
            </span>
            {autoRefreshSecs > 0 ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active ({countdown}s)
              </span>
            ) : (
              <span className="text-muted-foreground">Manual</span>
            )}
          </div>

          {/* Options List */}
          <div className="py-1 space-y-0.5">
            {REFRESH_OPTIONS.map((opt) => {
              const isSelected = autoRefreshSecs === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onSelectSecs(opt.value);
                    setIsOpen(false);
                  }}
                  role="option"
                  aria-selected={isSelected}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary/10 text-primary border border-primary/25 shadow-xs"
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-3.5 h-3.5 flex items-center justify-center shrink-0 ${
                        isSelected ? "text-primary" : "text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs ${
                            isSelected
                              ? "font-bold text-foreground"
                              : "text-foreground/90"
                          }`}
                        >
                          {opt.label}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {opt.desc}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 ml-2 text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider border ${opt.badgeClass}`}
                  >
                    {opt.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Manual Refresh Action */}
          {onManualRefresh && (
            <div className="pt-1 mt-1 border-t border-border/50">
              <button
                type="button"
                onClick={handleManualClick}
                disabled={isRefreshing || manualSpinning}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`h-3 w-3 ${
                    isRefreshing || manualSpinning
                      ? "animate-spin text-cyan-400"
                      : "text-muted-foreground"
                  }`}
                />
                <span>
                  {isRefreshing || manualSpinning
                    ? "Refreshing Telemetry..."
                    : "Refresh Data Now"}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
