import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

const STATUS_CONFIG = {
  healthy: { label: "Healthy", icon: CheckCircle2, className: "text-signal-green" },
  processing: { label: "Processing", icon: Loader2, className: "text-signal-amber" },
  error: { label: "Error", icon: AlertCircle, className: "text-signal-red" },
};

export default function StatusBadge({ status, size = 14 }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.healthy;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${cfg.className}`}>
      <Icon size={size} className={status === "processing" ? "animate-spin" : ""} />
      {cfg.label}
    </span>
  );
}
