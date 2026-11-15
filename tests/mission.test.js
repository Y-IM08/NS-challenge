import test from "node:test";
import assert from "node:assert/strict";
import { createMissionPlanConfiguration, buildMissionPlan } from "../js/planning.js";
import {
  abortMission,
  acceptMission,
  assignRole,
  collectSample,
  completeMission,
  getState,
  moveRoverToDestination,
  navigateTo,
  operateInstrument,
  pauseMission,
  resetMission,
  resumeMission,
  selectMission,
  selectMissionDestination,
  selectRoverOption,
  toggleMissionObjective,
  transmitMissionDataToControl,
} from "../js/state.js";
import {
  MISSION_EXECUTION_CONFIG,
} from "../js/data.js";
import {
  calculateMissionRoute,
  collectMissionSample,
  completeMissionExecution,
  getMissionExecutionProgress,
  getScientificOperationOptions,
  initializeMissionExecution,
  moveMissionRover,
  performScientificObservation,
  selectMissionDestination as selectExecutionDestination,
  transitionMissionStatus,
  executeMissionTransmission,
} from "../js/mission.js";

function validRover({ sampler = false } = {}) {
  return {
    chassis: sampler ? "scout" : "expedition",
    mobility: "standard",
    power: "solar",
    communications: "advanced",
    landing: "basic",
    instruments: sampler
      ? ["spectrometer", "soil-analyzer", "regolith-sampler"]
      : ["spectrometer", "soil-analyzer", "ground-penetrating-radar", "weather-station"],
  };
}

function createReadyMission({ rover = validRover(), objectives = null } = {}) {
  const configuration = createMissionPlanConfiguration("MARS-01", "jezero");
  if (objectives) {
    configuration.objectivePriorities = objectives.map((objectiveId, index) => ({
      objectiveId,
      priority: index + 1,
    }));
  }
  const plan = buildMissionPlan(configuration, rover);
  assert.equal(plan.validation.isReady, true);
  return initializeMissionExecution({
    missionId: "MARS-01",
    missionPlan: plan,
    roverConfiguration: rover,
    landingSiteId: "jezero",
  });
}

function openMissionControl({ sampler = false } = {}) {
  resetMission();
  selectMission("MARS-01");
  acceptMission();
  assignRole("aerospace-engineer");
  navigateTo("planning");
  if (sampler) {
    toggleMissionObjective("agriculture");
    toggleMissionObjective("atmosphere");
  }
  navigateTo("rover");
  for (const [category, optionId] of [
    ["chassis", sampler ? "scout" : "expedition"],
    ["mobility", "standard"],
    ["power", "solar"],
    ["communications", "advanced"],
    ["landing", "basic"],
  ]) {
    selectRoverOption(category, optionId);
  }
  for (const instrumentId of [
    "spectrometer",
    "soil-analyzer",
    ...(sampler
      ? ["regolith-sampler"]
      : ["ground-penetrating-radar", "weather-station"]),
  ]) {
    selectRoverOption("instruments", instrumentId);
  }
  navigateTo("control");
}

test("mission initialization requires a fresh approved plan and initializes resources once", () => {
  const { execution, resources } = createReadyMission();
  assert.equal(execution.status, "ACTIVE");
  assert.equal(execution.currentWaypointId, "jezero-landing");
  assert.equal(execution.landingSiteId, "jezero");
  assert.equal(resources.events[0].type, "construction-expenditure");
  assert.equal(resources.events[1].type, "launch-expenditure");
  assert.equal(execution.events[0].type, "mission-initialized");
  assert.throws(
    () => initializeMissionExecution({
      missionId: "MARS-01",
      missionPlan: { ...execution.missionPlan, sourceSignature: "stale" },
      roverConfiguration: validRover(),
      landingSiteId: "jezero",
    }),
    /current, fully validated mission plan/,
  );
});

