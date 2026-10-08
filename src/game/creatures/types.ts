import type { FolkloreType } from "./folkloreTypes";
import type { CreatureTrait } from "./traits";

/** Battle kit slot. Missing role = plain attack (legacy / wanderer / shrine moves). */
export type MoveRole = "attack" | "guard" | "status" | "finisher";

export type StatusId = "burn" | "soaked" | "rooted" | "dazed";

export type MoveDefinition = {
  id: string;
  name: string;
  power: number;
  /** Battle type — must match creature type except shrine dual moves. */
  type: FolkloreType;
  /** Hit chance 0–100. Chip ~90–100; nukes ~70–80. */
  accuracy: number;
  role?: MoveRole;
  /** Own turns the move stays unavailable after use (0 / missing = always ready). */
  cooldown?: number;
  /** Status applied on hit (status role). */
  inflicts?: StatusId;
  /** Guard: fraction of max HP restored on use. */
  heal?: number;
};

export type StatusInstance = { id: StatusId; turns: number };

export type CreatureDefinition = {
  id: string;
  name: string;
  folkloreType: FolkloreType;
  maxHp: number;
  attack: number;
  defense: number;
  spriteKey: string;
  spriteColor: number;
  moves: MoveDefinition[];
  /** Early-region creature obtainable before overworld. */
  early: boolean;
  /** Secret creature omitted from habitat discovery and the codex. */
  excludeFromCodex?: boolean;
};

export type CreatureInstance = {
  instanceId: string;
  definitionId: string;
  /** Original befriended species; unchanged by evolution. */
  speciesId: string;
  currentHp: number;
  nickname?: string;
  level: number;
  xp: number;
  /** Bonus max HP from shrine health buffs. */
  hpBonus?: number;
  /** Bonus attack from shrine attack buffs. */
  attackBonus?: number;
  /** Secondary elemental type from shrine attack buff. */
  secondaryElement?: FolkloreType;
  /** Extra move granted by shrine attack buff (may be 5th move). */
  secondaryMove?: MoveDefinition;
  /** Applied shrine effect keys (creatureId:itemId). */
  appliedEffects?: string[];
  /** Rolled signature trait (immunity or damage-buff). */
  trait?: CreatureTrait;
};

export type BattleCombatant = {
  name: string;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  /** Defender contributes no defense and receives neutral matchup damage. */
  defenseDisabled?: boolean;
  moves: MoveDefinition[];
  folkloreType: FolkloreType;
  /** Rolled immunity trait target (move type that deals 0). */
  immunityTo?: FolkloreType;
  /** Signature damage-buff, if any. */
  damageBuff?: { moveId: string; multiplier: number };
  /** Battle-only state (never saved). */
  statuses?: StatusInstance[];
  /** moveId -> own turns until ready. */
  cooldowns?: Record<string, number>;
  /** Guard up: the next incoming hit is reduced. */
  guarding?: boolean;
};
