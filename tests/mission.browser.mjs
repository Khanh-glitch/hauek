import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const base = process.env.SCENE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 740, height: 487 } });
page.setDefaultTimeout(12000);
const failures = [];
page.on('pageerror', (error) => failures.push(error));
const hud = page.locator('.game-hud');
const canvas = page.locator('canvas');
const pose = () => canvas.evaluate((element) => JSON.parse(element.dataset.pose));
const key = (code) => page.keyboard.press(code);
const hasPhase = (phase, timeout = 18000) => page.locator(`.game-hud[data-phase="${phase}"]`).waitFor({ timeout });
const hasFlag = (flag, value = 'true') => page.locator(`.game-hud[data-${flag}="${value}"]`).waitFor();
const hasPrompt = (text) => page.locator('.hud-context').getByRole('button', { name: new RegExp(text, 'i') }).waitFor();

async function aim(yaw, pitch = 0.02) {
  const p = await pose();
  await canvas.dispatchEvent('pointermove', { pointerType: 'mouse', movementX: Math.round((p.yaw - yaw) / 0.00235), movementY: Math.round((p.pitch - pitch) / 0.00235) });
}

async function move(code, axis, sign, target, careful = false) {
  return page.evaluate(async ({ code, axis, sign, target, careful }) => {
    const canvas = document.querySelector('canvas');
    const read = () => JSON.parse(canvas.dataset.pose);
    const fields = axis.split('.');
    const send = (event, key = code) => document.dispatchEvent(new KeyboardEvent(event, { bubbles: true, code: key }));
    const stop = () => { send('keyup'); if (careful) send('keyup', 'KeyC'); };
    if (careful) send('keydown', 'KeyC');
    send('keydown');
    const limit = performance.now() + 7000;
    await new Promise((resolve, reject) => {
      function step() {
        const value = fields.reduce((p, field) => p[field], read());
        if (sign * (value - target) >= 0) { stop(); resolve(); return; }
        if (performance.now() > limit) { stop(); reject(new Error(`Movement stalled at ${axis}=${value}; expected ${target}. Pose: ${JSON.stringify(read())}`)); return; }
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    const coast = read().time + 0.15;
    await new Promise((resolve, reject) => {
      const deadline = performance.now() + 3500;
      function step() {
        if (read().time >= coast) resolve();
        else if (performance.now() > deadline) reject(new Error('Simulation paused before finishing the input.'));
        else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    return read();
  }, { code, axis, sign, target, careful });
}

async function alignDoor(aimingInside) {
  for (let i = 0; i < 6; i++) {
    const here = (await pose()).local.z;
    if (here > -4.74 && here < -4.29) return;
    const sign = here < -4.74 ? 1 : -1;
    const key = (sign > 0) === aimingInside ? 'KeyA' : 'KeyD';
    await move(key, 'local.z', sign, -4.50 - sign * 0.125, true);
  }
  assert.fail(`Could not line up with the front door: ${JSON.stringify(await pose())}`);
}

try {
  await page.goto(`${base}/?mission&qa`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Controls' }).click();
  await page.getByRole('heading', { name: 'Simulation controls' }).waitFor();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'View route' }).click();
  assert.match(await page.locator('.route-facts').innerText(), /7\.000/);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Enter simulation' }).click();
  await hasPhase('waiting', 35000);
  await hasPrompt('Inspect route board');
  await key('KeyE');
  await page.getByRole('button', { name: 'Wait for route 06' }).click();
  await hasPhase('boarding');
  console.log('Route board, clock and bus approach verified.');

  await move('KeyW', 'z', 1, -5.12);
  await page.mouse.click(370, 212);
  await page.waitForFunction(() => document.pointerLockElement instanceof HTMLCanvasElement);
  await page.waitForTimeout(240);
  await aim(Math.PI / 2);
  await alignDoor(true);
  await hasPrompt('Open front doors');
  const stop = await move('KeyW', 'local.x', -1, 1.615);
  assert.ok(stop.local.x > 1.49);
  assert.equal(await hud.getAttribute('data-onboard'), 'false');
  await key('KeyE');
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.pose).opened === 1);
  await move('KeyW', 'local.x', -1, 0.54);
  await hasFlag('onboard');
  await hasPrompt('Validate fare');
  await key('KeyE');
  await hasFlag('paid');
  assert.match(await page.locator('.hud-right').innerText(), /43\.000/);
  console.log('Closed-door collision, door opening, continuous boarding and fare verified.');

  const current = await pose();
  if (current.local.x > 0.16) await move('KeyW', 'local.x', -1, 0.15);
  await aim(Math.PI);
  await move('KeyW', 'local.z', 1, -3.28);
  await hasPrompt('Sit down');
  console.log('Reached the passenger aisle.');
  const standing = await pose();
  await key('KeyE');
  await hasFlag('seated');
  await page.waitForFunction((height) => JSON.parse(document.querySelector('canvas').dataset.pose).eye < height - 0.04, standing.eye);
  const seated = await pose();
  await key('KeyF');
  await hasPhase('driving');
  console.log('Transit started with the player seated.');
  await page.waitForFunction((z) => JSON.parse(document.querySelector('canvas').dataset.pose).z < z - 5, seated.z, { timeout: 15000 });
  const carried = await pose();
  assert.ok(Math.abs(carried.local.x - seated.local.x) < 0.002);
  assert.ok(Math.abs(carried.local.z - seated.local.z) < 0.002);
  assert.equal(carried.opened, 0);
  await key('KeyE');
  await hasFlag('seated', 'false');
  if (process.env.CAPTURE) await page.screenshot({ path: `${process.env.CAPTURE}/scammaze-interior.png` });
  console.log('Sitting, camera height, standing, closed-door departure and relative position verified.');

  await hasPhase('arrived', 65000);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.pose).opened === 1);
  await aim(0);
  await move('KeyW', 'local.z', -1, -4.24);
  await aim(-Math.PI / 2);
  await alignDoor(false);
  await move('KeyW', 'x', 1, 0.29);
  await hasPhase('complete');
  await hasFlag('onboard', 'false');
  assert.match(await page.locator('.hud-complete').innerText(), /Arrived before the interview/i);
  console.log('Destination arrival and continuous front-door exit onto the sidewalk verified.');

  await key('Escape');
  await page.getByRole('heading', { name: 'Simulation paused' }).waitFor();
  const pauseTime = (await pose()).time;
  await page.waitForTimeout(250);
  assert.equal((await pose()).time, pauseTime);
  await page.getByRole('button', { name: 'Back to briefing' }).click();
  await page.getByRole('button', { name: 'Resume simulation' }).click();
  await hasPhase('complete');
  assert.deepEqual(failures, []);

  const phone = await browser.newPage({ ...devices['iPhone 13'] });
  await phone.goto(`${base}/?mission`, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: 'Controls' }).tap();
  await phone.getByRole('button', { name: 'OFF', exact: true }).tap();
  await phone.getByRole('button', { name: 'ON', exact: true }).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), await phone.evaluate(() => innerWidth));
  await phone.close();
  console.log('Pause/resume and mobile briefing controls verified.');
} catch (error) {
  console.error(error);
  console.error('Latest scene pose:', await pose().catch(() => null));
  process.exitCode = 1;
} finally {
  await page.evaluate(() => { if (document.pointerLockElement) document.exitPointerLock(); }).catch(() => {});
  await browser.close();
}