import type { FolkloreType } from "../creatures/folkloreTypes";
import type {
  CreatureDefinition,
  MoveDefinition,
  MoveRole,
  StatusId,
} from "../creatures/types";

export const KIT_ROLES: readonly MoveRole[] = [
  "attack",
  "guard",
  "status",
  "finisher",
];

/** Default cooldowns per role (own turns unavailable after use). */
export const ROLE_COOLDOWN: Readonly<Record<MoveRole, number>> = {
  attack: 0,
  guard: 2,
  status: 2,
  finisher: 3,
};

/**
 * Guard is a read, not a free action (#378): it only braces a plain hit, but
 * parries a telegraphed finisher, and a parry heals the guard user by its
 * guard move's `heal`. Guarding blindly costs tempo; guarding the finisher
 * is the skill swing.
 */
export const GUARD_DAMAGE_TAKEN = 0.8;
/** Guard vs a finisher (or any sovereign beat): the parry lets this share through. */
export const GUARD_FINISHER_DAMAGE_TAKEN = 0.4;
/**
 * Every finisher hits this much harder than its listed power suggests, so a
 * telegraphed finisher is worth guarding and a landed one swings the spar.
 */
export const FINISHER_DAMAGE_MULT = 1.3;
/** Finisher bonus against a creature already carrying a status. */
export const FINISHER_STATUS_BONUS = 1.5;
/** Derived finishers hit a little harder than the species' best nuke. */
export const DERIVED_FINISHER_POWER_BONUS = 2;
export const DERIVED_GUARD_HEAL = 0.05;
export const DERIVED_STATUS_POWER = 3;
export const DERIVED_STATUS_ACCURACY = 90;

/** Each type's signature status (also used by derived kits). */
export const TYPE_STATUS: Readonly<Record<FolkloreType, StatusId>> = {
  woodland: "rooted",
  earth: "rooted",
  ember: "burn",
  hearth: "burn",
  "will-o-wisp": "burn",
  water: "soaked",
  fen: "soaked",
  storm: "dazed",
  mist: "dazed",
  twilight: "dazed",
};

const TYPE_GUARD_NAME: Readonly<Record<FolkloreType, string>> = {
  woodland: "Bark Skin",
  earth: "Hunker",
  ember: "Cinder Shell",
  hearth: "Warm Glow",
  "will-o-wisp": "Fade",
  water: "Still Pool",
  fen: "Bog Hide",
  storm: "Updraft",
  mist: "Veil Up",
  twilight: "Dusk Cloak",
};

const TYPE_STATUS_MOVE_NAME: Readonly<Record<FolkloreType, string>> = {
  woodland: "Snare Vine",
  earth: "Pin Down",
  ember: "Singe",
  hearth: "Singe",
  "will-o-wisp": "Witchfire",
  water: "Splash",
  fen: "Bog Splash",
  storm: "Static",
  mist: "Haze Out",
  twilight: "Dazzle",
};

export function moveRole(move: MoveDefinition): MoveRole {
  return move.role ?? "attack";
}

export function moveCooldown(move: MoveDefinition): number {
  return move.cooldown ?? (move.role ? ROLE_COOLDOWN[move.role] : 0);
}

/** True when the moves already cover all four roles (authored kit). */
export function isFullKit(moves: readonly MoveDefinition[]): boolean {
  return KIT_ROLES.every((role) => moves.some((m) => m.role === role));
}

/**
 * Sane 4-slot kit for creatures without an authored one: most reliable move
 * becomes the attack, the hardest hitter the finisher, plus a type-flavored
 * guard and status move. Move ids of kept moves are preserved so signature
 * damage-buff traits still match.
 */
export function deriveKit(
  def: Pick<CreatureDefinition, "id" | "folkloreType" | "moves">,
): MoveDefinition[] {
  const type = def.folkloreType;
  const moves = def.moves;
  const attackSource =
    [...moves].sort(
      (a, b) => b.accuracy - a.accuracy || a.power - b.power,
    )[0] ?? { id: `${def.id}-strike`, name: "Strike", power: 5, type, accuracy: 100 };
  const finisherPool = moves.filter((m) => m.id !== attackSource.id);
  const finisherSource =
    [...(finisherPool.length > 0 ? finisherPool : [attackSource])].sort(
      (a, b) => b.power - a.power,
    )[0];

  const attack: MoveDefinition = {
    ...attackSource,
    role: "attack",
    cooldown: ROLE_COOLDOWN.attack,
  };
  const finisher: MoveDefinition = {
    ...finisherSource,
    id:
      finisherSource.id === attackSource.id
        ? `${finisherSource.id}-finisher`
        : finisherSource.id,
    power: finisherSource.power + DERIVED_FINISHER_POWER_BONUS,
    role: "finisher",
    cooldown: ROLE_COOLDOWN.finisher,
  };
  const guard: MoveDefinition = {
    id: `guard-${type}`,
    name: TYPE_GUARD_NAME[type],
    power: 0,
    type,
    accuracy: 100,
    role: "guard",
    cooldown: ROLE_COOLDOWN.guard,
    heal: DERIVED_GUARD_HEAL,
  };
  const status: MoveDefinition = {
    id: `status-${type}`,
    name: TYPE_STATUS_MOVE_NAME[type],
    power: DERIVED_STATUS_POWER,
    type,
    accuracy: DERIVED_STATUS_ACCURACY,
    role: "status",
    cooldown: ROLE_COOLDOWN.status,
    inflicts: TYPE_STATUS[type],
  };
  return [attack, guard, status, finisher];
}

/** Battle kit for a species: authored if the catalog has all four roles, else derived. */
export function getBattleKit(
  def: Pick<CreatureDefinition, "id" | "folkloreType" | "moves">,
): MoveDefinition[] {
  return isFullKit(def.moves) ? [...def.moves] : deriveKit(def);
}
