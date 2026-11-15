import test from "node:test";
import assert from "node:assert/strict";
import {
  ENGINEERING_LIMITS,
  INITIAL_GAME_STATE,
  ROVER_CATEGORIES,
} from "../js/data.js";
import {
  calculateEnvironmentalSuitability,
  calculatePayloadRemaining,
  calculatePowerConsumption,
  calculatePowerGeneration,
  calculatePowerMargin,
  calculateReliability,
  calculateRoverCost,
  calculateRoverMass,
  calculateRoverMetrics,
  getScientificCapabilities,
  recommendRoverConfiguration,
  validateRoverConfiguration,
} from "../js/rover.js";

function completeConfiguration() {
  return {
    chassis: "expedition",
    mobility: "standard",
    power: "solar",
    communications: "advanced",
    landing: "basic",
    instruments: ["spectrometer", "soil-analyzer", "ground-penetrating-radar", "weather-station"],
  };
}

function hasIssue(result, id) {
  return result.errors.some((issue) => issue.id === id);
}

test("default rover state has zero totals and reports missing mandatory systems", () => {
  const config = INITIAL_GAME_STATE.rover;
  const metrics = calculateRoverMetrics(config);
  const validation = validateRoverConfiguration(config);

  assert.equal(calculateRoverMass(config), 0);
  assert.equal(calculateRoverCost(config), 0);
  assert.equal(calculatePowerGeneration(config), 0);
  assert.equal(calculatePowerConsumption(config), 0);
  assert.equal(calculatePowerMargin(config), 0);
  assert.equal(metrics.payloadRemainingKg, null);
  assert.equal(metrics.reliability, null);
  assert.equal(validation.isValid, false);
  for (const id of ["missing-chassis", "missing-mobility", "missing-power", "missing-communications", "missing-landing"]) {
    assert.ok(hasIssue(validation, id), `expected missing component error ${id}`);
  }
});

test("catalog selection supports all component categories and sums component values", () => {
  const config = completeConfiguration();
  const components = ROVER_CATEGORIES.flatMap((category) => {
    const selectedIds = category.id === "instruments" ? config.instruments : [config[category.id]];
    return selectedIds.map((id) => category.options.find((option) => option.id === id));
  });
  assert.equal(calculateRoverMass(config), components.reduce((sum, component) => sum + component.massKg, 0));
  assert.equal(calculateRoverCost(config), components.reduce((sum, component) => sum + component.costCredits, 0));
  assert.equal(calculatePowerConsumption(config), components.reduce((sum, component) => sum + (component.operatingPowerW ?? 0), 0));
  assert.ok(calculatePowerGeneration(config) > 0);
});

test("removing an installed instrument removes its mass, cost, power, and capability", () => {
  const config = completeConfiguration();
  const before = calculateRoverMetrics(config);
  const withoutRadar = { ...config, instruments: config.instruments.filter((id) => id !== "ground-penetrating-radar") };
  const after = calculateRoverMetrics(withoutRadar);

  assert.equal(after.totalMassKg, before.totalMassKg - 16);
  assert.equal(after.totalCostCredits, before.totalCostCredits - 780);
  assert.equal(after.powerConsumptionW, before.powerConsumptionW - 28);
  assert.equal(after.scientificCapabilities.find(({ objectiveId }) => objectiveId === "agriculture").coverageStatus, "partial");
});

test("mass limit is mandatory and equality at the configured maximum is allowed", () => {
  const config = completeConfiguration();
  const totalMassKg = calculateRoverMass(config);
  const atLimit = validateRoverConfiguration(config, { ...ENGINEERING_LIMITS, maxRoverMassKg: totalMassKg });
  const overLimit = validateRoverConfiguration(config, { ...ENGINEERING_LIMITS, maxRoverMassKg: totalMassKg - 0.01 });

  assert.equal(hasIssue(atLimit, "mass-limit"), false);
  assert.equal(hasIssue(overLimit, "mass-limit"), true);
});

test("construction budget limit is mandatory", () => {
  const config = completeConfiguration();
  const totalCost = calculateRoverCost(config);
  const result = validateRoverConfiguration(config, {
    ...ENGINEERING_LIMITS,
    maxConstructionBudgetCredits: totalCost - 1,
  });

  assert.ok(hasIssue(result, "budget-limit"));
});

