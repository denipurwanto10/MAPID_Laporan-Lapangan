import { Badge } from "../ui/badge";
import { STATUS_LABEL, type ReportStatus } from "../../types/report";
import { cn } from "../../lib/utils";

const CONFIG: Record<ReportStatus, { variant: "pending" | "approved" | "rejected"; dot: string }> = {
  pending: { variant: "pending", dot: "bg-pending-foreground" },
  approved: { variant: "approved", dot: "bg-approved-foreground" },
  rejected: { variant: "rejected", dot: "bg-rejected-foreground" },
};

export function StatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  const { variant, dot } = CONFIG[status];
  return (
    <Badge variant={variant} className={cn("gap-1.5 pr-3 pl-2.5", className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
