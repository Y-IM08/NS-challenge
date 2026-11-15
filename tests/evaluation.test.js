import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCategoryScores,
  calculateMissionGrade,
  calculateMissionScore,
  evaluateMission,
  generateMissionReport,
} from "../js/evaluation.js";
import { MISSION_SURFACE_WAYPOINTS } from "../js/data.js";
import {
  abortMission,
  acceptMission,
  assignRole,
  completeMission,
  failMission,
  getState,
  goBack,
  moveRoverToDestination,
  navigateTo,
  operateInstrument,
  pauseMission,
  resetMission,
  selectMission,
  selectMissionDestination,
  selectRoverOption,
  toggleMissionObjective,
  transmitMissionDataToControl,
} from "../js/state.js";

function resources({
  elapsedHours = 0,
  batteryFraction = 0.75,
  remainingCredits = 12000,
  initialBudgetCredits = 15000,
  availablePowerW = 100,
  lastLoadW = 50,
} = {}) {
  const capacity = 1000;
  return {
    missionStartTime: "2040-01-01T00:00:00.000Z",
    hoursPerSol: 24,
    status: {},
    time: {
      elapsedHours,
      remainingHours: 240 - elapsedHours,
      missionDurationHours: 240,
      hoursPerSol: 24,
    },
    power: {
      batteryCapacityWh: capacity,
      batteryEnergyWh: capacity * batteryFraction,
      energyConsumedWh: (1 - batteryFraction) * capacity,
      availablePowerW,
      lastLoadW,
    },
    budget: {
      initialBudgetCredits,
      constructionCredits: 1000,
      launchCredits: 1000,
      operationsCredits: initialBudgetCredits - remainingCredits - 2000,
      communicationCredits: 0,
      maintenanceCredits: 0,
      sampleCredits: 0,
      challengeCredits: 0,
      remainingCredits,
    },
    data: {
      generatedMB: 40,
      storedMB: 20,
      transmittedMB: 20,
      storageCapacityMB: 100,
      communicationCapacityMBPerSol: 20,
      transmissionFailures: 0,
    },
    mass: { remainingPayloadCapacityKg: 20 },
  };
}

function execution({
  status = "COMPLETED",
  selectedObjectives = ["minerals"],
  completedObjectives = selectedObjectives,
  exploredWaypointIds = MISSION_SURFACE_WAYPOINTS
    .filter(({ siteId }) => siteId === "jezero")
    .map(({ id }) => id),
  challenges = [],
  events = [
    { type: "scientific-observation", status: "success" },
    { type: "mission-completed", message: "Mission complete.", timestamp: "2040-01-01T01:00:00.000Z" },
  ],
  condition = {
    wheels: "operational",
    communications: "operational",
    instruments: { spectrometer: "operational", "soil-analyzer": "operational" },
    powerGenerationFactor: 1,
    operatingMode: "nominal",
  },
} = {}) {
  const objectiveProgress = selectedObjectives.map((objectiveId) => ({
    objectiveId,
    name: objectiveId[0].toUpperCase() + objectiveId.slice(1),
    selected: true,
    completed: completedObjectives.includes(objectiveId),
    status: completedObjectives.includes(objectiveId) ? "completed" : "planned",
  }));
  return {
    missionId: "MARS-01",
    missionName: "Evaluation Test Mission",
    landingSiteId: "jezero",
    status,
    objectiveProgress,
    exploredWaypointIds,
    challengeHistory: challenges,
    challengeEvaluation: { performanceScore: 80 },
    operationalCondition: condition,
    observations: [{ observationId: "obs-1", status: "success" }],
    sampleHistory: [{ sampleId: "sample-1", name: "Regolith", status: "collected" }],
    events,
    createdAt: "2040-01-01T00:00:00.000Z",
    updatedAt: "2040-01-01T01:00:00.000Z",
  };
}

