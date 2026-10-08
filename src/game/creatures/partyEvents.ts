/** Window event for party changes made through DOM UI while the overworld is live (#388). */
export const PARTY_CHANGED_EVENT = "ivyward-party-changed";

export function notifyPartyChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PARTY_CHANGED_EVENT));
  }
}
