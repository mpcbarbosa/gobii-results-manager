/**
 * Lead Temperature Derivation
 *
 * Maps a commercial signal level to a human-friendly temperature label.
 * This is a pure, deterministic mapping — nothing is persisted.
 *
 * @module lib/crm/deriveLeadTemperature
 */

import type { SignalLevel } from "./deriveCommercialSignal";

export type LeadTemperature = "HOT" | "WARM" | "COLD";

const SIGNAL_TO_TEMPERATURE: Record<SignalLevel, LeadTemperature> = {
  HIGH: "HOT",
  MEDIUM: "WARM",
  LOW: "COLD",
};

/**
 * Derive the lead temperature from a signal level.
 *
 * | signalLevel | temperature |
 * |-------------|-------------|
 * | HIGH        | HOT         |
 * | MEDIUM      | WARM        |
 * | LOW         | COLD        |
 *
 * ⚠️ This value is **never** persisted in the database.
 */
export function deriveLeadTemperature(signalLevel: SignalLevel): LeadTemperature {
  return SIGNAL_TO_TEMPERATURE[signalLevel];
}
