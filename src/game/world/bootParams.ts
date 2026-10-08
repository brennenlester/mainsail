import type { InviteParseResult } from "./invite";

/**
 * `?new=1` resets the host save, but never when the URL carries an invite
 * payload — a shared `?join=` link with `&new=1` appended must not wipe the
 * recipient's save (#189). Invalid invites already stop at the error screen.
 */
export function shouldResetHostSave(
  inviteStatus: InviteParseResult["status"],
  params: URLSearchParams,
): boolean {
  // A shared ?card= (#368) or ?trial= (#420) link with &new=1 appended must not wipe a save either.
  return inviteStatus === "absent" && params.has("new") && !params.has("card") && !params.has("trial");
}
