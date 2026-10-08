import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  isValidWorldSnapshot,
  migrateBoatStateToHarbor,
  repairLegacyArchipelagoLayoutPosition,
  repairLegacyOverworldShorePosition,
  repairLegacyVillageGateAccess,
  type WorldSnapshot,
} from "./worldSnapshot";
import { isVisitorMode } from "./worldSession";
import {
  cancelPendingHostSave,
  flushPendingHostSave,
  registerWorldPersistHandler,
  resumeHostPersist,
  scheduleHostSave,
  suspendHostPersist,
  isHostPersistSuspended,
} from "./worldSaveSchedule";
import { STARTING_ZONE_ID } from "./zones";
import type { ZoneId } from "./zoneTypes";
import { persistablePosition } from "../companions/abilities";
import { clearWalkedMemory } from "../ui/walkHint";

const STORAGE_KEY = "ivyward-save-v1";
/** Pre-rename key; migrate on read so existing host saves are not lost. */
const LEGACY_STORAGE_KEY = "poke-save-v1";
/** Raw payload of the last save that could not be repaired (#190). */
const BACKUP_STORAGE_KEY = "ivyward-save-v1-backup";

const DEFAULT_HOST_POSITION: WorldSnapshot["position"] = {
  zoneId: STARTING_ZONE_ID,
  x: 3,
  y: 7,
};

let hostPosition: WorldSnapshot["position"] = { ...DEFAULT_HOST_POSITION };

function readRawSave(readOnly = false): string | null {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      return current;
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy || readOnly) {
      return legacy;
    }
    localStorage.setItem(STORAGE_KEY, legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacy;
  } catch {
    return null;
  }
}

export function updateHostPosition(zoneId: ZoneId, x: number, y: number): void {
  // Islet stands save as the ford shore (#367 rollback safety).
  hostPosition = { zoneId, ...persistablePosition(zoneId, x, y) };
  scheduleHostSave();
}

export function persistHostSave(): void {
  if (isVisitorMode() || isHostPersistSuspended()) {
    return;
  }
  try {
    const snapshot = exportWorldSnapshot(hostPosition);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ponytail: ignore quota/private-mode failures
  }
}

registerWorldPersistHandler(persistHostSave);

// Closing or backgrounding the tab must not drop the pending debounce window
// (#191). persistHostSave itself keeps visitor mode from ever writing.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingHostSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingHostSave();
    }
  });
}

/** Visitor / share-card sandboxes must never touch the host save (#368). */
export function isHostSaveLocked(): boolean {
  return isVisitorMode() || isHostPersistSuspended();
}

export function clearHostSave(): void {
  if (isHostSaveLocked()) {
    return;
  }
  // Cancel first so pagehide → flushPendingHostSave cannot rewrite after clear (#250).
  cancelPendingHostSave();
  clearWalkedMemory();
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Clear host save and reload a fresh game (same as ?new=1). */
export function resetHostGame(): void {
  if (isHostSaveLocked()) {
    return;
  }
  clearHostSave();
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  window.location.assign(url.toString());
}

/**
 * Position is the only structurally fragile snapshot field — map layout
 * changes have invalidated saved positions twice before (see the legacy
 * repair functions). The repair must be attributable to position alone: a
 * candidate replacing only the position must validate, otherwise the save is
 * quarantined instead (#190 fail-safe rule).
 */
function repairWithDefaultSpawn(parsed: unknown): WorldSnapshot | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  repairLegacyVillageGateAccess(parsed);
  const respawned = {
    ...(parsed as Record<string, unknown>),
    position: { ...DEFAULT_HOST_POSITION },
  };
  if (!isValidWorldSnapshot(respawned)) {
    return null;
  }
  if (respawned.sailing !== true) {
    return respawned;
  }
  // The land spawn cannot hold a mid-sail flag — the validator would accept
  // it and load a stuck sail-on-land state. Grounding a legitimate `true` is
  // coherence, not corruption-masking (wrong-typed sailing already failed the
  // position-only candidate above).
  const grounded = { ...respawned, sailing: false };
  return isValidWorldSnapshot(grounded) ? grounded : null;
}

/**
 * Move the raw payload to the backup key so it stays recoverable, then clear
 * the live keys. Under quota pressure the primary slot is freed first (the
 * payload is the same size); if the backup write still fails, the payload is
 * restored to the primary key rather than lost — the next load repeats the
 * same deterministic path.
 */
function quarantineRawSave(raw: string): void {
  try {
    localStorage.setItem(BACKUP_STORAGE_KEY, raw);
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(BACKUP_STORAGE_KEY, raw);
    } catch {
      try {
        localStorage.setItem(STORAGE_KEY, raw);
      } catch {
        // ponytail: storage wholly unwritable; nothing left to preserve
      }
      return;
    }
  }
  clearHostSave();
}

/**
 * `readOnly` (share-card sandbox, #368) skips every storage side effect:
 * no legacy-key migration, quarantine, or clear — a bad save just loads as null.
 */
export function loadHostSave(
  options: { readOnly?: boolean } = {},
): WorldSnapshot | null {
  const readOnly = options.readOnly === true;
  let raw: string | null = null;
  try {
    raw = readRawSave(readOnly);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    migrateBoatStateToHarbor(parsed);
    repairLegacyOverworldShorePosition(parsed);
    repairLegacyArchipelagoLayoutPosition(parsed);
    repairLegacyVillageGateAccess(parsed);
    if (isValidWorldSnapshot(parsed)) {
      return parsed;
    }
    const repaired = repairWithDefaultSpawn(parsed);
    if (repaired) {
      return repaired;
    }
    // Unrepairable: keep the raw payload recoverable instead of deleting it.
    if (!readOnly) {
      quarantineRawSave(raw);
    }
    return null;
  } catch {
    if (readOnly) {
      return null;
    }
    if (raw) {
      quarantineRawSave(raw);
    } else {
      clearHostSave();
    }
    return null;
  }
}

export function restoreHostSave(snapshot: WorldSnapshot): void {
  suspendHostPersist();
  applyWorldSnapshot(snapshot);
  hostPosition = { ...snapshot.position };
  resumeHostPersist();
}

export {
  notifyWorldChanged,
  resumeHostPersist,
  suspendHostPersist,
} from "./worldSaveSchedule";
