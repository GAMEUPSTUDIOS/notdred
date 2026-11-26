# Porting the game rules to C++ (branch `cpp-core`)

Goal: one C++ game core, compiled natively for the server (`build/core.node`) and to WebAssembly for the page
(`dist/core.wasm`), replacing the JavaScript rules (`dist/game.js` simulation parts, `dist/modules/*.js`,
`server/room-runtime.js`, `server/zone-runtime.js`, `dist/zone-generator.js`). Rendering, UI and networking glue
stay in JavaScript. `main` keeps running the JavaScript server until the core passes the whole test suite.

## Build and data
- `node scripts/build-core.cjs` → `build/core.node`; `node scripts/build-core.cjs --wasm` → `dist/core.wasm`
  (needs wasi-sdk: `$WASI_SDK` or `/opt/wasi/wasi-sdk-*`; the .wasm is committed).
- `node tools/core-data.cjs` → `dist/core-data.json`: every tunable table, read from the running JavaScript game, so
  numbers keep one home (era.js / game.js). Both builds load it with `{op:'init',data}`.
- Loaders: `server/core.cjs` (native), `dist/core-wasm.js` (`loadCore(bytes|Response, data)`).

## Conventions
- Same names as the JavaScript functions, same order of operations, so a reader can hold the two side by side.
- `J` is `nlohmann::ordered_json` (keys keep insertion order like JavaScript objects).
- Strings that JavaScript measures or slices are handled as UTF-16 (`toU16`/`fromU16`), so lengths match.
  A lone surrogate (possible in JavaScript) becomes U+FFFD — the only intended difference.
- The WebAssembly build has no exceptions (`ND_NO_EXCEPTIONS`, `JSON_NOEXCEPTION`): `nd::fail` records an error,
  and `J::at`/`get<T>` on bad input aborts the module. So **never** use `at()`/`get<T>()` on client input — use
  `value()`/`find()`/type checks. Game data (core-data.json) is trusted.
- Randomness: the core has its own seeded generator (JavaScript used Math.random); tests compare rules, not dice.
- Physics: Box2D 2.4.1, as the server's native interiors already use. Planck (exteriors, queries) is a Box2D port,
  so parameters carry over; results match within tolerance, not bit for bit (body order differs).

## How each piece is checked
Each stage has a test that runs the same inputs through the JavaScript rules (in a room vm, `server/room.cjs`) and
both core builds, and compares results: exactly for rules, within stated tolerances for physics trajectories.

