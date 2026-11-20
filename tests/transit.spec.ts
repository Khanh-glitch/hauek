import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BusBoardingController, BUS_DOORS, deck, floorAt, rect, seats, toLocal, toWorld } from '../src/simulation/boarding';
import { BusRouteController, ROUTE, type TransitEvent } from '../src/simulation/transit';

const unobstructed = { front: false, rear: false };
function tick(route: BusRouteController, duration: number, doors = unobstructed, hold = false) {
  const steps = Math.ceil(duration / 0.02);
  for (let i = 0; i < steps; i++) route.update(duration / steps, doors, hold);
}
function atStop(route = new BusRouteController()) {
  assert.equal(route.wait(), true);
  tick(route, 7);
  assert.equal(route.phase, 'boarding');
  return route;
}
const frontCentre = (BUS_DOORS.front.min + BUS_DOORS.front.max) / 2;

test('the bus waits, honors a blocked approach, then stops with its doors closed', () => {
  const route = new BusRouteController();
  tick(route, 10);
  assert.equal(route.phase, 'waiting');
  const beforeWait = route.clock;
  assert.equal(route.wait(), true);
  assert.equal(Math.floor(route.clock), ROUTE.start + ROUTE.waitMinutes * 60);
  assert.ok(route.clock > beforeWait);
  tick(route, 10, unobstructed, true);
  assert.equal(route.z, ROUTE.approachZ);
  assert.equal(route.toggleDoor('front', false), false);
  tick(route, 7);
  assert.equal(route.phase, 'boarding');
  assert.equal(route.z, ROUTE.originZ);
  assert.equal(route.doors.front.passable, false);
});

test('closed doors block the player, open thresholds are traversable in both directions', () => {
  const route = atStop();
  const player = new BusBoardingController(route, []);
  player.position = toWorld({ x: 2.0, z: frontCentre }, route);
  player.move(-1.55, 0);
  assert.equal(player.onboard, false);
  assert.ok(player.local.x > 1.49);
  assert.equal(route.toggleDoor('front', false), true);
  tick(route, 0.45);
  player.move(-1.48, 0);
  assert.equal(player.onboard, false);
  tick(route, 0.55);
  player.move(-1.04, 0);
  assert.equal(player.onboard, true);
  assert.ok(player.local.x < 0.63);
  assert.equal(floorAt(player.position, player.local), deck(frontCentre));
  player.move(0.78, 0);
  assert.equal(route.toggleDoor('front', true), false);
  assert.equal(route.doors.front.passable, true);
  player.move(0.74, 0);
  assert.equal(player.onboard, false);
  assert.ok(player.position.x > 0.05);
});

test('collision slides along the bus body, solid furniture and both sidewalk boundaries', () => {
  const route = atStop();
  const solid = rect(2, -3.15, 0.50, 0.60);
  const player = new BusBoardingController(route, [solid]);
  player.position = { x: 3, z: -3.15 };
  player.move(-1.3, 0);
  assert.ok(player.position.x >= 2.47);
  player.move(0, 3.2);
  player.move(-2.8, 0);
  assert.ok(player.local.x >= 1.54 && player.onboard === false);
  player.move(9, 0);
  assert.ok(player.position.x <= 6.2);
});

test('fare is charged once; seated and walking passengers stay in bus space through arrival', () => {
  const events: TransitEvent[] = [];
  let clock: number = ROUTE.start, cash: number = ROUTE.initialCash;
  const route = atStop(new BusRouteController({
    clock: { read: () => clock, advance: (n) => { clock += n; } },
    wallet: { read: () => cash, debit: (n) => { if (n > cash) return false; cash -= n; return true; } },
    onEvent: (event) => events.push(event),
  }));
  const player = new BusBoardingController(route, []);
  assert.equal(route.pay(false), false);
  assert.equal(route.depart(true, false), false);
  route.toggleDoor('front', false);
  tick(route, 1);
  player.position = toWorld({ x: 2, z: frontCentre }, route);
  player.move(-1.78, 0);
  assert.equal(player.onboard, true);
  assert.equal(route.pay(true), true);
  assert.equal(route.pay(true), true);
  assert.equal(cash, ROUTE.initialCash - ROUTE.fare);
  assert.equal(route.depart(true, true), false);
  player.move(0, 1.34);
  player.move(-0.23, 0);
  const seat = seats[0];
  assert.equal(player.sit(seat), true);
  const sitting = player.local;
  player.move(0, 2);
  assert.deepEqual(sitting, player.local);
  assert.equal(route.depart(true, false), true);
  tick(route, 0.4);
  assert.equal(route.phase, 'departing');
  tick(route, 0.72);
  assert.equal(route.phase, 'driving');
  assert.equal(route.toggleDoor('front', false), false);
  tick(route, 10);
  player.carry(sitting);
  assert.ok(Math.abs(player.local.x - sitting.x) < 1e-8);
  assert.ok(Math.abs(player.local.z - sitting.z) < 1e-8);
  player.stand();
  assert.equal(player.seat, null);
  assert.ok(Math.abs(player.local.x) < 1e-8);
  const standing = player.local;
  tick(route, 21);
  player.carry(standing);
  assert.deepEqual(player.local, toLocal(toWorld(standing, route), route));
  assert.equal(route.phase, 'arrived');
  assert.equal(route.x, ROUTE.curbX);
  assert.ok(clock >= ROUTE.start + (ROUTE.waitMinutes + ROUTE.rideMinutes) * 60 - 1);
  tick(route, 1);
  assert.equal(route.doors.front.passable, true);
  player.move(0, frontCentre - player.local.z);
  player.move(2.05, 0);
  assert.equal(player.onboard, false);
  assert.equal(route.phase, 'complete');
  assert.deepEqual(events.map((event) => event.type), ['wait-started', 'bus-at-stop', 'boarded', 'fare-paid', 'departed', 'passed-stop', 'arrived', 'left-bus', 'transfer-complete']);
  assert.equal(events.at(-1)?.onTime, true);
});

test('insufficient funds and a missed interview deadline are reported through the host', () => {
  const events: TransitEvent[] = [];
  let clock = ROUTE.deadline + 60;
  const route = atStop(new BusRouteController({ clock: { read: () => clock, advance: (n) => { clock += n; } }, wallet: { read: () => 5000, debit: () => false }, onEvent: (event) => events.push(event) }));
  assert.equal(route.pay(true), false);
  assert.equal(route.depart(true, false), false);
  route.phase = 'arrived';
  route.reachSidewalk();
  route.reachSidewalk();
  assert.equal(events.filter((event) => event.type === 'transfer-complete').length, 1);
  assert.equal(events.at(-1)?.onTime, false);
});
test('survey strips close at party walls and walk bounds open only at passage mouths',async()=>{
  const {strips,DISTRICT_BLOCK,passages}=await import('../src/simulation/q10-plan');
  for(const sides of Object.values(strips))for(const lots of sides){assert.ok(Math.abs(lots.reduce((sum,[w])=>sum+w,0)-DISTRICT_BLOCK)<1e-6);}
  assert.equal(passages.length,2);
  for(const {side,start,end} of passages){const person=new BusBoardingController(new BusRouteController(),[]);const edge=side>0?6.2:-17.1;
    for(const [z,open] of [[(start+end)/2,true],[start-.7,false]] as const){person.position={x:edge-side*.15,z};person.move(side*1.5,0);assert.equal((person.position.x-edge)*side>.6,open);}
  }
});
