import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptMission,
  assignRole,
  getState,
  navigateTo,
  resetMission,
  resetRoverConfiguration,
  selectLandingSite,
  selectMission,
  selectMissionStrategy,
  selectPlanningMissionProfile,
  selectRoverOption,
  setMissionObjectivePriority,
  toggleMissionObjective,
  updateMissionPlanField,
} from "../js/state.js";
import { isMissionPlanCurrent } from "../js/planning.js";

function openPlanning() {
  resetMission();
  selectMission("MARS-01");
  acceptMission();
  assignRole("aerospace-engineer");
  navigateTo("planning");
}

function configureReadyMission() {
  for (const objectiveId of ["regolith", "agriculture"]) {
    toggleMissionObjective(objectiveId);
  }
  for (const [category, optionId] of [
    ["chassis", "scout"],
    ["mobility", "advanced-suspension"],
    ["power", "radioisotope"],
    ["communications", "advanced"],
    ["landing", "basic"],
    ["instruments", "spectrometer"],
    ["instruments", "weather-station"],
  ]) {
    selectRoverOption(category, optionId);
  }
}

test("accepted mission creates immutable planning state connected to its profile", () => {
  resetMission();
  selectMission("MARS-02");
  acceptMission();
  const state = getState();

  assert.equal(state.missionPlan.configuration.missionProfileId, "MARS-02");
  assert.equal(state.missionPlan.configuration.durationSols, 16);
  assert.equal(state.missionPlan.readiness, "NOT READY");
  assert.ok(Object.isFrozen(state.missionPlan));
  assert.ok(Object.isFrozen(state.missionPlan.configuration.objectivePriorities));
});

test("mission name, duration, objectives, priorities, and strategy publish immutable revalidated plans", () => {
  openPlanning();
  const original = getState();
  updateMissionPlanField("missionName", "Delta Evidence Survey");
  updateMissionPlanField("durationSols", 10);
  toggleMissionObjective("agriculture");
  toggleMissionObjective("agriculture");
  setMissionObjectivePriority("agriculture", 1);
  selectMissionStrategy("science-first");
  const current = getState();

  assert.notEqual(current, original);
  assert.equal(original.missionPlan.configuration.missionName, "First Light Mission");
  assert.equal(current.missionPlan.configuration.missionName, "Delta Evidence Survey");
  assert.equal(current.missionPlan.configuration.durationSols, 10);
  assert.equal(
    current.missionPlan.configuration.objectivePriorities.find(({ objectiveId }) => objectiveId === "agriculture").priority,
    1,
  );
  assert.equal(current.missionPlan.configuration.strategyId, "science-first");
  assert.ok(Object.isFrozen(current.missionPlan.validation.checks));
  assert.equal(isMissionPlanCurrent(current.missionPlan, current.rover), true);
});

test("mission profile and landing-site updates refresh the stored plan and risk report", () => {
  openPlanning();
  const initialSignature = getState().missionPlan.sourceSignature;
  selectPlanningMissionProfile("MARS-02");
  assert.equal(getState().currentMissionId, "MARS-02");
  assert.equal(getState().selectedMissionId, "MARS-02");
  assert.equal(getState().missionPlan.configuration.durationSols, 16);

  selectLandingSite("arcadia");
  const state = getState();
  assert.equal(state.missionPlan.configuration.landingSiteId, "arcadia");
  assert.notEqual(state.missionPlan.sourceSignature, initialSignature);
  assert.equal(isMissionPlanCurrent(state.missionPlan, state.rover), true);
});

test("mission planning prevents rover navigation until its setup inputs are valid", () => {
  openPlanning();
  updateMissionPlanField("durationSols", 0);
  assert.throws(() => navigateTo("rover"), /Mission planning is incomplete/);
  updateMissionPlanField("durationSols", 12);
  navigateTo("rover");
  assert.equal(getState().screen, "rover");
});

test("rover component changes and resets invalidate and refresh readiness", () => {
  openPlanning();
  configureReadyMission();
  navigateTo("rover");
  const readyState = getState();
  assert.equal(readyState.missionPlan.validation.isReady, true);

  selectRoverOption("instruments", "spectrometer");
  const changedState = getState();
  assert.equal(changedState.missionPlan.validation.isReady, false);
  assert.notEqual(changedState.missionPlan.sourceSignature, readyState.missionPlan.sourceSignature);
  assert.equal(isMissionPlanCurrent(changedState.missionPlan, changedState.rover), true);

  resetRoverConfiguration();
  assert.equal(getState().missionPlan.readiness, "NOT READY");
  assert.equal(readyState.missionPlan.readiness, "READY");
});

test("Mission Control is blocked for invalid plans and opens only with current valid rover readiness", () => {
  openPlanning();
  navigateTo("rover");
  assert.throws(() => navigateTo("control"), /Rover configuration is invalid/);
  assert.equal(getState().resources, null);

  configureReadyMission();
  assert.equal(getState().missionPlan.readiness, "READY");
  navigateTo("control");
  assert.equal(getState().screen, "control");
  assert.equal(getState().resources.time.missionDurationHours, 12 * 24);
  assert.equal(isMissionPlanCurrent(getState().missionPlan, getState().rover), true);
});

test("mission planning cannot be edited after resource operations begin", () => {
  openPlanning();
  configureReadyMission();
  navigateTo("rover");
  navigateTo("control");
  assert.throws(() => updateMissionPlanField("missionName", "Late edit"), /only be edited/);
  assert.throws(() => selectLandingSite("arcadia"), /locked after mission operations/);
});
