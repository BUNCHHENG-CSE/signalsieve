"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Keyboard, X } from "lucide-react";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: "j / ↓", desc: "Select next incident cluster in triage queue" },
    { key: "k / ↑", desc: "Select previous incident cluster in triage queue" },
    { key: "Enter / Space", desc: "Open selected incident cluster detail drawer" },
    { key: "Escape", desc: "Close open drawer or modal" },
    { key: "a", desc: "Acknowledge currently focused incident cluster" },
    { key: "r", desc: "Resolve currently focused incident cluster" },
    { key: "s", desc: "Arm 24h suppression rule for focused incident" },
    { key: "/", desc: "Focus search bar" },
    { key: "?", desc: "Toggle this keyboard shortcuts cheat sheet" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono animate-in fade-in duration-150">
      <div className="relative flex flex-col w-full max-w-md rounded-lg border border-border bg-card text-card-foreground shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-foreground">
              Triage Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Fast keyboard triage enables on-call engineers to manage alert storms without touching the mouse.
          </p>

          <div className="divide-y divide-border/40 rounded-md border border-border/60 bg-secondary/20">
            {shortcuts.map((sc) => (
              <div
                key={sc.key}
                className="flex items-center justify-between p-2.5 text-xs"
              >
                <span className="text-muted-foreground">{sc.desc}</span>
                <kbd className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300 shadow-sm">
                  {sc.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border bg-secondary/30 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Got It
          </Button>
        </div>
      </div>
    </div>
  );
}
