"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/card";
import { useProfile, currencySymbol } from "@/lib/profile";
import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function BudgetPacing({ data }: { data: any }) {
  const { profile } = useProfile();
  const sym = currencySymbol(profile?.currency);

  if (!data || data.budget == null) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground space-y-2">
          <p className="text-sm font-medium text-foreground/70">No monthly budget set.</p>
          <p className="text-xs">Set a discretionary budget in settings to unlock daily spend pacing.</p>
          <Link href="/settings" className="text-xs text-primary hover:underline mt-2">Go to Settings</Link>
        </div>
      </Card>
    );
  }

  const safeToday = data.safe_to_spend_today;
  const isOverPacing = safeToday < 0;
  
  const pctSpent = (data.total_discretionary / data.budget) * 100;
  // Target is how far through the month we are
  const targetPct = ((data.days_in_month - data.days_remaining) / data.days_in_month) * 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={cn("rounded-2xl border px-5 py-4 backdrop-blur min-w-0", isOverPacing ? "bg-red-500/10 border-red-500/30" : "bg-emerald-500/10 border-emerald-500/30")}>
          <div className="flex items-center gap-1.5 mb-1">
            {isOverPacing ? <ShieldAlert className="h-4 w-4 text-red-500" /> : <ShieldCheck className="h-4 w-4 text-emerald-500" />}
            <span className={cn("text-[10px] uppercase font-bold tracking-widest", isOverPacing ? "text-red-500" : "text-emerald-500")}>
              Safe to spend today
            </span>
          </div>
          <div className={cn("text-2xl sm:text-3xl font-bold tabular-nums tracking-tight truncate", isOverPacing ? "text-red-500" : "text-emerald-500")}>
            {sym}{Math.abs(Math.round(safeToday)).toLocaleString()}
            {isOverPacing && <span className="text-sm font-medium ml-1">over</span>}
          </div>
        </div>
        
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 backdrop-blur flex flex-col justify-center min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">Discretionary Spent</div>
          <div className="text-xl font-semibold tabular-nums truncate">{sym}{Math.round(data.total_discretionary).toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">of {sym}{Math.round(data.budget).toLocaleString()} limit</div>
        </div>
        
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 backdrop-blur flex flex-col justify-center min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">Fixed Expenses</div>
          <div className="text-xl font-semibold tabular-nums truncate">{sym}{Math.round(data.total_fixed).toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">rent, bills, etc.</div>
        </div>
        
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 backdrop-blur flex flex-col justify-center min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">Days Left</div>
          <div className="text-xl font-semibold tabular-nums truncate">{data.days_remaining}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">until reset</div>
        </div>
      </div>

      <Card className="p-4 sm:p-6 overflow-visible relative mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6">Pacing Bullet Graph</h3>
        
        <div className="relative h-6 w-full bg-secondary/50 rounded-full">
          {/* Actual spent bar */}
          <div 
            className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.2)]", pctSpent > targetPct ? "bg-red-500" : "bg-emerald-500")}
            style={{ width: `${Math.min(pctSpent, 100)}%` }}
          />
          
          {/* Target line (where we should be today) */}
          <div 
            className="absolute top-[-12px] bottom-[-12px] w-1 bg-foreground z-10 rounded-full flex flex-col items-center justify-start transition-all duration-1000"
            style={{ left: `calc(${targetPct}% - 2px)` }}
          >
            <div className="bg-foreground text-background text-[10px] font-bold px-1.5 py-0.5 rounded shadow absolute -top-6 whitespace-nowrap">
              Today Target
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center text-[10px] font-medium text-muted-foreground mt-3">
          <span>0%</span>
          <span>50%</span>
          <span>100% (Limit)</span>
        </div>
      </Card>
      
      {isOverPacing && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
          <p className="text-orange-500/90 leading-snug">
            <strong>Warning:</strong> You are pacing above your monthly budget. Try holding off on non-essential spending for a few days to recover your daily allowance!
          </p>
        </div>
      )}
    </div>
  );
}
