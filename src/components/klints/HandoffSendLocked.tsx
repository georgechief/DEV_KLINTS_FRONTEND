/**
 * PRD-HO-01 Step 10 — disabled Send / Send-all controls (HO-02 replaces).
 *
 * No onClick, no network, no success toast — disabled + honest title only.
 * Title lives on a wrapper because native tooltips do not fire on disabled buttons.
 */

import type { ReactNode } from "react";
import { HANDOFF_SEND_DISABLED_TITLE } from "@/lib/handoff";

export type HandoffSendLockedVariant = "header" | "inline" | "cta";

const VARIANT_CLASS: Record<HandoffSendLockedVariant, string> = {
  header:
    "inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-spark px-3 py-1.5 text-[12.5px] font-semibold text-white opacity-60",
  inline:
    "cursor-not-allowed rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium opacity-60",
  cta: "flow-cta locked !py-2.5 !text-[13px] cursor-not-allowed",
};

const WRAPPER_CLASS: Record<HandoffSendLockedVariant, string> = {
  header: "inline-flex",
  inline: "inline-flex",
  cta: "block mt-2",
};

export function HandoffSendLockedButton({
  variant,
  children,
  className,
  label = "Send",
  lockedTitle = HANDOFF_SEND_DISABLED_TITLE,
}: {
  variant: HandoffSendLockedVariant;
  children: ReactNode;
  className?: string;
  /** Short control name for aria-label (e.g. Send, Send all to instances). */
  label?: string;
  /** Override default HO-01 locked tooltip (e.g. Already activated). */
  lockedTitle?: string;
}) {
  const ariaLabel = `${label} — ${lockedTitle}`;

  return (
    <span
      className={WRAPPER_CLASS[variant]}
      title={lockedTitle}
      data-handoff-send-locked="true"
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={ariaLabel}
        className={[VARIANT_CLASS[variant], className].filter(Boolean).join(" ")}
      >
        {children}
      </button>
    </span>
  );
}
