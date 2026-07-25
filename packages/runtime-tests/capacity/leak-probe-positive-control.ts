import assert from "node:assert/strict";
import {
  auditCapacityLeakCohort,
  beginCapacityLeakCohort,
  calibrateCapacityLeakProbe,
  takeCapacityLeakCohort,
  trackCapacityLeakTarget,
} from "./leak-probe.ts";

const calibration = await calibrateCapacityLeakProbe();
assert.equal(calibration.valid, true, "the capacity lifetime probe must calibrate");

beginCapacityLeakCohort("measured", 0);
let releasedTarget: object | undefined = {};
trackCapacityLeakTarget("tui-app", releasedTarget);
const releasedCohort = takeCapacityLeakCohort();
releasedTarget = undefined;
const releasedAudit = await auditCapacityLeakCohort(releasedCohort);
assert.equal(releasedAudit.survivingWitnesses, 0);
assert.deepEqual(releasedAudit.survivingKinds, []);
assert.equal(releasedAudit.censusConsistent, true);

const retainedProperty = "__VUE_TUI_CAPACITY_LIFETIME_POSITIVE_CONTROL__";
beginCapacityLeakCohort("measured", 1);
let retainedTarget: object | undefined = {};
trackCapacityLeakTarget("tui-app", retainedTarget);
Object.defineProperty(globalThis, retainedProperty, {
  configurable: true,
  value: retainedTarget,
});
const retainedCohort = takeCapacityLeakCohort();
retainedTarget = undefined;
const retainedAudit = await auditCapacityLeakCohort(retainedCohort);
assert.equal(retainedAudit.survivingWitnesses, 1);
assert.deepEqual(retainedAudit.survivingKinds, ["tui-app"]);
assert.equal(retainedAudit.censusConsistent, true);

assert.equal(Reflect.deleteProperty(globalThis, retainedProperty), true);
const afterReleaseAudit = await auditCapacityLeakCohort(retainedCohort);
assert.equal(afterReleaseAudit.survivingWitnesses, 0);
assert.deepEqual(afterReleaseAudit.survivingKinds, []);
assert.equal(afterReleaseAudit.censusConsistent, true);
