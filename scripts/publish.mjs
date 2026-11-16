#!/usr/bin/env node
/**
 * Publish every Ding package in dependency order.
 *
 * `pnpm pack` rewrites `workspace:*` to the real version, so the tarballs are
 * published with npm exactly as they were tested. Versions already on the
 * registry are skipped, which makes a run that stopped at the OTP prompt safe to
 * resume with a fresh code.
 *
 * Usage:
 *   node scripts/publish.mjs --dry-run              # pack and verify, upload nothing
 *   node scripts/publish.mjs --otp 123456           # typecheck, test, build, publish
 *   node scripts/publish.mjs --otp=123456 --no-verify
 *
 * Exit codes: 0 done, 1 failure, 3 OTP or browser authentication required, 4 npm login required.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['packages/core', 'packages/react', 'packages/vue', 'packages/svelte'];
const argv = process.argv.slice(2);

const flag = (name) => argv.includes(name);
const option = (name) => {
  const index = argv.indexOf(name);
  if (index !== -1 && argv[index + 1] && !argv[index + 1].startsWith('-')) return argv[index + 1];
  const prefix = `${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

function fail(message, code = 1) {
  console.error(`\n✖ ${message}`);
  process.exit(code);
}

const info = (message) => console.log(`\n▸ ${message}`);
const ok = (message) => console.log(`✔ ${message}`);

if (flag('--help') || flag('-h')) {
  console.log(`Publish every Ding package in dependency order.

pnpm packs the tarballs, which rewrites workspace:* to the real version, and
npm publishes those exact tarballs. Versions already on npm are skipped, so a
run that stopped at the OTP prompt resumes safely with a fresh code.

Usage:
  node scripts/publish.mjs --dry-run
  node scripts/publish.mjs --otp 123456
  node scripts/publish.mjs --otp=123456 --no-verify
  NPM_OTP=123456 node scripts/publish.mjs

Options:
  --dry-run       Pack, verify and run npm publish --dry-run. Uploads nothing.
  --otp <code>    One-time password; also read from NPM_OTP.
  --no-verify     Skip typecheck and tests (the build always runs).
  --allow-dirty   Publish with uncommitted changes.
  --help          Show this help.
`);
  process.exit(0);
}

const dryRun = flag('--dry-run');
const verify = !flag('--no-verify');
const allowDirty = flag('--allow-dirty');
const otp = option('--otp') || process.env.NPM_OTP;

if (otp && !/^\d{6,8}$/.test(otp)) fail('The OTP must be a 6 to 8 digit code.');

const pnpm = (() => {
  const local = spawnSync('pnpm', ['--version'], { stdio: 'ignore' });
  if (!local.error && local.status === 0) return { command: 'pnpm', prefix: [] };
  return { command: 'npm', prefix: ['exec', '--yes', '--package=pnpm@10', '--', 'pnpm'] };
})();

function run(command, args, { cwd = root, capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    if (capture) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  }
  return result;
}

const runPnpm = (args, options) => run(pnpm.command, [...pnpm.prefix, ...args], options);

const packages = PACKAGES.map((directory) => {
  const manifest = JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8'));
  return { directory, name: manifest.name, version: manifest.version };
});

const version = packages[0].version;
if (packages.some((pkg) => pkg.version !== version)) {
  fail(`Package versions do not match: ${packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')}.`);
}

const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
if (!allowDirty && status) {
  fail(`The working tree is dirty. Commit the changes first.\n\n${status}`);
}
if (branch !== `release/${version}`) {
  console.warn(`! Branch is ${branch}, not release/${version}. Publishing anyway.`);
}

info(`Publishing ${packages.length} packages at ${version}${dryRun ? ' (dry run)' : ''}`);

if (verify) {
  info('Typechecking');
  runPnpm(['typecheck']);
  info('Running tests');
  runPnpm(['test']);
}

info('Building packages');
runPnpm(['build']);

const releaseDir = join(root, '.release');
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

for (const pkg of packages) {
  const before = new Set(readdirSync(releaseDir));
  info(`Packing ${pkg.name}@${pkg.version}`);
  runPnpm(['pack', '--pack-destination', releaseDir], { cwd: join(root, pkg.directory), capture: true });

  const created = readdirSync(releaseDir).filter((file) => !before.has(file) && file.endsWith('.tgz'));
  if (created.length !== 1) fail(`Expected one tarball for ${pkg.name}, got ${created.length}.`);
  pkg.tarball = join(releaseDir, created[0]);

  const manifest = JSON.parse(execFileSync('tar', ['-xzOf', pkg.tarball, 'package/package.json'], { encoding: 'utf8' }));
  if (manifest.name !== pkg.name || manifest.version !== pkg.version) {
    fail(`Tarball manifest is ${manifest.name}@${manifest.version}, expected ${pkg.name}@${pkg.version}.`);
  }
  for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
    if (String(range).startsWith('workspace:')) {
      fail(`${pkg.name} still lists ${dependency} as ${range}; publish with pnpm or use the packed tarball.`);
    }
    if (dependency.startsWith('@yusufceng1z/ding') && range !== version) {
      fail(`${pkg.name} depends on ${dependency}@${range}, expected ${version}.`);
    }
  }
  const files = execFileSync('tar', ['-tzf', pkg.tarball], { encoding: 'utf8' }).trim().split('\n');
  if (!files.some((file) => file.startsWith('package/dist/'))) fail(`${pkg.name} tarball has no dist directory.`);
  ok(`${pkg.name} packaged (${created[0]})`);
}

function isPublished(pkg) {
  const result = run('npm', ['view', `${pkg.name}@${pkg.version}`, 'version', '--json'], { capture: true, allowFailure: true });
  if (result.status === 0) return true;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (/E404|404 Not Found/i.test(output)) return false;
  fail(`Could not ask npm about ${pkg.name}@${pkg.version}:\n${output.trim()}`);
}

let published = 0;
for (const pkg of packages) {
  if (isPublished(pkg)) {
    console.log(`↷ ${pkg.name}@${pkg.version} is already on npm; skipping.`);
    continue;
  }

  const args = ['publish', pkg.tarball, '--access', 'public', '--tag', 'latest'];
  if (otp) args.push(`--otp=${otp}`);
  if (dryRun) args.push('--dry-run');

  info(`${dryRun ? 'Dry-run publishing' : 'Publishing'} ${pkg.name}@${pkg.version}`);
  const result = run('npm', args, { capture: true, allowFailure: true });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (/EOTP|one-time password|two-factor/i.test(output)) {
      fail('npm asked for a one-time password. Re-run with --otp <code>; published packages are skipped.', 3);
    }
    if (/auth\/cli|complete authentication|web authentication/i.test(output)) {
      const url = output.match(/https:\/\/\S+/)?.[0];
      fail(`npm needs browser authentication${url ? `: ${url}` : ''}. Finish it, then re-run this script; published packages are skipped.`, 3);
    }
    if (/E403|E401|forbidden|unauthorized/i.test(output)) {
      fail('npm rejected the credentials. Run `npm login` and try again.', 4);
    }
    fail(`Publishing ${pkg.name} failed.`, 1);
  }

  published++;
  if (!dryRun) {
    const check = run('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], { capture: true, allowFailure: true });
    if (check.status !== 0) fail(`Published ${pkg.name}, but the registry does not show ${pkg.version} yet.`);
  }
  ok(`${pkg.name}@${pkg.version} ${dryRun ? 'is publishable' : 'is live'}`);
}

console.log(`\n${dryRun ? 'Dry run complete' : 'Published'}: ${published} package${published === 1 ? '' : 's'} ${dryRun ? 'checked' : 'live'}.`);
if (!dryRun && published) {
  for (const pkg of packages) console.log(`  https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`);
}
