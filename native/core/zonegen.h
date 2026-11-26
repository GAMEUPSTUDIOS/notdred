#pragma once
#include "physics.h"
namespace nd {
// A generated zone grid (zone-generator.js): cell kinds 0 open, 1 hazard wall, 2 rock, 3 ore, 4 flux, 5 iron (block
// layout); solid/centers per cell; `extra` holds the layout's own fields (pit, block, entry, mineable).
struct ZoneGrid{std::string layout;double seed=0;int width=0,height=0,cell=4,start=0,connectors=0,version=1;double minX=0,minY=0;
 std::vector<uint8_t> solid,centers,kinds;J extra=J::object();J toJSON(bool arrays)const;};
ZoneGrid generateZone(double seed,const J& opts);
}
