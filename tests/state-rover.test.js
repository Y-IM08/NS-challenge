import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptMission,
  assignRole,
  getState,
  navigateTo,
  operateInstrument,
  selectPowerEnvironment,
  resetMission,
  resetRoverConfiguration,
  selectMission,
  selectRoverOption,
  transmitMissionDataToControl,
} from "../js/state.js";

test("instrument selection is a unique toggle and rover reset clears its configuration", () => {
  resetMission();
  selectRoverOption("instruments", "spectrometer");
  selectRoverOption("instruments", "soil-analyzer");
  selectRoverOption("instruments", "spectrometer");
  assert.deepEqual(getState().rover.instruments, ["soil-analyzer"]);
  resetRoverConfiguration();
  assert.deepEqual(getState().rover.instruments, []);
  assert.equal(getState().rover.chassis, null);
});

test("reselecting a single-choice component does not publish a duplicate selection", () => {
  resetMission();
  selectRoverOption("chassis", "expedition");
  const selectedState = getState();
  selectRoverOption("chassis", "expedition");
  assert.equal(getState(), selectedState);
  assert.equal(getState().rover.chassis, "expedition");
});

test("mission control transition rejects an invalid rover and accepts a valid one", () => {
  resetMission();
  selectMission("MARS-01");
  acceptMission();
  assignRole("aerospace-engineer");
  navigateTo("planning");
  navigateTo("rover");
  assert.throws(() => navigateTo("control"), /Rover configuration is invalid/);

  for (const [category, option] of [
    ["chassis", "expedition"],
    ["mobility", "standard"],
    ["power", "solar"],
    ["communications", "advanced"],
    ["landing", "basic"],
  ]) {
    selectRoverOption(category, option);
  }
  for (const instrument of [
    "spectrometer",
    "soil-analyzer",
    "ground-penetrating-radar",
    "weather-station",
  ]) {
    selectRoverOption("instruments", instrument);
  }

  navigateTo("control");
  assert.equal(getState().screen, "control");
});

test("resource state initializes on mission-control entry and operation updates are immutable", () => {
  resetMission();
  selectMission("MARS-01");
  acceptMission();
  assignRole("aerospace-engineer");
  navigateTo("planning");
  navigateTo("rover");
  for (const [category, option] of [
    ["chassis", "expedition"],
    ["mobility", "standard"],
    ["power", "solar"],
    ["communications", "advanced"],
    ["landing", "basic"],
  ]) {
    selectRoverOption(category, option);
  }
  for (const instrument of [
    "spectrometer",
    "soil-analyzer",
    "ground-penetrating-radar",
    "weather-station",
  ]) {
    selectRoverOption("instruments", instrument);
  }
  navigateTo("control");

  const initialized = getState();
  assert.ok(Object.isFrozen(initialized.resources));
  assert.equal(initialized.resources.budget.constructionCredits, 5640);
  operateInstrument("spectrometer");
  const operated = getState();
  assert.notEqual(operated, initialized);
  assert.equal(initialized.resources.time.elapsedHours, 0);
  assert.equal(operated.resources.time.elapsedHours, 1);
  assert.equal(operated.resources.data.storedMB, 12);
  assert.equal(operated.resources.events.at(-1).type, "scientific-data-collected");
  assert.throws(() => {
    operated.resources.time.elapsedHours = 200;
  }, TypeError);
});

test("mission environment, transmission failures, and configuration lock use state actions", () => {
  resetMission();
  selectMission("MARS-01");
  acceptMission();
  assignRole("aerospace-engineer");
  navigateTo("planning");
  navigateTo("rover");
  for (const [category, option] of [
    ["chassis", "expedition"],
    ["mobility", "standard"],
    ["power", "solar"],
    ["communications", "advanced"],
    ["landing", "basic"],
  ]) {
    selectRoverOption(category, option);
  }
  for (const instrument of [
    "spectrometer",
    "soil-analyzer",
    "ground-penetrating-radar",
    "weather-station",
  ]) {
    selectRoverOption("instruments", instrument);
  }
  navigateTo("control");
  selectPowerEnvironment("night");
  assert.equal(getState().resources.power.availablePowerW, 0);
  transmitMissionDataToControl();
  assert.equal(getState().resources.data.transmissionFailures, 1);
  assert.equal(getState().resources.events.at(-1).type, "transmission-failed");
  navigateTo("rover");
  assert.throws(() => selectRoverOption("chassis", "scout"), /locked after mission operations begin/);
  assert.throws(() => resetRoverConfiguration(), /locked after mission operations begin/);
  resetMission();
  assert.equal(getState().resources, null);
});
