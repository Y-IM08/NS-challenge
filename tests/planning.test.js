import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSION_CATALOG,
  MISSION_PLANNING_LIMITS,
  SCIENCE_OBJECTIVES,
} from "../js/data.js";
import {
  assessMissionRisks,
  buildMissionPlan,
  calculateMissionEstimates,
  createMissionPlanConfiguration,
  isMissionPlanCurrent,
  validateMissionPlan,
  validatePlanningInputs,
} from "../js/planning.js";
import {
  calculateRoverCost,
  calculateRoverMetrics,
} from "../js/rover.js";

function readyRover() {
  return {
    chassis: "scout",
    mobility: "advanced-suspension",
    power: "radioisotope",
    communications: "advanced",
    landing: "basic",
    instruments: ["spectrometer", "weather-station"],
  };
}

function configuredRover() {
  return {
    chassis: "expedition",
    mobility: "standard",
    power: "solar",
    communications: "advanced",
    landing: "basic",
    instruments: [
      "spectrometer",
      "soil-analyzer",
      "ground-penetrating-radar",
      "weather-station",
    ],
  };
}

function planConfiguration(overrides = {}) {
  const configuration = createMissionPlanConfiguration("MARS-01", "jezero");
  return {
    ...configuration,
    objectivePriorities: [
      { objectiveId: "minerals", priority: 1 },
      { objectiveId: "atmosphere", priority: 2 },
    ],
    ...overrides,
  };
}

function check(report, id) {
  return report.checks.find((item) => item.id === id);
}

function riskOf(risks, id) {
  return risks.find((item) => item.id === id);
}

test("mission profiles produce a structured, catalog-backed default configuration", () => {
  const configuration = createMissionPlanConfiguration("MARS-02", "arcadia");

  assert.equal(configuration.missionProfileId, "MARS-02");
  assert.equal(configuration.missionName, "Horizon Scan Mission");
  assert.equal(configuration.landingSiteId, "arcadia");
  assert.equal(configuration.durationSols, Number.parseFloat(MISSION_CATALOG[1].duration));
  assert.equal(configuration.objectivePriorities.length, SCIENCE_OBJECTIVES.length);
  assert.equal(configuration.strategyId, "balanced");
  assert.equal(validatePlanningInputs(configuration).isValid, true);
});

test("mission setup validation catches missing profile, site, duration, objectives, and strategy", () => {
  const base = planConfiguration();

  for (const [field, value] of [
    ["missionProfileId", null],
    ["landingSiteId", null],
    ["durationSols", 0],
    ["durationSols", MISSION_PLANNING_LIMITS.maximumDurationSols + 1],
    ["objectivePriorities", []],
    ["strategyId", "unknown"],
  ]) {
    const result = validatePlanningInputs({ ...base, [field]: value });
    assert.equal(result.isValid, false, `${field}=${value}`);
  }
});

test("mission name and fractional duration are validated without coercing invalid values", () => {
  const base = planConfiguration();
  assert.equal(validatePlanningInputs({ ...base, missionName: "   " }).isValid, false);
  assert.equal(validatePlanningInputs({ ...base, durationSols: 1.5 }).isValid, false);
});

test("objective priority values are part of the structured planning configuration", () => {
  const base = planConfiguration();
  const assigned = {
    ...base,
    objectivePriorities: [
      { objectiveId: "atmosphere", priority: 1 },
      { objectiveId: "minerals", priority: 3 },
    ],
  };
  assert.equal(validatePlanningInputs(assigned).isValid, true);
  assert.equal(
    validatePlanningInputs({
      ...assigned,
      objectivePriorities: [{ objectiveId: "minerals", priority: 5 }],
    }).isValid,
    false,
  );
});

