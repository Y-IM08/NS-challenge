import test from "node:test";
import assert from "node:assert/strict";
import {
  activateMissionChallenge,
  calculateMissionChallengeEvaluation,
  createMissionChallenge,
  findTriggerableMissionChallenges,
  resolveMissionChallenge,
} from "../js/challenges.js";
import {
  MISSION_CHALLENGE_CONFIG,
} from "../js/data.js";
import {
  createMissionPlanConfiguration,
  buildMissionPlan,
} from "../js/planning.js";
import {
  recordChallengeConsequences,
  setPowerEnvironment,
} from "../js/resources.js";
import {
  initializeMissionExecution,
  moveMissionRover,
  performScientificObservation,
  recoverMissionEquipment,
  resolveMissionChallenge as resolveExecutionChallenge,
} from "../js/mission.js";
import {
  abortMission,
  acceptMission,
  assignRole,
  getActiveChallenges,
  getChallengeHistory,
  getState,
  moveRoverToDestination,
  navigateTo,
  operateInstrument,
  pauseMission,
  recoverEquipment,
  resetMission,
  resolveChallenge,
  resumeMission,
  selectMission,
  selectMissionDestination,
  selectRoverOption,
  toggleMissionObjective,
} from "../js/state.js";

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

function readyExecution() {
  const rover = validRover();
  const configuration = createMissionPlanConfiguration("MARS-01", "jezero");
  configuration.objectivePriorities = [{ objectiveId: "minerals", priority: 1 }];
  const missionPlan = buildMissionPlan(configuration, rover);
  return {
    rover,
    ...initializeMissionExecution({
      missionId: "MARS-01",
      missionPlan,
      roverConfiguration: rover,
      landingSiteId: "jezero",
    }),
  };
}

function openMissionControl() {
  resetMission();
  selectMission("MARS-01");
  acceptMission();
  assignRole("aerospace-engineer");
  navigateTo("planning");
  toggleMissionObjective("agriculture");
  toggleMissionObjective("atmosphere");
  navigateTo("rover");
  for (const [category, optionId] of [
    ["chassis", "expedition"],
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
    "ground-penetrating-radar",
    "weather-station",
  ]) {
    selectRoverOption("instruments", instrumentId);
  }
  navigateTo("control");
}

