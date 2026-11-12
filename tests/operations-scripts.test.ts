import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

// A fake Docker CLI runs only throwaway filesystem fixtures. These are failure
// ordering/cleanup tests; real pg_restore/container tests are recorded separately.
const fakeDocker = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const cp = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.OP_TEST_LOG, JSON.stringify(args) + '\n');
if (args[0] === 'image' && args[1] === 'inspect') {
  if (args[2] === process.env.OP_TEST_FAIL_INSPECT) process.exit(9);
  console.log('sha256:' + 'a'.repeat(64));
  process.exit(0);
}
if (args[0] === 'save') {
  const output = args.indexOf('-o');
  if (output >= 0) fs.writeFileSync(args[output + 1], 'synthetic-image-archive');
  else process.stdout.write('synthetic-image-archive');
  if (process.env.OP_TEST_FAIL_SAVE === '1') process.exit(8);
  process.exit(0);
}
if (args[0] === 'load') {
  fs.readFileSync(args[args.indexOf('-i') + 1]);
  process.exit(0);
}
if (args[0] !== 'compose') process.exit(90);
if (args[1] === 'ps') {
  if (process.env.OP_TEST_APP_RUNNING === '1') console.log('app');
  process.exit(0);
}
if (args[1] === 'stop') process.exit(0);
if (args[1] === 'start') {
  if (!fs.existsSync(process.env.OP_TEST_MEDIA + '/.hnb-restore.lock/owner')) process.exit(98);
  process.exit(process.env.OP_TEST_FAIL_START === '1' ? 7 : 0);
}
if (args[1] === 'exec') {
  if (args.join(' ').includes('pg_isready')) process.exit(0);
  if (args.join(' ').includes('pg_restore')) {
    fs.readFileSync(0);
    if (args.join(' ').includes('--list')) process.exit(process.env.OP_TEST_FAIL_RESTORE_LIST === '1' ? 7 : 0);
    process.exit(process.env.OP_TEST_FAIL_RESTORE === '1' ? 7 : 0);
  }
  if (args.join(' ').includes('pg_dump')) {
    process.stdout.write('synthetic-database-dump');
    process.exit(process.env.OP_TEST_FAIL_DUMP === '1' ? 5 : 0);
  }
  process.exit(91);
}
const tool = args.indexOf('tools');
if (args[1] !== 'run' || tool < 0) process.exit(92);
const command = args[tool + 1];
const media = process.env.OP_TEST_MEDIA;
const map = value => value.split('/data/media').join(media);
const commandArgs = args.slice(tool + 2).map(map);
let input = fs.readFileSync(0);
if (process.env.OP_TEST_FAIL_EXTRACT === '1' && commandArgs.some(value => value.includes('tar --no-same-owner'))) {
  console.error('Synthetic media extraction failure');
  process.exit(6);
}
if (command === 'node') {
  input = Buffer.from(map(input.toString()));
  if (process.env.OP_TEST_FAIL_SWAP === '1') {
    input = Buffer.concat([Buffer.from("const __opsFs = require('node:fs'); const __opsRename = __opsFs.renameSync; let __opsFailed = false; __opsFs.renameSync = (from, to) => { if (!__opsFailed && String(from).includes('/incoming/') && String(from).endsWith('/c-new')) { __opsFailed = true; throw new Error('Synthetic swap failure'); } return __opsRename(from, to); };\n"), input]);
  }
}
const result = cp.spawnSync(command === 'node' ? process.execPath : command, commandArgs, { input, env: process.env });
if (result.stdout) process.stdout.write(command === 'tar' ? result.stdout : result.stdout.toString().split(media).join('/data/media'));
if (result.stderr) process.stderr.write(result.stderr.toString().split(media).join('/data/media'));
process.exit(result.status ?? 93);
`;

function setup(t: TestContext) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "hnb-operations-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = path.join(directory, "bin");
  const media = path.join(directory, "media");
  mkdirSync(bin);
  mkdirSync(media);
  writeFileSync(path.join(bin, "docker"), fakeDocker, { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    OP_TEST_LOG: path.join(directory, "docker-calls"),
    OP_TEST_MEDIA: media,
    HANNGU_IMAGE: "han-ngu-bien:ops-test",
    HANNGU_TOOLS_IMAGE: "han-ngu-bien-tools:ops-test",
    POSTGRES_IMAGE: "postgres:17-alpine",
    NGINX_IMAGE: "nginx:1.28-alpine",
  };
  return { directory, media, env };
}

function run(script: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync("bash", [script, ...args], { cwd: process.cwd(), env, encoding: "utf8", timeout: 20_000 });
}

function backup(directory: string) {
  const location = path.join(directory, "backup");
  const payload = path.join(directory, "payload");
  mkdirSync(location);
  mkdirSync(payload);
  writeFileSync(path.join(payload, "a-existing"), "new-a");
  writeFileSync(path.join(payload, "c-new"), "new-c");
  writeFileSync(path.join(location, "database.dump"), "synthetic-db-fixture");
  const packed = spawnSync("tar", ["-czf", path.join(location, "media.tar.gz"), "-C", payload, "."]);
  assert.equal(packed.status, 0);
  writeFileSync(path.join(location, "SHA256SUMS"), ["database.dump", "media.tar.gz"].map(name =>
    `${createHash("sha256").update(readFileSync(path.join(location, name))).digest("hex")}  ${name}\n`).join(""));
  return location;
}

function checksumLine(directory: string, name: string) {
  return `${createHash("sha256").update(readFileSync(path.join(directory, name))).digest("hex")}  ${name}\n`;
}

function images(directory: string) {
  // Spaces in an ordinary archive filename remain supported; paths are never split.
  const name = "offline images.tar.gz";
  const archive = path.join(directory, name);
  writeFileSync(archive, "synthetic-image-archive");
  writeFileSync(`${archive}.images`, ["hnb:app", "hnb:tools", "postgres:17-alpine", "nginx:1.28-alpine"]
    .map(reference => `sha256:${"a".repeat(64)} ${reference}\n`).join(""));
  writeFileSync(`${archive}.sha256`, checksumLine(directory, name) + checksumLine(directory, `${name}.images`));
  return archive;
}

test("offline image load checks both files then verifies loaded IDs without a registry", (t) => {
  const fixture = setup(t);
  const archive = images(fixture.directory);
  const result = run("scripts/offline-load.sh", [archive], fixture.env);
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(fixture.env.OP_TEST_LOG, "utf8");
  assert.match(calls, /\["load","-i"/);
  assert.doesNotMatch(calls, /"pull"|"build"/);
});

for (const invalid of ["omitted", "duplicate", "external", "malformed"] as const) {
  test(`offline load rejects ${invalid} checksum entries before any Docker call`, (t) => {
    const fixture = setup(t);
    const archive = images(fixture.directory);
    const name = path.basename(archive);
    const archiveLine = checksumLine(fixture.directory, name);
    const imagesLine = checksumLine(fixture.directory, `${name}.images`);
    const outside = path.join(fixture.directory, "outside");
    writeFileSync(outside, "synthetic-other-file");
    const outsideHash = createHash("sha256").update(readFileSync(outside)).digest("hex");
    const manifest = {
      omitted: imagesLine,
      duplicate: imagesLine + imagesLine,
      external: archiveLine + `${outsideHash}  ../${path.basename(fixture.directory)}/outside\n`,
      malformed: archiveLine + `not-a-sha256  ${name}.images\n`,
    }[invalid];
    writeFileSync(`${archive}.sha256`, manifest);
    const result = run("scripts/offline-load.sh", [archive], fixture.env);
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(fixture.env.OP_TEST_LOG), false);
  });

  test(`restore rejects ${invalid} checksum entries before Docker or live media changes`, (t) => {
    const fixture = setup(t);
    const source = backup(fixture.directory);
    writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
    const databaseLine = checksumLine(source, "database.dump");
    const mediaLine = checksumLine(source, "media.tar.gz");
    writeFileSync(path.join(fixture.directory, "outside"), "synthetic-other-file");
    const outsideHash = createHash("sha256").update(readFileSync(path.join(fixture.directory, "outside"))).digest("hex");
    const manifest = {
      omitted: mediaLine,
      duplicate: mediaLine + mediaLine,
      external: databaseLine + `${outsideHash}  ../outside\n`,
      malformed: databaseLine + "not-a-sha256  media.tar.gz\n",
    }[invalid];
    writeFileSync(path.join(source, "SHA256SUMS"), manifest);
    const result = run("scripts/docker-restore.sh", [source, "--confirm-replace"], fixture.env);
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(fixture.env.OP_TEST_LOG), false);
    assert.deepEqual(readdirSync(fixture.media), ["a-existing"]);
    assert.equal(readFileSync(path.join(fixture.media, "a-existing"), "utf8"), "old-a");
  });
}

test("invalid dump preflight removes staging without attempting database replacement", (t) => {
  const fixture = setup(t);
  const source = backup(fixture.directory);
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  const result = run("scripts/docker-restore.sh", [source, "--confirm-replace"], { ...fixture.env, OP_TEST_FAIL_RESTORE_LIST: "1" });
  assert.notEqual(result.status, 0);
  assert.deepEqual(readdirSync(fixture.media), ["a-existing"]);
  assert.equal(readFileSync(path.join(fixture.media, "a-existing"), "utf8"), "old-a");
  const calls = readFileSync(fixture.env.OP_TEST_LOG, "utf8");
  assert.match(calls, /pg_restore --list/);
  assert.doesNotMatch(calls, /--clean|--single-transaction/);
  assert.doesNotMatch(result.stderr, /database may already contain the backup/i);
});

test("image export publishes a complete checksummed set only after saving succeeds", (t) => {
  const fixture = setup(t);
  const output = path.join(fixture.directory, "images.tar.gz");
  const result = run("scripts/offline-export.sh", [output], fixture.env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(`${output}.images`, "utf8").trim().split("\n").length, 4);
  const checks = readFileSync(`${output}.sha256`, "utf8").trim().split("\n");
  for (const line of checks) {
    const [hash, name] = line.split("  ");
    assert.equal(createHash("sha256").update(readFileSync(path.join(fixture.directory, name))).digest("hex"), hash);
  }
  assert.equal(readdirSync(fixture.directory).some(name => name.startsWith(".hnb-export.")), false);
});

for (const failure of ["inspect", "save"] as const) {
  test(`image ${failure} failure leaves no final or temporary export artifacts`, (t) => {
    const fixture = setup(t);
    const output = path.join(fixture.directory, "images.tar.gz");
    const env = { ...fixture.env, ...(failure === "inspect" ? { OP_TEST_FAIL_INSPECT: "postgres:17-alpine" } : { OP_TEST_FAIL_SAVE: "1" }) };
    const failed = run("scripts/offline-export.sh", [output], env);
    assert.notEqual(failed.status, 0);
    for (const suffix of ["", ".images", ".sha256"]) assert.equal(existsSync(output + suffix), false);
    assert.equal(readdirSync(fixture.directory).some(name => name.startsWith(".hnb-export.")), false);
    assert.equal(run("scripts/offline-export.sh", [output], fixture.env).status, 0, "retry requires no manual cleanup");
  });
}

test("export refuses existing artifacts without changing them", (t) => {
  const fixture = setup(t);
  const output = path.join(fixture.directory, "images.tar.gz");
  writeFileSync(output, "existing-release");
  assert.notEqual(run("scripts/offline-export.sh", [output], fixture.env).status, 0);
  assert.equal(readFileSync(output, "utf8"), "existing-release");
});

test("media extraction failure occurs before database restore and keeps live files unchanged", (t) => {
  const fixture = setup(t);
  const source = backup(fixture.directory);
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  const result = run("scripts/docker-restore.sh", [source, "--confirm-replace"], { ...fixture.env, OP_TEST_FAIL_EXTRACT: "1" });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path.join(fixture.media, "a-existing"), "utf8"), "old-a");
  assert.deepEqual(readdirSync(fixture.media), ["a-existing"]);
  assert.equal(readFileSync(fixture.env.OP_TEST_LOG, "utf8").includes("pg_restore"), false);
});

test("successful restore replaces media from staging and removes only its own staging/lock", (t) => {
  const fixture = setup(t);
  const source = backup(fixture.directory);
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  writeFileSync(path.join(fixture.media, "b-old"), "old-b");
  const result = run("scripts/docker-restore.sh", [source, "--confirm-replace"], fixture.env);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(fixture.media).sort(), ["a-existing", "c-new"]);
  assert.equal(readFileSync(path.join(fixture.media, "a-existing"), "utf8"), "new-a");
  assert.equal(readFileSync(path.join(fixture.media, "c-new"), "utf8"), "new-c");
  assert.equal(readFileSync(fixture.env.OP_TEST_LOG, "utf8").includes("pg_restore"), true);
});

test("a partial media swap failure restores prior files and preserves recovery state after DB attempt", (t) => {
  const fixture = setup(t);
  const source = backup(fixture.directory);
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  writeFileSync(path.join(fixture.media, "b-old"), "old-b");
  const result = run("scripts/docker-restore.sh", [source, "--confirm-replace"], { ...fixture.env, OP_TEST_FAIL_SWAP: "1" });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path.join(fixture.media, "a-existing"), "utf8"), "old-a");
  assert.equal(readFileSync(path.join(fixture.media, "b-old"), "utf8"), "old-b");
  assert.equal(existsSync(path.join(fixture.media, "c-new")), false);
  assert.equal(existsSync(path.join(fixture.media, ".hnb-restore.lock")), true);
  const stage = readdirSync(fixture.media).find(name => /^\.hnb-restore\.[A-Za-z0-9]{10}$/.test(name));
  assert.ok(stage);
  assert.equal(JSON.parse(readFileSync(path.join(fixture.media, stage, "state.json"), "utf8")).phase, "rolled_back");
  assert.match(result.stderr, /database may already contain the backup/i);
  assert.match(result.stderr, /app remains stopped/i);
});

test("an existing restore lock refuses a concurrent operation without touching live media or DB", (t) => {
  const fixture = setup(t);
  const source = backup(fixture.directory);
  mkdirSync(path.join(fixture.media, ".hnb-restore.lock"));
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  const result = run("scripts/docker-restore.sh", [source, "--confirm-replace"], fixture.env);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path.join(fixture.media, "a-existing"), "utf8"), "old-a");
  assert.equal(existsSync(path.join(fixture.media, ".hnb-restore.lock")), true);
  assert.equal(readFileSync(fixture.env.OP_TEST_LOG, "utf8").includes("pg_restore"), false);
});

test("backup publishes verified files, excludes its lock and restarts app while holding the lock", (t) => {
  const fixture = setup(t);
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  const output = path.join(fixture.directory, "snapshot");
  const result = run("scripts/docker-backup.sh", [output, "--stop-app"], { ...fixture.env, OP_TEST_APP_RUNNING: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(output).sort(), ["SHA256SUMS", "created-at.txt", "database.dump", "media.tar.gz"]);
  const listing = spawnSync("tar", ["-tzf", path.join(output, "media.tar.gz")], { encoding: "utf8" });
  assert.equal(listing.status, 0);
  assert.match(listing.stdout, /a-existing/);
  assert.doesNotMatch(listing.stdout, /\.hnb-restore/);
  assert.deepEqual(readdirSync(fixture.media), ["a-existing"]);
  const calls = readFileSync(fixture.env.OP_TEST_LOG, "utf8");
  assert.ok(calls.indexOf('"stop"') < calls.indexOf("pg_dump"));
  assert.ok(calls.indexOf("pg_dump") < calls.indexOf('"start"'));
  assert.equal(readdirSync(fixture.directory).some(name => name.startsWith(".snapshot.partial.")), false);
});

test("failed database dump publishes no final/partial backup and releases its own lock", (t) => {
  const fixture = setup(t);
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  const output = path.join(fixture.directory, "snapshot");
  const result = run("scripts/docker-backup.sh", [output, "--stop-app"], { ...fixture.env, OP_TEST_FAIL_DUMP: "1", OP_TEST_APP_RUNNING: "1" });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(output), false);
  assert.equal(readdirSync(fixture.directory).some(name => name.startsWith(".snapshot.partial.")), false);
  assert.deepEqual(readdirSync(fixture.media), ["a-existing"]);
  assert.doesNotMatch(result.stdout, /Backup complete/);
  assert.match(readFileSync(fixture.env.OP_TEST_LOG, "utf8"), /"start"/);
});

test("backup failure to restart keeps a verified staging snapshot and reports failure", (t) => {
  const fixture = setup(t);
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  const output = path.join(fixture.directory, "snapshot");
  const result = run("scripts/docker-backup.sh", [output, "--stop-app"], { ...fixture.env, OP_TEST_APP_RUNNING: "1", OP_TEST_FAIL_START: "1" });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(output), false);
  const partial = readdirSync(fixture.directory).find(name => name.startsWith(".snapshot.partial."));
  assert.ok(partial);
  assert.equal(existsSync(path.join(fixture.directory, partial, "SHA256SUMS")), true);
  assert.doesNotMatch(result.stdout, /Backup complete/);
  assert.match(result.stderr, /Verified backup files are preserved/);
  assert.deepEqual(readdirSync(fixture.media), ["a-existing"]);
});

test("backup refuses an active restore lock before stopping app or dumping database", (t) => {
  const fixture = setup(t);
  writeFileSync(path.join(fixture.media, "a-existing"), "old-a");
  mkdirSync(path.join(fixture.media, ".hnb-restore.lock"));
  writeFileSync(path.join(fixture.media, ".hnb-restore.lock/stage"), "preserved-recovery");
  const result = run("scripts/docker-backup.sh", [path.join(fixture.directory, "snapshot"), "--stop-app"], { ...fixture.env, OP_TEST_APP_RUNNING: "1" });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path.join(fixture.media, ".hnb-restore.lock/stage"), "utf8"), "preserved-recovery");
  const calls = readFileSync(fixture.env.OP_TEST_LOG, "utf8");
  assert.doesNotMatch(calls, /pg_dump|"stop"|"start"/);
});
