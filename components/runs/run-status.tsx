import { Badge, type Tone } from "@/components/ui/badge";

type StatusMeta = { tone: Tone; label: string; pulse: boolean };

const RUN_STATUS: Record<string, StatusMeta> = {
  pendiente: { tone: "warning", label: "Pendiente", pulse: false },
  corriendo: { tone: "running", label: "Corriendo", pulse: true },
  completado: { tone: "success", label: "Completado", pulse: false },
  fallido: { tone: "danger", label: "Fallido", pulse: false },
  cancelado: { tone: "neutral", label: "Cancelado", pulse: false },
};

const STEP_STATUS: Record<string, StatusMeta> = {
  pendiente: { tone: "warning", label: "Pendiente", pulse: false },
  corriendo: { tone: "running", label: "Corriendo", pulse: true },
  passed: { tone: "success", label: "Passed", pulse: false },
  failed: { tone: "danger", label: "Failed", pulse: false },
  skipped: { tone: "neutral", label: "Skipped", pulse: false },
};

export function runStatusMeta(status: string): StatusMeta {
  return RUN_STATUS[status] ?? { tone: "neutral", label: status, pulse: false };
}

export function stepStatusMeta(status: string): StatusMeta {
  return (
    STEP_STATUS[status] ?? { tone: "neutral", label: status, pulse: false }
  );
}

export function RunStatusBadge({
  status,
}: {
  status: string;
}): React.JSX.Element {
  const meta = runStatusMeta(status);
  return (
    <Badge tone={meta.tone} dot pulse={meta.pulse}>
      {meta.label}
    </Badge>
  );
}

export function StepStatusBadge({
  status,
}: {
  status: string;
}): React.JSX.Element {
  const meta = stepStatusMeta(status);
  return (
    <Badge tone={meta.tone} dot pulse={meta.pulse}>
      {meta.label}
    </Badge>
  );
}
