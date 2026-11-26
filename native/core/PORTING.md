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
| 2 | interior physics world, hull shell/skin, crew controller (walk, jump, ladders, ice), helm/thrusters | tests/core-crew.cjs | |
| 3 | construction (placement, edit/remove/rotate, footprints, mounts), embiggener/shrinker | | |
| 4 | cargo (items, stacks, merging, boxes), hatches, safeguards | | |
| 5 | machinery (fabricators, loaders, pushers, recycler, shredder, comms, doors, spawns) | | |
| 6 | zone generator, zones (rocks, mining, docks, Freeport, portals), missions | | |
| 7 | combat (rounds, turrets, damage, shields, bots, PvP) and the shared zone sim (zone-runtime) | | |
| 8 | room orchestration (crew, ranks, commands), save codec (same format), snapshots (same wire format) | | |
| 9 | server on the core (all server tests pass), page prediction on the WebAssembly core | | |
