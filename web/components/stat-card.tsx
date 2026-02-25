"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
};

export function StatCard({ label, value, icon: Icon, hint }: StatCardProps) {
  return (
    <motion.article className="metric-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div className="metric-head">
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </motion.article>
  );
}

