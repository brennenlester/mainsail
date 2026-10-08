# Ivyward / Mainsail

Domain language for the folklore RPG. Glossary only — no implementation detail.

## Product stance

**Spine**:
The single core loop the game is allowed to optimize for. Other systems are satellites until the spine is delightful.
_Avoid_: Feature set, content checklist, “the full game”

**Hybrid session**:
A play session that pays off in about twenty minutes and can optionally chain into a longer sit-down without requiring it.
_Avoid_: Hour-plus RPG session (as the default promise), three-minute casual drop-in

**Spine cut**:
A refocus move that demotes or freezes non-spine systems so effort goes into making the spine easy to enjoy, with light polish for friction on what remains.
_Avoid_: Breadth-first feature build, fantasy rewrite (unless later decided)

## Fantasy

**Companionship**:
The feeling that folklore creatures are yours — quirky, kept, and present in play — not merely collected IDs.
_Avoid_: Catch-'em-all completionism (as the primary pitch), pet simulation

**Shrine craft**:
Ritual growth at the Moon Shrine through gathering and pattern craft — the tangible “I grew something sacred” fantasy. **Means**, not the emotional end: it exists to make Companions thrive, evolve, or feel more yours.
_Avoid_: Generic inventory crafting, tech tree, idle upgrade sheet, shrine-as-primary-endgame

**Braid**:
Companionship is the end; Shrine craft is the means. Creatures are not loot bags for the shrine.
_Avoid_: Dual co-equal fantasies, power + discovery as twin headlines

## Challenge

**Soft overworld, sharp spars**:
Exploring and crafting stay forgiving and readable. Spars are where attention and skill are asked for. Failures should stay cheap enough for a Hybrid session.
_Avoid_: Punishing exploration, hardcore craft failure, always-on difficulty

## Session receipt

**Session set**:
A short session is complete when the player gets both: (1) companion progress via sparring *with* companions present, and (2) at least one craft or shrine step. The expected shape is two tiny beats — overworld outing, then a shrine pit stop — not one fused moment.
_Avoid_: Discovery-only receipt; requiring a full befriend every session; material pickup alone as craft progress

## Core loop

**Spine loop**:
Walk → encounter (befriend and/or spar) → bring payoff to shrine craft → companion feels more yours → unlock a little more walk.
_Avoid_: Craft-first as the default spine; companion-menu-first as the default spine

**Spar role**:
Spars primarily feed Shrine craft (materials and preparation). Mastery is gated more by prep than by pure mechanical execution.
_Avoid_: Spars as pure relationship theater; spars as map locks only

**More yours** (post-craft payoff priority):
After successful shrine craft, companion ownership should read in this order of preference: (1) Growth unlock, (2) Bond meter tick, (3) Party identity in the overworld, (4) Care buff, (5) Soft narrative beat. Prefer earlier items when building; later items are fallback seasoning.
_Avoid_: Care buff as the only signal; narrative-only ownership

**Growth unlock**:
The primary ownership signal. Two recipe kinds both count: (1) evolution / stage change, (2) cosmetic / presence only (how they look and inhabit the overworld). Moves and quirks are not the primary signal.
_Avoid_: Move/quirk as the main Growth unlock; Bond meter as the first-built signal; treating only evolutions as “real” growth

## Scope cut

**In spine** (active polish):
Overworld walk and encounters; befriend (on-ramp); spars with party present; gather nodes that feed craft; Moon Shrine pattern craft and growth.

**Maintain** (fix breakages only):
Portable Moonshrine; Habitat Codex / Codex Keeper; party size / reserve complexity (simplify later only if the spine needs it).

**Freeze** (no new work until spine is delightful):
Village cottages and NPC asks; cottage minigames (Ward / Loom / Hearth Lots); harbor / boat / Archipelago sailing depth (keep reachable if shipped; do not deepen); Sovereign fusion endgame; host invite / visitor snapshot.

**Spine-quality**:
Campaign catalog bar: each remaining species has a distinct fantasy — clear personality plus at least one unique Growth unlock. Readable-only is too thin; bespoke unique moves/craft-hooks/presence per species is too expensive.
_Avoid_: Floor readability as “done”; full bespoke depth per species

**Archipelago cut permission**:
Archipelago-only creatures may be dropped from the campaign catalog if that is what it takes to hit Spine-quality. Sailing depth stays frozen; this is a creature-list cut, not an island-feature build.
_Avoid_: Using this permission to deepen sailing or islands

**Two-level done**:
Campaign done: feel gate plus Spine-quality polish on the remaining wild catalog and most recipes, with satellites still frozen. Next ship is not that bar — it is a thin vertical (see First milestone).
_Avoid_: Claiming the refocus is finished after the first milestone; building satellites to reach the catalog bar

**First milestone**:
Feel gate, plus about 6–8 companions and 5–7 recipes wired into Growth unlock, enough to prove the spine. Those recipes include at least one evolution kind and one presence/cosmetic kind.
_Avoid_: Full-catalog polish as the first ship; proving only evolutions or only cosmetics

**Satellites stay visible**:
Frozen systems remain reachable in the build. Do not invest in them. Pitch and FTUE soft-ignore them rather than hiding or stripping.
_Avoid_: Excising frozen content from the client as part of this refocus

**Pitch**:
“A folklore RPG where you spar with your odd little party, craft at the Moon Shrine to help them grow, and wander a soft world between sharper fights.”
_Avoid_: Power + discovery twin headline; social-hosting-first pitch

**More yours delivery**:
Ship Growth unlock first as the ownership signal. Add a Bond meter only if ownership still doesn’t read after Growth unlock is in. (Done in order: Growth unlock shipped first; bond followed in the Wow Pass, #367.)
_Avoid_: Building bond + growth systems in parallel up front

**FTUE timing**:
Do not reshape the existing story 1–4 on-ramp until First milestone systems (Session set + Growth unlock on 6–8 companions / 5–7 recipes) exist.
_Avoid_: FTUE rewrite as the first implementation task
