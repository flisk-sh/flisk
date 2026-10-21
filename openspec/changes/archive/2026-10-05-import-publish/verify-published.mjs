// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const pkg = '@tdk-landscape/tdk-import@0.1.1';
const root = mkdtempSync(join(tmpdir(), 'import-published-'));
const env = { ...process.env, npm_config_cache: join(root, 'cache') };
delete env.NODE_PATH;
const results = [];
const metaResponse = await fetch('https://registry.npmjs.org/@tdk-landscape%2ftdk-import');
assert(metaResponse.ok);
const metadata = await metaResponse.json();
assert.equal(metadata['dist-tags'].latest, '0.1.1');
const dist = metadata.versions['0.1.1'].dist;
const tarballResponse = await fetch(dist.tarball);
assert(tarballResponse.ok);
const tarball = Buffer.from(await tarballResponse.arrayBuffer());
const integrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64');
assert.equal(integrity, dist.integrity);
const artifact = readFileSync(process.argv[2]);
assert(tarball.equals(artifact), 'Registry tarball differs from workflow artifact');
writeFileSync(join(root, 'registry-0.1.1.tgz'), tarball);
function run(name, files, args) {
  const cwd = join(root, name);
  mkdirSync(cwd);
  for (const [file, body] of Object.entries(files)) writeFileSync(join(cwd, file), body);
  const before = snapshot(cwd);
  const result = spawnSync('npx', ['-y', pkg, ...args], {cwd, env, encoding:'utf8', timeout:120000});
  if (result.error) throw result.error;
  const after = snapshot(cwd);
  const record = { name, command: `npx -y ${pkg} ${args.join(' ')}`, exit:result.status, stdout:result.stdout, stderr:result.stderr, files:Object.keys(after), unchanged:JSON.stringify(before)===JSON.stringify(after) };
  results.push(record);
  return record;
}
function snapshot(cwd) {
  const result = {};
  function walk(dir) {
    for (const e of readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else result[relative(cwd,path)] = readFileSync(path,'base64');
    }
  }
  walk(cwd); return result;
}
let result=run('version', {}, ['--version']);
assert.equal(result.exit,0); assert.equal(result.stdout.trim(),'0.1.1'); assert(result.unchanged);
for (const [type,file,body] of [['Helm','Chart.yaml','apiVersion: v2\nname: demo\nversion: 0.1.0\n'],['Kustomize','kustomization.yaml','resources: []\n']]) {
  for (const dry of [false,true]) {
    result=run(type.toLowerCase()+(dry?'-dry-run':''), {[file]:body}, ['.',...(dry?['--dry-run']:[])]);
    assert.equal(result.exit,2);
    assert((result.stdout+result.stderr).includes(type));
    assert(!/^Found \d+ service/m.test(result.stdout));
    assert(result.unchanged);
  }
}
result=run('mixed', {Procfile:'web: python app.py\nworker: node worker.js\n'}, ['.','--yes']);
assert.equal(result.exit,0);
assert(result.files.includes('services/mixed/worker/service.json'));
assert(!result.files.some(p=>p.includes('/web/')));
assert.match(result.stdout,/web.*add a Dockerfile or image/i);
result=run('skipped', {Procfile:'web: python app.py\n'}, ['.','--yes']);
assert.equal(result.exit,2); assert(result.unchanged);
const evidence = { verifiedAt:new Date().toISOString(), sourceTag:'v0.1.1', sourceCommit:'14480fb3425a3876b9cc8c6f07fdf430bfa10af8', publishRun:'https://github.com/flisk-sh/flisk/actions/runs/37298395884', publishInputs:{ref:'v0.1.1',dry_run:false}, latest:metadata['dist-tags'].latest, tarball:dist.tarball, integrity, artifactMatches:true, freshCache:true, results };
writeFileSync(process.argv[3], JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({latest:evidence.latest,artifactMatches:true,checks:results.map(({name,exit})=>({name,exit})),evidence:process.argv[3]},null,2));