| Stage | Scope | Test | Status |
|---|---|---|---|
| 1 | build (native + wasm), data file, era.js rules | tests/core-rules.cjs | done |
| 2 | interior physics world, hull shell/skin, crew controller on foot (walk, jump, ladders, ice, walkways, wedges, nets) | tests/core-crew.cjs | done (identical to the mm); piloting/thrusters move to stage 7 with the exterior |
| 3 | crew inventory (slots, stacks, carried/addCarried/takeItem/giveItem/moveStack/refund), loose items (spawnItem, scatter, dropItem, pickupAt, mergeTouchingCargo, wakeCargoNear), expando boxes (spawnBox, boxSpace, resizeBox, boxInsert, useBox), commands select/drop/moveStack/dev give | tests/core-cargo.cjs | done (within 3 cm; hands, notices, counts and boxes exact) |
| 4 | loading saves (every migration in initialize), mounts (mountAt, mountValid, mountWidth, mountPoint, mountHit, inward), physics machines (spawnMachine, machineSpace, supportsMachine, machineOnTop, fabFits, syncMachines), spawn points, placement helpers | tests/core-ship-parts.cjs | done (exact; mount fixtures wait for the exterior, stage 7) |
| 5 | construction (construction.js: validity, buildAnchor, placementPoint, beginBuild/tickBuild/commitBuild, removeAt, rotateSelection, resizeCut; game.js edit/interact/takeHelm/recover; pickupAt, useBox, turret ammo load/eject, turret controllers) | tests/core-build.cjs | done (edit's branches for later systems are marked TODO and do nothing) |
| 5b | machinery (fabricators, loaders, pushers and the handheld pusher, recyclers, shredders, repairs, thruster tanks, comms, hatch filters, door/spawn/sign/paint settings) | tests/core-machines.cjs | done (ejectors and hatches' zone side wait for the exterior) |
| 6a | zone generator (caves, pit, block) | tests/core-zonegen.cjs | done (bit for bit, every zone and seed) |
| 6m | JavaScript's Math functions (V8 12.4's fdlibm copied in as jsmath, V8's Math.hypot) | tests/core-jsmath.cjs | done (bit for bit, 2.4 million values) |
| 6 | zones (zone.h: rock cells and greedy chunk rectangles, mining, the Freeport harbour, portals and the mission portal, arrivals and berths, boulders, loot, treasure ranks) | tests/core-zones.cjs | done (exact, every zone; travelling, regeneration and the mission schedule go with the ship's exterior and the zone bus: stages 7 and 8) |
| 7 | combat (rounds, turrets, damage, shields, bots, PvP) and the shared zone sim (zone-runtime) | | |
| 8 | room orchestration (crew, ranks, commands), save codec (same format), snapshots (same wire format) | | |
| 9 | server on the core (all server tests pass), page prediction on the WebAssembly core | | |

## Where physics can't match bit for bit
The old server's native interiors created each Box2D body one tick late, in reverse order of creation (the bridge
walks planck's body list), and its fixtures and broadphase proxies in that order too. Where the outcome hangs on solver
order — bodies spawned overlapping, a box tipping on a corner — the core (which creates bodies at once, in order) can
settle differently. Those are chaotic either way; the tests keep to cases with one physical answer, and check exact
totals, counts and logic everywhere.

## Fixed in the JavaScript while porting (so both agree)
- A loose item squeezed inside a block was never rescued: the collision skin had already set the block's mask to 0,
  and the wedge check read the current mask. It reads the mask from before the skin now (safeguards.js).
- The last crew member stepped each tick lost ladder cooldown twice as fast (game.js step and serverCrewStep both
  counted it down).
- Only the last crew member stepped was held at the top of a ladder (clampToLadder ran once, in step); the others
  overshot the top rung.

## Not yet ported inside stage 2's files (marked TODO in the code)
- storage tiles (expando boxes) and physics machines are skipped when a ship is built: stages 4 and 5.
- doors open/close for nearby crew (doorOpen) and noclip flight: stage 5 / stage 8.

## Numbers as JavaScript computes them
- `Math.sin`, `cos`, `atan2`, `pow`, `hypot`… are `jsmath::` (V8's own code), never the C library's: zone rock kinds hash
  through `Math.sin`, and glibc's and musl's sin differ from V8's in the last bit for a few inputs in a hundred.
- Vectors follow planck: a length is `sqrt(x²+y²)` (not `Math.hypot`, which rounds differently), `normalize` multiplies
  by `1/length`, local and world points use the double transform (V8's sin/cos of the body angle). Positions read
  from Box2D are widened to doubles (`vv`) before any arithmetic, as the old rules read planck's doubles.
- Keys built from numbers use `jsNum` (String(number)); snapshot rounding uses `jsFixed` (+toFixed: halves up, where
  printf rounds exact halves to even). Replies write -0 as 0, as JSON.stringify does.
- Builds use `-ffp-contract=off` (no fused multiply-add), so x86, ARM and WebAssembly give the same doubles.
- Box2D computes body masses from fixtures in floats; the old bridge passed planck's double masses (rounded to floats).
  The difference is in the last float bit and only shows in chaotic cases (see above).

## Notes
- `extra` (a tile's JavaScript fields) is an insertion-ordered object stored in a vector: adding a key moves the
  others, so code that keeps a reference into it first makes every key it will touch (`ensure`). Fields are read
  with `val()` (core.h), never nlohmann's `value()`, which throws (or aborts the WebAssembly build) on a field of
  the wrong type.
- Physics machines keep their centre in doubles (`Tile::mpos`), as the planck bodies did; their Box2D body is only a
  marker (fixture-less, static).
- resizeCut reloads the ship from its own shifted save in a fresh world mid-tick (`reloadAfterResize`), as
  initialize did, so the rest of that tick runs on the new ship.

## The exterior (stage 7 design)
Today each JavaScript room keeps its own planck copy of the outside (`world`: rock chunks, Freeport walls and docks,
the hull body with shell and mount fixtures, kinematic "ghosts" of other ships, loot, boulders), while the shared zone
simulation (server/zone-runtime.js, one per zone, native Box2D) owns bots, rounds, zone loot and every ship's hull;
rooms send thrust and knocks to it and take their pose back each tick (zone-bus.cjs). The core keeps one world per
zone instead: a `Zone` with the rock chunks (same greedy 8×8 merging), walls/docks, every ship's hull (shell + mount
fixtures, as rebuildShell/rebuildMounts made them), bots, rounds, loot and boulders. A Ship points at its hull in its
Zone; the queries rooms ran on their copy (rock overlap, RC fire, docking contacts, arrival checks) go to the zone
world. One copy of the outside instead of one per ship. Ported from zones.js, combat.js, missions.js and
zone-runtime.js; checked against a JavaScript ZoneBus with the same ships, seeds and inputs.

## Next steps (resume here)
The room's command surface is `command(id,msg)` in server/room-runtime.js: input, select, interact, leave, edit,
remove, rotate, helm, drop, portal, moveStack, craft, material, clearQueue, repeat, door, spawnrank, sign, paint,
pusher, hatch, recover, rename, dev. The core grows a matching `ship.command {ship, uid, msg}` so the differential
tests send the very same messages to the JavaScript room and the core. Stage 2's test ops (`ship.input`,
`ship.place`) stay for physics-only checks.