test("resource estimates reuse rover and catalog values for budget, power, data, time, and mass", () => {
  const rover = readyRover();
  const configuration = planConfiguration();
  const estimates = calculateMissionEstimates(configuration, rover);
  const metrics = calculateRoverMetrics(rover, { selectedLandingSiteId: "jezero" });

  assert.equal(estimates.budget.constructionCredits, calculateRoverCost(rover));
  assert.equal(estimates.power.nominalGenerationW, metrics.powerGenerationW);
  assert.equal(estimates.mass.roverMassKg, metrics.totalMassKg);
  assert.equal(estimates.mass.instrumentPayloadMassKg, metrics.payloadUsedKg);
  assert.equal(estimates.mass.remainingPayloadCapacityKg, metrics.payloadRemainingKg);
  assert.equal(estimates.data.expectedScienceDataMB, 17);
  assert.equal(estimates.data.communicationCapacityMBPerSol, 48);
  assert.ok(estimates.time.communicationHours > 0);
  assert.equal(estimates.time.maintenanceAllowanceHours, 2);
  assert.ok(estimates.time.emergencyReserveHours > 0);
});

test("valid selected objectives are ready when their mapped instrument capabilities are installed", () => {
  const report = validateMissionPlan(planConfiguration(), readyRover());
  assert.equal(check(report, "objective-capabilities").passed, true);
});

test("missing required instrument capability is a blocking validation failure with mitigation", () => {
  const configuration = planConfiguration({
    objectivePriorities: [{ objectiveId: "minerals", priority: 1 }],
  });
  const rover = { ...readyRover(), instruments: ["weather-station"] };
  const report = validateMissionPlan(configuration, rover);
  const scienceRisk = riskOf(report.risks, "missing-science-capabilities");

  assert.equal(check(report, "objective-capabilities").passed, false);
  assert.equal(scienceRisk.severity, "high");
  assert.equal(scienceRisk.blocksValidation, true);
  assert.ok(report.recommendations.some((item) => /instrument/i.test(item)));
});

test("rover engineering validity and mass constraints are surfaced separately", () => {
  const valid = validateMissionPlan(planConfiguration(), readyRover());
  const overloaded = {
    ...configuredRover(),
    chassis: "hauler",
    mobility: "advanced-suspension",
    power: "radioisotope",
    communications: "high-gain",
    landing: "advanced-protection",
    instruments: [
      "panoramic-camera",
      "spectrometer",
      "soil-analyzer",
      "regolith-sampler",
      "weather-station",
    ],
  };
  const invalid = validateMissionPlan(planConfiguration(), overloaded);

  assert.equal(check(valid, "rover-engineering").passed, true);
  assert.equal(check(invalid, "rover-engineering").passed, false);
  assert.equal(check(invalid, "rover-mass").passed, false);
  assert.equal(riskOf(invalid.risks, "rover-mass").severity, "high");
});

test("payload capacity violation is a mandatory failure", () => {
  const rover = {
    ...configuredRover(),
    chassis: "scout",
  };
  const report = validateMissionPlan(planConfiguration(), rover);
  assert.equal(check(report, "payload-capacity").passed, false);
});

test("insufficient power is classified as a blocking high-severity risk", () => {
  const rover = {
    ...configuredRover(),
    mobility: "advanced-suspension",
    power: "solar",
    communications: "high-gain",
    instruments: [
      "panoramic-camera",
      "spectrometer",
      "soil-analyzer",
      "regolith-sampler",
      "weather-station",
      "ground-penetrating-radar",
      "environmental-sensor",
    ],
  };
  const report = validateMissionPlan(planConfiguration(), rover);
  const powerRisk = riskOf(report.risks, "power-reserve");

  assert.equal(check(report, "power-requirements").passed, false);
  assert.equal(powerRisk.severity, "high");
  assert.equal(powerRisk.blocksValidation, true);
});

test("construction cost beyond the engineering budget blocks the mission budget check", () => {
  const rover = {
    ...configuredRover(),
    chassis: "hauler",
    mobility: "advanced-suspension",
    power: "radioisotope",
    communications: "high-gain",
    landing: "advanced-protection",
    instruments: [
      "panoramic-camera",
      "spectrometer",
      "soil-analyzer",
      "regolith-sampler",
      "weather-station",
      "ground-penetrating-radar",
      "environmental-sensor",
    ],
  };
  const report = validateMissionPlan(planConfiguration(), rover);

  assert.ok(calculateRoverCost(rover) > 6000);
  assert.equal(check(report, "budget-sufficient").passed, false);
  assert.equal(riskOf(report.risks, "mission-budget").severity, "high");
  assert.equal(riskOf(report.risks, "mission-budget").blocksValidation, true);
});