test("lifecycle transitions pause and resume while rejecting invalid and terminal transitions", () => {
  const { execution } = createReadyMission();
  const paused = transitionMissionStatus(execution, "PAUSED");
  assert.equal(paused.status, "PAUSED");
  assert.throws(() => transitionMissionStatus(paused, "COMPLETED"), /Invalid mission transition/);
  const resumed = transitionMissionStatus(paused, "ACTIVE");
  const aborted = transitionMissionStatus(resumed, "ABORTED");
  assert.equal(aborted.status, "ABORTED");
  assert.throws(() => transitionMissionStatus(aborted, "ACTIVE"), /Invalid mission transition/);
});

test("route preview and successful rover movement deterministically update location and resources", () => {
  const rover = validRover();
  const { execution, resources } = createReadyMission({ rover });
  const route = calculateMissionRoute(execution, "jezero-delta");
  assert.ok(route.distanceKm > 0);
  assert.ok(Math.abs(route.durationHours - route.distanceKm / MISSION_EXECUTION_CONFIG.roverMovementSpeedKmPerHour) < 0.0001);
  const selected = selectExecutionDestination(execution, "jezero-delta");
  const moved = moveMissionRover(selected, resources, rover);
  assert.equal(moved.execution.currentWaypointId, "jezero-delta");
  assert.equal(moved.execution.movementHistory.length, 1);
  assert.equal(moved.execution.exploredWaypointIds.length, 2);
  assert.equal(moved.resources.time.movementHours, route.durationHours);
  assert.ok(moved.resources.power.energyConsumedWh > resources.power.energyConsumedWh);
  assert.equal(resources.time.elapsedHours, 0);
});

test("invalid destination, insufficient time, and insufficient movement power fail atomically", () => {
  const rover = validRover();
  const { execution, resources } = createReadyMission({ rover });
  assert.throws(() => calculateMissionRoute(execution, "arcadia-ice"), /Unknown destination/);
  const route = calculateMissionRoute(execution, "jezero-delta");
  const lowTime = {
    ...resources,
    time: { ...resources.time, remainingHours: route.durationHours - 0.01 },
  };
  assert.throws(
    () => moveMissionRover(execution, lowTime, rover, "jezero-delta"),
    /only .* h remain/,
  );
  const lowPower = {
    ...resources,
    power: { ...resources.power, batteryEnergyWh: 100 },
  };
  assert.throws(
    () => moveMissionRover(execution, lowPower, rover, "jezero-delta"),
    /battery reserve/,
  );
  assert.equal(resources.time.elapsedHours, 0);
  assert.equal(resources.power.batteryEnergyWh, 1350);
  assert.equal(execution.currentWaypointId, "jezero-landing");
});

test("sample collection uses an installed sampler, site availability, and payload capacity", () => {
  const rover = validRover({ sampler: true });
  const { execution, resources } = createReadyMission({ rover, objectives: ["minerals", "regolith"] });
  const collected = collectMissionSample(execution, resources, rover, "regolith");
  assert.equal(collected.execution.samples.length, 1);
  assert.equal(collected.execution.samples[0].sampleType, "regolith");
  assert.equal(collected.resources.mass.payloadMassKg, 0.8);
  assert.equal(collected.resources.mass.remainingPayloadCapacityKg, resources.mass.remainingPayloadCapacityKg - 0.8);
  assert.equal(collected.resources.time.sampleCollectionHours, MISSION_EXECUTION_CONFIG.sampleCollectionDurationHours);
  assert.equal(collected.resources.budget.sampleCredits, MISSION_EXECUTION_CONFIG.sampleCollectionCostCredits);
  assert.equal(resources.mass.payloadMassKg, 0);
  assert.throws(() => collectMissionSample(execution, resources, validRover(), "regolith"), /requires an installed/);
  assert.throws(() => collectMissionSample(execution, resources, rover, "ice-related-material"), /not available/);
  const noPayload = {
    ...resources,
    mass: { ...resources.mass, remainingPayloadCapacityKg: 0.1 },
  };
  assert.throws(() => collectMissionSample(execution, noPayload, rover, "regolith"), /payload capacity remain/);
  assert.equal(resources.events.length, 2);
});

