import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors focus:outline-none focus:ring-1 focus:ring-ring select-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive dark:text-rose-300 dark:bg-destructive/15 hover:bg-destructive/20",
        outline: "text-foreground border-border",
        cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 dark:bg-cyan-500/15",
        emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/15",
        amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:bg-amber-500/15",
        purple: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 dark:bg-purple-500/15",
        rose: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 dark:bg-rose-500/15",
        muted: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
