"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  chips?: React.ReactNode;
};

export function PageHeader({ title, subtitle, icon: Icon, actions, chips }: PageHeaderProps) {
  return (
    <motion.section
      className="panel page-header"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="panel-header">
        <div className="page-title-wrap">
          <div className="page-title-row">
            {Icon ? <Icon size={20} className="page-title-icon" /> : null}
            <h1>{title}</h1>
          </div>
          {subtitle ? <p>{subtitle}</p> : null}
          {chips ? <div className="header-chips">{chips}</div> : null}
        </div>
        <div className="page-actions">{actions}</div>
      </div>
    </motion.section>
  );
}

