'use strict';
// The C++ game core on the server (build/core.node, from scripts/build-core.cjs), loaded with the game data.
//   const core=require('./core.cjs'); core.call({op:'rule',fn:'shipMaxHP',args:[bounds]})
const fs=require('node:fs'),path=require('node:path');
const native=require('../build/core.node');
function callText(text){return native.call(text);}
function call(req){const r=JSON.parse(native.call(JSON.stringify(req)));if(r&&r.error)throw Error('core: '+r.error);return r;}
call({op:'init',data:fs.readFileSync(path.join(__dirname,'..','dist','core-data.json'),'utf8')});
module.exports={call,callText};
