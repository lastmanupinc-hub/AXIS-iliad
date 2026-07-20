import { useEffect, useRef, useState } from "react";

interface Props {
  label: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  /** Text shown on the confirm button once armed. Default: "Yes, delete". */
  confirmButtonLabel?: string;
  /** Text shown on the confirm button while `busy`. Default: "Deleting...". */
  busyLabel?: string;
  /** Text shown on the disarm button. Default: "Cancel". */
  cancelButtonLabel?: string;
  /** Red-outlined label button (the visual default for a delete/revoke
   *  action). Set false for a less alarming action like "cancel subscription". */
  destructive?: boolean;
  /** className for the unarmed label button. Default: "btn". */
  labelClassName?: string;
}

/**
 * Click once to arm, click again to confirm — avoids a native confirm()
 * dialog (untestable/unstyleable) while still requiring a deliberate second
 * action before an irreversible action fires.
 *
 * H-Phase-A bulk sweep: this was copy-pasted independently into VersionsTab.tsx,
 * ProjectsPage.tsx, SettingsPage.tsx, and UsagePage.tsx (each citing the others
 * as "the established pattern" while never actually sharing code) and had
 * already drifted — 3 of 4 copies gained a flexWrap fix the others lacked, and
 * the confirm/cancel/busy wording diverged per page (delete vs cancel-
 * subscription framing). Consolidated here with every page's real current
 * wording preserved via props, not silently unified into one generic copy.
 */
export function DangerButton({
  label,
  confirmLabel,
  busy,
  onConfirm,
  confirmButtonLabel = "Yes, delete",
  busyLabel = "Deleting...",
  cancelButtonLabel = "Cancel",
  destructive = true,
  labelClassName = "btn",
}: Props) {
  const [armed, setArmed] = useState(false);
  const labelRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasArmed = useRef(false);

  // The confirm step replaces this control's whole subtree, which unmounts
  // whatever was just clicked and silently drops keyboard focus to <body>.
  // Move focus to the safer default (Cancel, not the destructive action)
  // on arm, and back to the label button when disarmed.
  useEffect(() => {
    if (armed && !wasArmed.current) cancelRef.current?.focus();
    if (!armed && wasArmed.current) labelRef.current?.focus();
    wasArmed.current = armed;
  }, [armed]);

  if (!armed) {
    return (
      <button
        ref={labelRef}
        type="button"
        className={labelClassName}
        style={destructive ? { color: "var(--red)", borderColor: "var(--red)" } : undefined}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="text-muted text-sm">{confirmLabel}</span>
      <button type="button" className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} disabled={busy} onClick={onConfirm}>
        {busy ? busyLabel : confirmButtonLabel}
      </button>
      <button ref={cancelRef} type="button" className="btn" disabled={busy} onClick={() => setArmed(false)}>{cancelButtonLabel}</button>
    </span>
  );
}
