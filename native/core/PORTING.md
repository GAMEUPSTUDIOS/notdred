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
| 4 | mounts (mountAt, mountValid, mountWidth, mountPoint, rebuildMounts, mountHit, inward), physics machines (spawnMachine, machineSpace, supportsMachine, machineOnTop, fabFits, syncMachines), doors (doorOpen), safeguards | | |
| 5 | construction (construction.js: validity, buildAnchor, placementPoint, beginBuild/tickBuild/commitBuild, removeAt, rotateSelection, resizeCut/resizeShip, helm moves; game.js edit/interact) | | |
| 5b | machinery (fabricators, loaders, pushers, recycler, shredder, comms, ejectors, spawns), hatches | | |
| 6 | zone generator, zones (rocks, mining, docks, Freeport, portals), missions | | |
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

## Next steps (resume here)
The room's command surface is `command(id,msg)` in server/room-runtime.js: input, select, interact, leave, edit,
remove, rotate, helm, drop, portal, moveStack, craft, material, clearQueue, repeat, door, spawnrank, sign, paint,
pusher, hatch, recover, rename, dev. The core grows a matching `ship.command {ship, uid, msg}` so the differential
tests send the very same messages to the JavaScript room and the core. Stage 2's test ops (`ship.input`,
`ship.place`) stay for physics-only checks.