test("missing communication equipment is a mandatory failure and high risk", () => {
  const rover = { ...readyRover(), communications: null };
  const report = validateMissionPlan(planConfiguration(), rover);

  assert.equal(check(report, "communication-system").passed, false);
  assert.equal(riskOf(report.risks, "communication-capacity").severity, "high");
});

test("limited communication capacity is visible as an advisory risk and duration can block it", () => {
  const rover = {
    ...configuredRover(),
    communications: "basic",
  };
  const configuration = planConfiguration({
    durationSols: 1,
    objectivePriorities: SCIENCE_OBJECTIVES.map(({ id }, index) => ({
      objectiveId: id,
      priority: index + 1,
    })),
  });
  const report = validateMissionPlan(configuration, rover);

  assert.equal(check(report, "communication-system").passed, true);
  assert.equal(check(report, "mission-duration-operations").passed, false);
  assert.equal(riskOf(report.risks, "communication-capacity").severity, "high");
});

test("risk assessments have deterministic severities, reasons, and mitigation recommendations", () => {
  const configuration = planConfiguration();
  const first = assessMissionRisks(configuration, readyRover());
  const second = assessMissionRisks(configuration, readyRover());
  assert.deepEqual(first, second);
  assert.ok(first.every(({ id, category, severity, reason, mitigation, blocksValidation }) =>
    id && category && ["low", "medium", "high"].includes(severity)
    && reason && mitigation && typeof blocksValidation === "boolean"));
  assert.ok(first.some(({ id }) => id === "maintenance-allowance"));
});

test("landing-site selection changes suitability assessment and recommends trade-off review", () => {
  const rover = { ...readyRover(), mobility: "standard" };
  const jezero = validateMissionPlan(planConfiguration(), rover);
  const arcadia = validateMissionPlan(planConfiguration({ landingSiteId: "arcadia" }), rover);

  assert.notEqual(
    riskOf(jezero.risks, "landing-site-suitability").reason,
    riskOf(arcadia.risks, "landing-site-suitability").reason,
  );
  assert.ok(arcadia.recommendations.some((item) => /terrain tags/i.test(item)));
});

test("validation returns READY when all mandatory checks pass with no advisory risks", () => {
  const report = validateMissionPlan(planConfiguration(), readyRover());

  assert.equal(report.overallStatus, "READY");
  assert.equal(report.isReady, true);
  assert.equal(report.failedChecks.length, 0);
  assert.ok(report.passedChecks.length > 0);
  assert.equal(report.validatedAt, "Deterministic planning-state evaluation");
});

test("validation returns NOT READY for an unbuilt rover and reports corrective actions", () => {
  const report = validateMissionPlan(
    planConfiguration(),
    { chassis: null, mobility: null, power: null, communications: null, landing: null, instruments: [] },
  );

  assert.equal(report.overallStatus, "NOT READY");
  assert.equal(report.isReady, false);
  assert.ok(report.failedChecks.length > 0);
  assert.ok(report.recommendations.length > 0);
});

test("validation returns NEEDS ATTENTION for advisory landing and power trade-offs", () => {
  const rover = {
    ...configuredRover(),
    mobility: "standard",
  };
  const report = validateMissionPlan(planConfiguration(), rover);

  assert.equal(report.isReady, true);
  assert.equal(report.overallStatus, "NEEDS ATTENTION");
  assert.ok(report.warnings.length > 0);
});

test("source signature detects rover changes and is stable for an unchanged plan", () => {
  const configuration = planConfiguration();
  const rover = readyRover();
  const plan = buildMissionPlan(configuration, rover);

  assert.equal(isMissionPlanCurrent(plan, rover), true);
  assert.equal(
    isMissionPlanCurrent(plan, { ...rover, mobility: "heavy-duty" }),
    false,
  );
});