test("excessive component demand reports insufficient power", () => {
  const config = {
    ...completeConfiguration(),
    mobility: "advanced-suspension",
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
  assert.ok(calculatePowerMargin(config) < 0);
  assert.ok(hasIssue(validateRoverConfiguration(config), "insufficient-power"));
});

test("missing communication equipment is a mandatory failure", () => {
  const config = { ...completeConfiguration(), communications: null };
  assert.ok(hasIssue(validateRoverConfiguration(config), "missing-communication"));
});

test("missing scientific coverage identifies each uncovered objective", () => {
  const config = { ...completeConfiguration(), instruments: [] };
  const validation = validateRoverConfiguration(config);
  const capabilities = getScientificCapabilities(config);

  for (const id of ["science-minerals", "science-regolith", "science-agriculture", "science-atmosphere"]) {
    assert.ok(hasIssue(validation, id), `expected scientific coverage error ${id}`);
  }
  assert.ok(capabilities.every(({ coverageStatus }) => coverageStatus === "not-covered"));
});

test("a complete illustrative rover configuration satisfies mandatory constraints", () => {
  const config = completeConfiguration();
  const validation = validateRoverConfiguration(config, ENGINEERING_LIMITS, {
    selectedLandingSiteId: "jezero",
  });
  const metrics = calculateRoverMetrics(config, { selectedLandingSiteId: "jezero" });

  assert.equal(validation.isValid, true, validation.errors.map(({ message }) => message).join("\n"));
  assert.ok(metrics.totalMassKg <= ENGINEERING_LIMITS.maxRoverMassKg);
  assert.ok(metrics.totalCostCredits <= ENGINEERING_LIMITS.maxConstructionBudgetCredits);
  assert.ok(metrics.powerMarginW >= 0);
  assert.ok(metrics.payloadRemainingKg >= 0);
  assert.ok(metrics.scientificCapabilities.every(({ coverageStatus }) => coverageStatus === "ready"));
});

test("recommended rover builds a least-cost valid configuration for selected objectives", () => {
  const recommendation = recommendRoverConfiguration(["minerals"], "jezero");
  assert.equal(recommendation.isValid, true, recommendation.reason);
  assert.equal(recommendation.validation.isValid, true);
  assert.deepEqual(recommendation.configuration, {
    chassis: "scout",
    mobility: "advanced-suspension",
    power: "solar",
    communications: "basic",
    landing: "basic",
    instruments: ["spectrometer"],
  });
  assert.ok(recommendation.metrics.totalCostCredits <= ENGINEERING_LIMITS.maxConstructionBudgetCredits);
  assert.ok(recommendation.metrics.totalMassKg <= ENGINEERING_LIMITS.maxRoverMassKg);
  assert.ok(recommendation.metrics.payloadRemainingKg >= 0);
  assert.ok(recommendation.metrics.powerMarginW >= 0);
  assert.ok(recommendation.metrics.instrumentSlotsUsed <= recommendation.metrics.instrumentSlotsAvailable);
  assert.ok(recommendation.metrics.equipmentSlotsUsed <= recommendation.metrics.equipmentSlotsAvailable);
  assert.ok(recommendation.metrics.powerGenerationW <= ENGINEERING_LIMITS.maxPowerGenerationW);
  assert.equal(recommendation.configuration.instruments.length, 1);
  assert.equal(recommendation.configuration.instruments[0], "spectrometer");
  assert.ok(recommendation.explanations.some(({ id, explanation }) =>
    id === "spectrometer" && /mineral identification/i.test(explanation)));
  assert.ok(recommendation.configuration);
});

test("recommended rover shares an instrument across selected objectives", () => {
  const recommendation = recommendRoverConfiguration(["regolith", "agriculture"], "jezero");
  assert.equal(recommendation.isValid, true, recommendation.reason);
  assert.equal(
    recommendation.configuration.instruments.filter((id) => id === "soil-analyzer").length,
    1,
  );
  assert.ok(recommendation.configuration.instruments.includes("ground-penetrating-radar"));
  assert.ok(recommendation.explanations.find(({ id }) => id === "soil-analyzer")
    .explanation.includes("Regolith chemistry indicators"));
  assert.ok(recommendation.explanations.find(({ id }) => id === "soil-analyzer")
    .explanation.includes("Soil/regolith characterization"));
});

test("recommended build reports budget and mass blockers from engineering validation", () => {
  const overBudget = recommendRoverConfiguration(
    ["minerals"],
    "jezero",
    { ...ENGINEERING_LIMITS, maxConstructionBudgetCredits: 1 },
  );
  assert.equal(overBudget.isValid, false);
  assert.ok(overBudget.blockingConstraints.some((message) => /construction cost/i.test(message)));

  const overMass = recommendRoverConfiguration(
    ["minerals"],
    "jezero",
    { ...ENGINEERING_LIMITS, maxRoverMassKg: 1 },
  );
  assert.equal(overMass.isValid, false);
  assert.ok(overMass.blockingConstraints.some((message) => /rover mass/i.test(message)));
});

test("recommended build explains missing objective capability mappings", () => {
  const recommendation = recommendRoverConfiguration(["unmapped-objective"], "jezero");
  assert.equal(recommendation.isValid, false);
  assert.match(recommendation.reason, /No science capability mapping exists/);
});

test("recommended build names exact engineering constraints when no configuration is valid", () => {
  const recommendation = recommendRoverConfiguration(
    ["minerals"],
    "jezero",
    { ...ENGINEERING_LIMITS, maxPowerGenerationW: 1 },
  );
  assert.equal(recommendation.isValid, false);
  assert.ok(recommendation.blockingConstraints.some((message) => /Power generation/.test(message)));
  assert.match(recommendation.reason, /blocked by/);
});

test("instrument slot and payload boundaries are enforced", () => {
  const base = completeConfiguration();
  const tooManyInstruments = {
    ...base,
    instruments: [...base.instruments, "panoramic-camera", "environmental-sensor"],
  };
  assert.ok(hasIssue(validateRoverConfiguration(tooManyInstruments), "instrument-slots"));

  const scout = { ...base, chassis: "scout" };
  assert.ok(hasIssue(validateRoverConfiguration(scout), "payload-limit"));
});

test("mission power generation maximum and exact metric boundaries are honored", () => {
  const config = completeConfiguration();
  const metrics = calculateRoverMetrics(config);
  const exactLimits = {
    ...ENGINEERING_LIMITS,
    maxRoverMassKg: metrics.totalMassKg,
    maxConstructionBudgetCredits: metrics.totalCostCredits,
    maxPayloadKg: metrics.payloadUsedKg,
    maxInstrumentSlots: metrics.instrumentSlotsUsed,
    maxPowerGenerationW: metrics.powerGenerationW,
    minPowerMarginW: metrics.powerMarginW,
    lowPowerMarginRatio: 0,
  };
  const exactlyAtLimits = validateRoverConfiguration(config, exactLimits, {
    selectedLandingSiteId: "jezero",
  });
  const overGeneration = validateRoverConfiguration(config, {
    ...exactLimits,
    maxPowerGenerationW: metrics.powerGenerationW - 1,
  });

  assert.equal(exactlyAtLimits.isValid, true, exactlyAtLimits.errors.map(({ message }) => message).join("\n"));
  assert.ok(hasIssue(overGeneration, "power-generation-limit"));
});

test("reliability is the documented arithmetic mean of installed component ratings", () => {
  const config = completeConfiguration();
  const componentReliability = ROVER_CATEGORIES.flatMap((category) => {
    const ids = category.id === "instruments" ? config.instruments : [config[category.id]];
    return ids.map((id) => category.options.find((option) => option.id === id).reliability);
  });
  const expected = componentReliability.reduce((sum, value) => sum + value, 0) / componentReliability.length;
  assert.equal(calculateReliability(config), Math.round(expected * 10000) / 10000);
});

test("environment suitability uses selected mobility, landing protection, and site tags", () => {
  const config = completeConfiguration();
  const suitability = calculateEnvironmentalSuitability(config, "jezero");
  assert.equal(suitability.siteName, "Jezero Crater");
  assert.equal(suitability.terrainMatch, 33.33);
  assert.equal(suitability.status, "limited-fit");
  assert.equal(calculateEnvironmentalSuitability(config, "unknown-site"), null);
});

test("cost and mass sums update across multiple component changes", () => {
  const config = completeConfiguration();
  const initialMass = calculateRoverMass(config);
  const initialCost = calculateRoverCost(config);
  const changed = {
    ...config,
    chassis: "hauler",
    power: "advanced-solar",
    communications: "high-gain",
  };

  assert.notEqual(calculateRoverMass(changed), initialMass);
  assert.notEqual(calculateRoverCost(changed), initialCost);
  assert.equal(calculatePowerGeneration(changed), 245);
});