function perfectChallenge() {
  return {
    challengeId: "challenge-1",
    typeId: "dust-storm",
    title: "Dust storm",
    category: "environmental",
    status: "RESOLVED",
    selectedDecisionId: "wait-for-conditions",
    decisions: [
      { id: "safe", effects: { batteryDeltaWh: -20 } },
      { id: "continue", effects: { batteryDeltaWh: -90 } },
      { id: "wait-for-conditions", effects: { batteryDeltaWh: -10 } },
    ],
    resolution: { title: "Wait", resourceCosts: { timeHours: 0, batteryWh: 0, budgetCredits: 0 } },
  };
}

function perfectSnapshot() {
  return {
    missionExecution: execution({ challenges: [perfectChallenge()] }),
    resources: resources({
      elapsedHours: 1,
      batteryFraction: 1,
      remainingCredits: 15000,
      availablePowerW: 100,
      lastLoadW: 50,
    }),
  };
}

function openMissionControl() {
  resetMission();
  selectMission("MARS-01");
  acceptMission();
  assignRole("aerospace-engineer");
  navigateTo("planning");
  for (const objectiveId of ["regolith", "agriculture", "atmosphere"]) {
    toggleMissionObjective(objectiveId);
  }
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

test("category scoring exposes every configured category, basis, and maximum", () => {
  const categories = calculateCategoryScores(perfectSnapshot());
  assert.deepEqual(Object.keys(categories), [
    "scientificAchievement",
    "missionEfficiency",
    "resourceManagement",
    "roverPerformance",
    "riskManagement",
    "exploration",
    "missionCompletion",
  ]);
  assert.deepEqual(
    Object.values(categories).map(({ maxScore }) => maxScore),
    [25, 15, 15, 10, 15, 10, 10],
  );
  for (const category of Object.values(categories)) {
    assert.ok(category.score >= 0 && category.score <= category.maxScore);
    assert.ok(category.basis.length > 0);
  }
});

test("perfect recorded mission earns 100 points and S grade", () => {
  const report = evaluateMission(perfectSnapshot());
  assert.equal(report.finalScore, 100);
  assert.equal(report.grade, "S");
  assert.equal(report.categoryScores.scientificAchievement.score, 25);
  assert.equal(report.categoryScores.roverPerformance.score, 10);
  assert.equal(report.categoryScores.riskManagement.score, 15);
});

test("overall score caps category values and grades follow exact boundaries", () => {
  const scores = Object.fromEntries([
    ["scientificAchievement", 25],
    ["missionEfficiency", 15],
    ["resourceManagement", 15],
    ["roverPerformance", 10],
    ["riskManagement", 15],
    ["exploration", 10],
    ["missionCompletion", 10],
  ].map(([id, score]) => [id, { score: score + 100 }]));
  assert.equal(calculateMissionScore(scores), 100);
  assert.equal(calculateMissionGrade(100), "S");
  assert.equal(calculateMissionGrade(95), "S");
  assert.equal(calculateMissionGrade(94), "A");
  assert.equal(calculateMissionGrade(85), "A");
  assert.equal(calculateMissionGrade(84), "B");
  assert.equal(calculateMissionGrade(70), "B");
  assert.equal(calculateMissionGrade(69), "C");
  assert.equal(calculateMissionGrade(50), "C");
  assert.equal(calculateMissionGrade(49), "D");
  assert.equal(calculateMissionGrade(0), "D");
});

test("poor failed mission has low score and reports actual incomplete conditions", () => {
  const snapshot = {
    missionExecution: execution({
      status: "FAILED",
      completedObjectives: [],
      exploredWaypointIds: ["jezero-landing"],
      challenges: [{
        challengeId: "challenge-2",
        title: "Wheel malfunction",
        typeId: "wheel-malfunction",
        subsystem: "wheels",
        category: "equipment",
        status: "ACTIVE",
      }],
      events: [{ type: "mission-status", message: "Mission execution failed." }],
      condition: {
        wheels: "failed",
        communications: "operational",
        instruments: { spectrometer: "operational" },
        powerGenerationFactor: 0.65,
        operatingMode: "nominal",
      },
    }),
    resources: resources({
      elapsedHours: 200,
      batteryFraction: 0.05,
      remainingCredits: 1000,
      availablePowerW: 10,
      lastLoadW: 50,
    }),
  };
  const report = evaluateMission(snapshot);
  assert.ok(report.finalScore < 50);
  assert.equal(report.grade, "D");
  assert.equal(report.missionStatus, "FAILED");
  assert.equal(report.objectivesIncomplete.length, 1);
  assert.equal(report.equipmentFailures.length, 1);
  assert.equal(report.equipmentRecoveries.length, 0);
  assert.ok(report.finalAssessment.majorFailures.some((message) => /failed state/.test(message)));
});

test("partial and aborted missions report actual progress without completion points", () => {
  const snapshot = {
    missionExecution: execution({
      status: "ABORTED",
      selectedObjectives: ["minerals", "regolith"],
      completedObjectives: ["minerals"],
      exploredWaypointIds: ["jezero-landing"],
      events: [{ type: "mission-status", message: "Mission aborted by the team." }],
    }),
    resources: resources({ elapsedHours: 30, batteryFraction: 0.4 }),
  };
  const report = generateMissionReport(snapshot);
  assert.equal(report.missionStatus, "ABORTED");
  assert.equal(report.objectivesCompleted.length, 1);
  assert.equal(report.objectivesIncomplete.length, 1);
  assert.equal(report.categoryScores.scientificAchievement.score, 12.5);
  assert.equal(report.categoryScores.missionCompletion.details.terminalCompletion, false);
  assert.ok(report.finalAssessment.majorFailures.some((message) => /aborted/.test(message)));
});

test("active missions cannot generate final reports and missing terminal data is safe", () => {
  assert.throws(
    () => evaluateMission({ missionExecution: execution({ status: "ACTIVE" }) }),
    /only be generated/,
  );
  const report = evaluateMission({ missionExecution: { status: "FAILED" } });
  assert.equal(report.missionStatus, "FAILED");
  assert.equal(report.finalScore, 0);
  assert.equal(report.resourcesConsumed.timeHours, 0);
  assert.equal(report.objectivesCompleted.length, 0);
  assert.equal(report.explorationProgress.totalWaypoints, 0);
  const partialResources = evaluateMission({
    missionExecution: { status: "ABORTED" },
    resources: {
      time: { elapsedHours: 2 },
      power: { batteryCapacityWh: 50 },
      budget: { remainingCredits: 10 },
      data: {},
    },
  });
  assert.equal(partialResources.resourcesConsumed.timeHours, 0);
  assert.equal(partialResources.resourcesRemaining.batteryWh, 0);
  const missingMetrics = calculateCategoryScores({
    missionExecution: execution({
      status: "ABORTED",
      events: [{ type: "mission-status", message: "Mission aborted." }],
    }),
    resources: {
      time: { missionDurationHours: 240 },
      budget: { initialBudgetCredits: 15000 },
      power: {
        batteryCapacityWh: 1000,
        batteryEnergyWh: 500,
        availablePowerW: 100,
      },
      data: {},
    },
  });
  assert.equal(missingMetrics.missionEfficiency.score, 0);
  assert.equal(missingMetrics.resourceManagement.score, 5);
});

test("evaluation is deterministic, read-only, and preserves resource accounting", () => {
  const snapshot = perfectSnapshot();
  const before = structuredClone(snapshot);
  const first = evaluateMission(snapshot);
  const second = evaluateMission(snapshot);
  assert.deepEqual(first, second);
  assert.deepEqual(snapshot, before);
  assert.equal(first.resourcesConsumed.timeHours, 1);
  assert.equal(first.resourcesConsumed.energyWh, 0);
  assert.equal(first.resourcesConsumed.budgetCredits, 0);
  assert.equal(first.resourcesRemaining.batteryWh, 1000);
  assert.equal(first.resourcesRemaining.batteryCapacityWh, 1000);
  assert.equal(first.resourcesRemaining.budgetCredits, 15000);
  assert.equal(first.resourcesConsumed.dataGeneratedMB, 40);
  assert.equal(first.resourcesConsumed.dataTransmittedMB, 20);
});

test("recommendations derive from battery, failures, objectives, budget, and risk weaknesses", () => {
  const report = generateMissionReport({
    missionExecution: execution({
      status: "FAILED",
      completedObjectives: [],
      challenges: [{
        challengeId: "challenge-3",
        title: "Wheel malfunction",
        subsystem: "wheels",
        category: "equipment",
        status: "ACTIVE",
      }],
      events: [{ type: "mission-status", message: "Mission failed." }],
      condition: {
        wheels: "failed",
        communications: "operational",
        instruments: { spectrometer: "operational" },
        powerGenerationFactor: 0.65,
        operatingMode: "nominal",
      },
    }),
    resources: resources({
      elapsedHours: 200,
      batteryFraction: 0.1,
      remainingCredits: 1000,
      availablePowerW: 10,
      lastLoadW: 50,
    }),
  });
  const recommendationIds = report.recommendations.map(({ id }) => id);
  assert.ok(recommendationIds.includes("conserve-battery"));
  assert.ok(recommendationIds.includes("plan-equipment-recovery"));
  assert.ok(recommendationIds.includes("review-instrument-coverage"));
  assert.ok(recommendationIds.includes("reduce-budget-consumption"));
  assert.ok(recommendationIds.includes("improve-risk-response"));
});

test("frozen mission inputs remain immutable during evaluation", () => {
  const snapshot = perfectSnapshot();
  const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  assert.doesNotThrow(() => evaluateMission(freeze(snapshot)));
});

test("state creates exactly one report for each terminal mission and never evaluates active state", () => {
  openMissionControl();
  assert.equal(getState().missionEvaluation, null);
  navigateTo("results");
  assert.equal(getState().screen, "results");
  assert.equal(getState().missionEvaluation, null);
  goBack();
  assert.equal(getState().screen, "control");
  pauseMission();
  assert.equal(getState().missionExecution.status, "PAUSED");
  assert.equal(getState().missionEvaluation, null);
  abortMission("Mission aborted for evaluation test.");
  const abortedState = getState();
  const abortedReport = abortedState.missionEvaluation;
  assert.ok(Object.isFrozen(abortedReport));
  assert.equal(abortedReport.missionStatus, "ABORTED");
  assert.equal(abortedReport.evaluationTimestamp, abortedState.missionExecution.updatedAt);
  assert.equal(getState().missionEvaluation, abortedReport);
  assert.equal(getState().resources, abortedState.resources);
  navigateTo("results");
  assert.equal(getState().screen, "results");
  assert.equal(getState().missionEvaluation, abortedReport);

  openMissionControl();
  failMission("Mission failed for evaluation test.");
  assert.equal(getState().missionEvaluation.missionStatus, "FAILED");
});

test("completed mission integration records report from actual execution and resources", () => {
  openMissionControl();
  operateInstrument("spectrometer", "minerals", "mineral-identification");
  selectMissionDestination("jezero-delta");
  moveRoverToDestination();
  transmitMissionDataToControl();
  completeMission();
  const { missionExecution, missionEvaluation, resources } = getState();
  assert.equal(missionExecution.status, "COMPLETED");
  assert.ok(missionEvaluation);
  assert.equal(missionEvaluation.missionStatus, "COMPLETED");
  assert.equal(missionEvaluation.objectivesCompleted.length, 1);
  assert.equal(missionEvaluation.explorationProgress.waypointsReached.length, 2);
  assert.equal(missionEvaluation.resourcesConsumed.timeHours, resources.time.elapsedHours);
  assert.equal(
    missionEvaluation.resourcesConsumed.dataTransmittedMB,
    resources.data.transmittedMB,
  );
  assert.throws(() => completeMission(), /requires ACTIVE status/);
  assert.equal(getState().missionEvaluation, missionEvaluation);
});
