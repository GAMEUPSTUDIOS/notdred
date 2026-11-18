# Protocol and saves

WebSocket endpoint `/play`, JSON protocol version 1. Send `hello` with `protocol:1`, a display `name`, optional previously issued `token`, and optional host `devToken`. Server returns `welcome`. Use `create`, `join` with room ID, `leave`, `export`, or `import` with encoded data. Actions have `type:"action"`, increasing integer `seq`, an allowed action name, and action-specific fields. Input sends keys and world-space aim; clients cannot set authoritative transforms, inventory quantities, HP or damage.

Simulation is fixed at 60 Hz; snapshots are sent about 10 Hz. Each snapshot includes the recipient's inventory, visible crew and world state. Inputs expire after 500 ms without refresh. Server limits message size and frequency. Clients interpolate transforms. Authentication is a random server-issued token, not a user account system. Rejoining restores crew access; inventory drops on disconnect/leave and durable save snapshots include carried items as floor cargo.

## FSV1

A save is Base64 of a binary envelope:

| Offset | Field |
| --- | --- |
| 0 | ASCII `FSV1` (4 bytes) |
| 4 | Uncompressed byte length, uint32 little endian |
| 8 | CRC32 of uncompressed UTF-8 JSON, uint32 little endian |
| 12 | Raw DEFLATE stream |

Payload is `format:"freeport-vector", version:1`, with metadata and vector/tuple arrays for tiles, mounts, loose items and boxes. Positions, types, rotations, health and machinery data are saved, not rendered images. The codec is the authoritative tuple schema: `dist/modules/save-codec.js`. Unsupported format versions, invalid coordinates, oversized payloads, bad types and checksum failures are rejected. The expanded payload limit is 4 MiB.

Server files wrap the compressed ship in room ownership/name metadata and use atomic replacement. Preserve the entire data directory to retain room ownership. Offline saves migrate legacy JSON when loaded. Import is deliberately sandbox-capable and is not suitable for an adversarial shared economy without additional policy.
