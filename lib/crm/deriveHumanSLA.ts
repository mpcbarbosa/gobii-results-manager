/**
 * Human SLA Derivation
 *
 * Computes how long since the last human (non-SYSTEM) activity on a lead.
 * Falls back to lead.createdAt if no human activity exists.
 *
 * ⚠️ Not persisted — derived at query time.
 *
 * @module lib/crm/deriveHumanSLA
 */

export type SLAStatus = "OK" | "WARNING" | "OVERDUE";

export interface HumanSLA {
  status: SLAStatus;
  hoursElapsed: number;
  /** Human-readable label */
  label: string;
  /** Reference date used for calculation */
  referenceDate: Date;
}

/** Thresholds in hours */
const WARNING_HOURS = 48;
const OVERDUE_HOURS = 5 * 24; // 5 days

/**
 * Derive the human SLA status for a lead.
 *
 * | Status   | Condition       |
 * |----------|-----------------|
 * | 🟢 OK      | < 48h           |
 * | 🟡 WARNING | 48h – 5 days    |
 * | 🔴 OVERDUE | > 5 days        |
 *
 * @param lastHumanActivityAt - Last non-SYSTEM activity timestamp
 * @param createdAt - Lead creation date (fallback)
 * @param now - Current time (injectable for testing)
 */
export function deriveHumanSLA(
  lastHumanActivityAt: Date | string | null,
  createdAt: Date | string,
  now: Date = new Date(),
): HumanSLA {
  const referenceDate = lastHumanActivityAt
    ? new Date(lastHumanActivityAt)
    : new Date(createdAt);

  const elapsed = now.getTime() - referenceDate.getTime();
  const hoursElapsed = Math.max(0, elapsed / (1000 * 60 * 60));

  let status: SLAStatus;
  let label: string;

  if (hoursElapsed < WARNING_HOURS) {
    status = "OK";
    if (hoursElapsed < 1) {
      label = "< 1h";
    } else if (hoursElapsed < 24) {
      label = `${Math.round(hoursElapsed)}h`;
    } else {
      label = `${Math.round(hoursElapsed / 24)}d`;
    }
  } else if (hoursElapsed < OVERDUE_HOURS) {
    status = "WARNING";
    label = `${Math.round(hoursElapsed / 24)}d`;
  } else {
    status = "OVERDUE";
    const days = Math.round(hoursElapsed / 24);
    label = `${days}d`;
  }

  return { status, hoursElapsed, label, referenceDate };
}