test("challenge lifecycle validates decisions and prevents duplicate resolution", () => {
  const context = {
    elapsedHours: 1,
    batteryFraction: 0.7,
    locationId: "jezero-landing",
    movementCount: 0,
    observationCount: 0,
    successfulTransmissionCount: 0,
    solarPowered: true,
    timestamp: "2040-01-01T01:00:00.000Z",
  };
  const created = createMissionChallenge("dust-storm", context, 1);
  assert.equal(created.status, "CREATED");
  const active = activateMissionChallenge(created);
  const resolved = resolveMissionChallenge(active, "enter-safe-mode", {
    resolvedAt: context.timestamp,
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.resolution.effects.durationHours, 0.5);
  assert.throws(() => resolveMissionChallenge(resolved, "wait-for-conditions", {
    resolvedAt: context.timestamp,
  }), /not active/);
  assert.throws(() => resolveMissionChallenge(active, "unknown", {
    resolvedAt: context.timestamp,
  }), /Invalid decision/);
  assert.throws(() => activateMissionChallenge(active), /created challenge/);
});

test("time, location, resource, and equipment triggers are deterministic and occur once", () => {
  const definitions = MISSION_CHALLENGE_CONFIG.challenges;
  const context = {
    elapsedHours: 1,
    batteryFraction: 0.7,
    locationId: "jezero-landing",
    movementCount: 0,
    observationCount: 0,
    successfulTransmissionCount: 0,
    solarPowered: true,
  };
  assert.ok(findTriggerableMissionChallenges([], context).includes("dust-storm"));
  assert.ok(!findTriggerableMissionChallenges([], { ...context, solarPowered: false }).includes("dust-storm"));
  assert.ok(findTriggerableMissionChallenges([], { ...context, locationId: "jezero-ridge" }).includes("reduced-solar"));
  assert.ok(findTriggerableMissionChallenges([], { ...context, batteryFraction: 0.4 }).includes("extreme-temperature"));
  assert.ok(findTriggerableMissionChallenges([], { ...context, movementCount: 2 }).includes("wheel-malfunction"));
  assert.ok(findTriggerableMissionChallenges([], { ...context, observationCount: 2 }).includes("instrument-malfunction"));
  assert.ok(findTriggerableMissionChallenges([], { ...context, successfulTransmissionCount: 1 }).includes("communication-failure"));
  assert.ok(findTriggerableMissionChallenges([], { ...context, elapsedHours: 6 }).includes("power-generation-degradation"));
  for (const definition of definitions) {
    const alreadyTriggered = [{ typeId: definition.id, status: "RESOLVED" }];
    assert.ok(!findTriggerableMissionChallenges(alreadyTriggered, {
      ...context,
      elapsedHours: 10,
      batteryFraction: 0.2,
      locationId: "arcadia-ice",
      movementCount: 5,
      observationCount: 5,
      successfulTransmissionCount: 5,
    }).includes(definition.id));
  }
});

test("challenge resource consequences account time, battery, budget, power, and remain atomic", () => {
  const { rover, resources } = readyExecution();
  const updated = recordChallengeConsequences(resources, rover, {
    challengeId: "challenge-test",
    description: "Test response",
    durationHours: 0.5,
    batteryDeltaWh: -20,
    environmentalPowerFactor: 0.5,
    budgetCostCredits: 25,
  });
  assert.equal(updated.time.elapsedHours, 0.5);
  assert.equal(updated.budget.challengeCredits, 25);
  assert.equal(updated.budget.remainingCredits, resources.budget.remainingCredits - 27);
  assert.equal(updated.power.challengePowerFactor, 0.5);
  assert.ok(updated.power.availablePowerW < resources.power.availablePowerW);
  assert.notEqual(updated.power.batteryEnergyWh, resources.power.batteryEnergyWh);
  assert.equal(resources.time.elapsedHours, 0);
  assert.equal(resources.budget.challengeCredits, 0);

  assert.throws(() => recordChallengeConsequences(resources, rover, {
    challengeId: "challenge-test",
    description: "Cannot afford response",
    durationHours: 1,
    batteryDeltaWh: -20,
    budgetCostCredits: resources.budget.remainingCredits + 1,
  }), /only .* credits remain/);
  assert.throws(() => recordChallengeConsequences(resources, rover, {
    challengeId: "challenge-test",
    description: "Exceeds mission time",
    durationHours: resources.time.remainingHours + 1,
  }), /only .* h remain/);
  const narrowBudget = {
    ...resources,
    budget: { ...resources.budget, remainingCredits: 5 },
  };
  assert.throws(() => recordChallengeConsequences(narrowBudget, rover, {
    challengeId: "challenge-test",
    description: "Combined costs exceed the remaining budget",
    durationHours: 1,
    budgetCostCredits: 2,
  }), /only 1 credits remain/);
  const constrained = {
    ...resources,
    power: { ...resources.power, batteryEnergyWh: 5 },
  };
  assert.throws(() => recordChallengeConsequences(constrained, rover, {
    challengeId: "challenge-test",
    description: "Battery cannot go negative",
    batteryDeltaWh: -10,
  }), /outside its/);
  assert.equal(resources.power.challengePowerFactor, 1);
});

test("all environmental challenge decisions apply their configured mission resource consequences", () => {
  const environmentalChallenges = MISSION_CHALLENGE_CONFIG.challenges
    .filter(({ category }) => category === "environmental");
  for (const definition of environmentalChallenges) {
    for (const decision of definition.decisions) {
      const { execution, resources, rover } = readyExecution();
      const challenge = activateMissionChallenge(createMissionChallenge(definition.id, {
        elapsedHours: 0,
        batteryFraction: 0.9,
        locationId: execution.currentWaypointId,
        timestamp: resources.missionStartTime,
      }, 1));
      const challengeExecution = {
        ...execution,
        challengeHistory: [challenge],
        challengeEvaluation: calculateMissionChallengeEvaluation([challenge]),
      };
      const triggered = resolveExecutionChallenge(
        challengeExecution,
        resources,
        rover,
        challenge.challengeId,
        decision.id,
      );
      const resolved = triggered.execution.challengeHistory.find(
        ({ challengeId }) => challengeId === challenge.challengeId,
      );
      assert.equal(resolved.status, "RESOLVED", `${definition.id}/${decision.id}`);
      assert.equal(resolved.selectedDecisionId, decision.id);
      assert.equal(
        triggered.resources.time.elapsedHours,
        decision.effects.durationHours,
        `${definition.id}/${decision.id} time`,
      );
      assert.equal(
        triggered.resources.budget.challengeCredits,
        decision.effects.budgetCostCredits,
        `${definition.id}/${decision.id} budget`,
      );
      assert.equal(
        triggered.resources.power.challengePowerFactor,
        decision.effects.environmentalPowerFactor,
        `${definition.id}/${decision.id} solar factor`,
      );
      assert.equal(
        triggered.resources.events.at(-1).resourceChanges.batteryPenaltyWh,
        decision.effects.batteryDeltaWh,
        `${definition.id}/${decision.id} battery`,
      );
      assert.equal(
        triggered.execution.challengeEvaluation.resourceCosts.budgetCredits,
        resources.budget.remainingCredits - triggered.resources.budget.remainingCredits,
      );
      assert.equal(resources.time.elapsedHours, 0);
    }
  }
});

test("mission operations trigger the dust storm and equipment recovery restores the system", () => {
  const { execution, resources, rover } = readyExecution();
  const science = performScientificObservation(
    execution,
    resources,
    rover,
    "spectrometer",
    "minerals",
    "mineral-identification",
    1,
  );
  const dust = science.execution.challengeHistory.find(({ typeId }) => typeId === "dust-storm");
  assert.ok(dust);
  const withDust = resolveExecutionChallenge(
    science.execution,
    science.resources,
    rover,
    dust.challengeId,
    "enter-safe-mode",
  );
  const firstMove = moveMissionRover(withDust.execution, withDust.resources, rover, "jezero-delta");
  const wheelFault = firstMove.execution.challengeHistory.find(
    ({ typeId }) => typeId === "wheel-malfunction",
  );
  assert.equal(firstMove.execution.operationalCondition.wheels, "failed");
  assert.ok(wheelFault);
  assert.throws(
    () => moveMissionRover(firstMove.execution, firstMove.resources, rover, "jezero-ridge"),
    /wheel malfunction/,
  );
  const recovered = recoverMissionEquipment(
    firstMove.execution,
    firstMove.resources,
    rover,
    "wheels",
  );
  assert.equal(recovered.execution.operationalCondition.wheels, "operational");
  assert.equal(recovered.execution.operationalStatus, "degraded");
  assert.equal(recovered.execution.challengeEvaluation.successfulRecoveries, 1);
  assert.equal(recovered.resources.budget.challengeCredits, 80);
  assert.equal(
    recovered.execution.challengeHistory.find(({ typeId }) => typeId === "wheel-malfunction").status,
    "RESOLVED",
  );
});

test("instrument, communication, and power faults all recover through their configured resource costs", () => {
  const cases = [
    { typeId: "instrument-malfunction", subsystem: "instrument", instrumentId: "spectrometer" },
    { typeId: "communication-failure", subsystem: "communications" },
    { typeId: "power-generation-degradation", subsystem: "power" },
  ];
  for (const [index, item] of cases.entries()) {
    const { execution: freshExecution, resources: freshResources, rover } = readyExecution();
    const challenge = activateMissionChallenge(createMissionChallenge(item.typeId, {
      elapsedHours: 6,
      batteryFraction: 0.6,
      locationId: freshExecution.currentWaypointId,
      instrumentId: item.instrumentId,
      timestamp: freshResources.missionStartTime,
    }, index + 1));
    const condition = {
      ...freshExecution.operationalCondition,
      ...(item.subsystem === "instrument"
        ? { instruments: { ...freshExecution.operationalCondition.instruments, [item.instrumentId]: "failed" } }
        : item.subsystem === "power"
          ? { powerGenerationFactor: 0.65 }
          : { communications: "failed" }),
    };
    const failedExecution = {
      ...freshExecution,
      challengeHistory: [challenge],
      operationalCondition: condition,
      operationalStatus: "degraded",
    };
    const failedResources = item.subsystem === "power"
      ? recordChallengeConsequences(freshResources, rover, {
        challengeId: challenge.challengeId,
        description: "Test power-generation failure",
        equipmentPowerFactor: 0.65,
      })
      : freshResources;
    const recovered = recoverMissionEquipment(
      failedExecution,
      failedResources,
      rover,
      item.subsystem === "instrument" ? `instrument:${item.instrumentId}` : item.subsystem,
    );
    assert.equal(recovered.execution.challengeHistory[0].status, "RESOLVED");
    if (item.subsystem === "instrument") {
      assert.equal(recovered.execution.operationalCondition.instruments[item.instrumentId], "operational");
    } else if (item.subsystem === "power") {
      assert.equal(recovered.execution.operationalCondition.powerGenerationFactor, 1);
      assert.equal(recovered.resources.power.equipmentPowerFactor, 1);
    } else {
      assert.equal(recovered.execution.operationalCondition.communications, "operational");
    }
    assert.ok(recovered.resources.budget.challengeCredits > 0);
    assert.ok(recovered.resources.time.elapsedHours > freshResources.time.elapsedHours);
  }
});

test("state challenge actions are immutable and reject paused or terminal missions", () => {
  openMissionControl();
  operateInstrument("spectrometer", "minerals", "mineral-identification");
  const before = getState();
  const dust = getActiveChallenges().find(({ typeId }) => typeId === "dust-storm");
  assert.ok(dust);
  assert.ok(Object.isFrozen(before.missionExecution.challengeHistory));

  pauseMission();
  assert.throws(() => resolveChallenge(dust.challengeId, "enter-safe-mode"), /requires ACTIVE status/);
  assert.deepEqual(getActiveChallenges().map(({ challengeId }) => challengeId), [dust.challengeId]);
  resumeMission();
  assert.throws(() => resolveChallenge(dust.challengeId, "not-a-decision"), /Invalid decision/);
  const activeSnapshot = getState();
  assert.throws(() => {
    activeSnapshot.missionExecution.challengeHistory[0].status = "RESOLVED";
  }, TypeError);

  resolveChallenge(dust.challengeId, "enter-safe-mode");
  const resolved = getState();
  assert.equal(resolved.missionExecution.challengeHistory[0].status, "RESOLVED");
  assert.equal(resolved.resources.budget.challengeCredits, 20);
  assert.notEqual(resolved.resources, before.resources);
  assert.equal(getChallengeHistory().length, 1);
  assert.equal(getActiveChallenges().length, 0);
  selectMissionDestination("jezero-delta");
  moveRoverToDestination();
  const wheelFault = getActiveChallenges().find(({ typeId }) => typeId === "wheel-malfunction");
  assert.ok(wheelFault);
  recoverEquipment("wheels");
  assert.equal(getState().missionExecution.operationalCondition.wheels, "operational");
  assert.equal(
    getState().missionExecution.challengeHistory.find(({ typeId }) => typeId === "wheel-malfunction").status,
    "RESOLVED",
  );
  abortMission();
  assert.throws(() => resolveChallenge(dust.challengeId, "wait-for-conditions"), /requires ACTIVE status/);
});
