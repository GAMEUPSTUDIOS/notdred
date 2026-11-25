'use strict';
// One shard (server/shard.cjs) on its own worker thread: zones and their ships, simulated in parallel with the others.
const {parentPort,workerData}=require('node:worker_threads'),{createShard}=require('./shard.cjs');
const shard=createShard({...workerData,post:m=>parentPort.postMessage(m)});
parentPort.on('message',m=>shard.handle(m));
