const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);fs.mkdirSync('build',{recursive:true});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.cpp')?[path.join(dir,e.name)]:[]);}
const args=['-std=c++17','-O2','-shared','-fPIC','-DNODE_GYP_MODULE_NAME=freeport_physics','-Inative/vendor','-Inative/vendor/box2d-2.4.1/include','-Inative/vendor/box2d-2.4.1/src','native/physics.cpp',...files('native/vendor/box2d-2.4.1/src'),'-o','build/physics.node'];
if(process.platform==='darwin')args.push('-undefined','dynamic_lookup');
const r=spawnSync(process.env.CXX||'g++',args,{stdio:'inherit'});if(r.error)throw r.error;process.exitCode=r.status;
