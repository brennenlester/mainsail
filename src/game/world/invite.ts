import { getHostLabel, isVisitorMode } from "./worldSession";
import { persistablePosition } from "../companions/abilities";
import type { WorldSnapshot } from "./worldSnapshot";
import { HARBOR_PIER } from "./dockBoat";
import {
  exportWorldSnapshot,
  isValidWorldSnapshot,
  migrateBoatStateToHarbor,
  repairLegacyArchipelagoLayoutPosition,
  repairLegacyOverworldShorePosition,
  repairLegacyVillageGateAccess,
} from "./worldSnapshot";
import type { ZoneId } from "./zoneTypes";

/** Visitors cannot sail or leave islands alone; land them on the Harbor pier. */
export function normalizeInviteSailingSnapshot(snapshot: WorldSnapshot): void {
  const onArchipelago = snapshot.position.zoneId === "archipelago";
  if (snapshot.sailing !== true && !onArchipelago) {
    return;
  }
  snapshot.sailing = false;
  snapshot.position = {
    zoneId: "harbor",
    x: HARBOR_PIER.x,
    y: HARBOR_PIER.y,
  };
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildInviteUrl(
  zoneId: ZoneId,
  x: number,
  y: number,
): string {
  // Visitors can't ford back, so an islet stand invites them to the shore (#367).
  const snapshot = exportWorldSnapshot(
    { zoneId, ...persistablePosition(zoneId, x, y) },
    getHostLabel(),
  );
  normalizeInviteSailingSnapshot(snapshot);
  const encoded = toBase64Url(JSON.stringify(snapshot));
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("join", encoded);
  return url.toString();
}

export type InviteParseResult =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "ok"; snapshot: WorldSnapshot };

/** Distinguish missing vs broken `?join=` so callers can show an error screen. */
export function parseInviteParam(): InviteParseResult {
  const encoded = new URLSearchParams(window.location.search).get("join");
  if (encoded === null) {
    return { status: "absent" };
  }
  if (encoded.trim() === "") {
    return { status: "invalid" };
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encoded));
    migrateBoatStateToHarbor(parsed);
    repairLegacyOverworldShorePosition(parsed);
    repairLegacyArchipelagoLayoutPosition(parsed);
    repairLegacyVillageGateAccess(parsed);
    if (!isValidWorldSnapshot(parsed)) {
      return { status: "invalid" };
    }
    normalizeInviteSailingSnapshot(parsed);
    return { status: "ok", snapshot: parsed };
  } catch {
    return { status: "invalid" };
  }
}

export function parseInviteFromUrl(): WorldSnapshot | null {
  const result = parseInviteParam();
  return result.status === "ok" ? result.snapshot : null;
}

export function clearJoinParamAndReload(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  url.searchParams.delete("new");
  const query = url.searchParams.toString();
  window.location.replace(`${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
}

export async function copyInviteLink(
  zoneId: ZoneId,
  x: number,
  y: number,
): Promise<string> {
  const result = await shareOrCopyInviteLink(zoneId, x, y);
  if (result.status === "failed") {
    throw result.error instanceof Error
      ? result.error
      : new Error("Failed to share invite");
  }
  return result.url;
}

export type InviteShareResult =
  | { status: "copied"; url: string }
  | { status: "shared"; url: string }
  | { status: "manual"; url: string }
  | { status: "cancelled"; url: string }
  | { status: "failed"; url?: string; error: unknown };

/**
 * Host invite delivery for desktop + mobile:
 * clipboard → native share sheet → on-screen manual URL (never console-only).
 */
export async function shareOrCopyInviteLink(
  zoneId: ZoneId,
  x: number,
  y: number,
): Promise<InviteShareResult> {
  if (isVisitorMode()) {
    return {
      status: "failed",
      error: new Error("Visitors cannot create invite links"),
    };
  }

  const url = buildInviteUrl(zoneId, x, y);

  if (typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(url);
      return { status: "copied", url };
    } catch {
      // Fall through to share / manual — common on mobile Safari.
    }
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Ivyward invite", url, text: url });
      return { status: "shared", url };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { status: "cancelled", url };
      }
      // Fall through to manual URL.
    }
  }

  return { status: "manual", url };
}