test("scientific observations require a planned matching capability and update multi-capability progress incrementally", () => {
  const rover = validRover();
  const { execution, resources } = createReadyMission({ rover });
  const options = getScientificOperationOptions(execution, rover, "spectrometer");
  assert.ok(options.some(({ objectiveId }) => objectiveId === "minerals"));
  assert.throws(
    () => performScientificObservation(execution, resources, rover, "weather-station", "minerals", "mineral-identification"),
    /does not support/,
  );
  const minerals = performScientificObservation(
    execution,
    resources,
    rover,
    "spectrometer",
    "minerals",
    "mineral-identification",
  );
  const mineralProgress = minerals.execution.objectiveProgress.find(({ objectiveId }) => objectiveId === "minerals");
  assert.equal(mineralProgress.status, "completed");
  assert.equal(minerals.execution.observations[0].status, "success");
  assert.equal(minerals.execution.observations[0].generatedDataMB, 12);

  const moved = moveMissionRover(execution, resources, rover, "jezero-ridge");
  const atmosphereFirst = performScientificObservation(
    moved.execution,
    moved.resources,
    rover,
    "weather-station",
    "atmosphere",
    "atmospheric-conditions",
  );
  assert.equal(atmosphereFirst.execution.objectiveProgress.find(({ objectiveId }) => objectiveId === "atmosphere").status, "in-progress");
  const atmosphereSecond = performScientificObservation(
    atmosphereFirst.execution,
    atmosphereFirst.resources,
    rover,
    "weather-station",
    "atmosphere",
    "wind-speed",
  );
  assert.equal(atmosphereSecond.execution.objectiveProgress.find(({ objectiveId }) => objectiveId === "atmosphere").status, "completed");
  assert.equal(moved.resources.time.elapsedHours, calculateMissionRoute(execution, "jezero-ridge").durationHours);
});

test("mission completion respects configured objectives, exploration, and data-return requirements", () => {
  const rover = validRover();
  const { execution, resources } = createReadyMission({ rover, objectives: ["minerals"] });
  assert.equal(getMissionExecutionProgress(execution, resources).canComplete, false);
  const observation = performScientificObservation(
    execution,
    resources,
    rover,
    "spectrometer",
    "minerals",
    "mineral-identification",
  );
  assert.throws(() => completeMissionExecution(observation.execution, observation.resources), /requirements are not met/);
  const moved = moveMissionRover(observation.execution, observation.resources, rover, "jezero-delta");
  const transmitted = executeMissionTransmission(
    moved.execution,
    moved.resources,
    rover,
  );
  assert.equal(getMissionExecutionProgress(transmitted.execution, transmitted.resources).canComplete, true);
  const complete = completeMissionExecution(transmitted.execution, transmitted.resources);
  assert.equal(complete.status, "COMPLETED");
  assert.equal(complete.completion.completed, true);
});

test("state integration publishes frozen execution and resource snapshots and guards paused or terminal operations", () => {
  openMissionControl();
  const initialized = getState();
  assert.equal(initialized.missionExecution.status, "ACTIVE");
  const oldExecution = initialized.missionExecution;
  selectMissionDestination("jezero-delta");
  moveRoverToDestination();
  const moved = getState();
  assert.equal(moved.missionExecution.currentWaypointId, "jezero-delta");
  assert.ok(Object.isFrozen(moved.missionExecution));
  assert.ok(Object.isFrozen(moved.resources));
  assert.notEqual(moved.missionExecution, oldExecution);
  pauseMission();
  assert.throws(() => operateInstrument("spectrometer"), /requires ACTIVE status/);
  resumeMission();
  operateInstrument("soil-analyzer", "agriculture", "regolith-chemistry");
  assert.equal(getState().missionExecution.observations.length, 1);
  abortMission();
  assert.throws(() => transmitMissionDataToControl(), /requires ACTIVE status/);
  assert.throws(() => completeMission(), /requires ACTIVE status/);
});

test("state sample action integrates inventory with the frozen resource payload", () => {
  openMissionControl({ sampler: true });
  const before = getState();
  collectSample("basaltic-rock");
  const after = getState();
  assert.equal(after.missionExecution.samples.length, 1);
  assert.equal(after.resources.mass.payloadMassKg, 1.5);
  assert.equal(before.resources.mass.payloadMassKg, 0);
  assert.ok(Object.isFrozen(after.missionExecution.samples[0]));
});
