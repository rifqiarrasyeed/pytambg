import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground border-transparent",
      success: "bg-success/15 text-success border-success/30",
      warning: "bg-warning/15 text-warning border-warning/30",
      danger: "bg-destructive/15 text-destructive border-destructive/30",
      info: "bg-info/15 text-info border-info/30",
      outline: "text-foreground"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

