import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSION_RESOURCE_CONFIG,
} from "../js/data.js";
import {
  advanceMissionTime,
  calculateAvailablePower,
  calculateBatteryLevel,
  calculateEnergyConsumption,
  collectScientificData,
  createMissionResources,
  getResourceSummary,
  recordMaintenance,
  recordEmergencyDelay,
  setPowerEnvironment,
  simulatePowerInterval,
  transmitMissionData,
} from "../js/resources.js";
import {
  calculateRoverCost,
  calculateRoverMetrics,
  calculateRoverMass,
} from "../js/rover.js";

function validRover() {
  return {
    chassis: "expedition",
    mobility: "standard",
    power: "solar",
    communications: "advanced",
    landing: "basic",
    instruments: ["spectrometer", "soil-analyzer", "ground-penetrating-radar", "weather-station"],
  };
}

function start(overrides = {}, roverConfiguration = validRover()) {
  return createMissionResources({
    roverConfiguration,
    missionId: "MARS-01",
    missionDurationSols: 12,
    settings: { ...MISSION_RESOURCE_CONFIG, ...overrides },
  });
}

test("available solar generation follows daylight, dust, and efficiency conditions", () => {
  const rover = validRover();
  const clear = calculateAvailablePower(rover, "clear-day");
  const dusty = calculateAvailablePower(rover, "dusty-day");
  const night = calculateAvailablePower(rover, "night");

  assert.equal(clear.availablePowerW, Math.round(165 * 0.78 * (1 - 0.05) * 0.88 * 100) / 100);
  assert.equal(dusty.availablePowerW, Math.round(165 * 0.32 * (1 - 0.48) * 0.72 * 100) / 100);
  assert.ok(clear.availablePowerW > dusty.availablePowerW);
  assert.equal(night.availablePowerW, 0);
  assert.equal(night.nominalGenerationW, 165);
});

test("radioisotope generation is independent of daylight and solar dust", () => {
  const rover = { ...validRover(), power: "radioisotope" };
  const clear = calculateAvailablePower(rover, "clear-day");
  const night = calculateAvailablePower(rover, "night");
  const dusty = calculateAvailablePower(rover, "dusty-day");

  assert.equal(clear.availablePowerW, 205);
  assert.equal(night.availablePowerW, clear.availablePowerW);
  assert.equal(dusty.availablePowerW, clear.availablePowerW);
  assert.equal(clear.isSolar, false);
});

test("energy use is power multiplied by elapsed hours and separates rover/instrument loads", () => {
  const energy = calculateEnergyConsumption(validRover(), {
    mode: "instrument",
    instrumentId: "spectrometer",
    durationHours: 2,
  });

  assert.equal(energy.roverOperatingPowerW, 47);
  assert.equal(energy.instrumentPowerW, 17);
  assert.equal(energy.communicationPowerW, 0);
  assert.equal(energy.totalPowerW, 72);
  assert.equal(energy.energyWh, 144);
  assert.equal(calculateEnergyConsumption(validRover(), { mode: "idle", durationHours: 0 }).energyWh, 0);
});

test("battery depletion is deterministic, respects reserve, and does not mutate prior state", () => {
  const initial = start();
  const interval = simulatePowerInterval(initial.power, 0, 100, 2);

  assert.equal(interval.energyConsumedWh, 200);
  assert.equal(interval.energyGeneratedWh, 0);
  assert.equal(interval.powerState.batteryEnergyWh, initial.power.batteryEnergyWh - 200);
  assert.equal(initial.power.batteryEnergyWh, 1350);
  assert.equal(interval.batteryLevel.percentage, 63.9);
});

test("battery charging is capped at capacity and battery level handles zero capacity", () => {
  const initial = start();
  const full = simulatePowerInterval(initial.power, 1000, 8, 10);
  assert.equal(full.powerState.batteryEnergyWh, initial.power.batteryCapacityWh);
  assert.equal(calculateBatteryLevel({ batteryEnergyWh: 0, batteryCapacityWh: 0 }).percentage, 0);
  assert.equal(calculateBatteryLevel({ batteryEnergyWh: 0, batteryCapacityWh: 0 }).status, "critical");
});

test("power validation rejects inconsistent battery state and reserve settings", () => {
  const initial = start();
  assert.throws(
    () => simulatePowerInterval(
      { ...initial.power, batteryEnergyWh: initial.power.batteryCapacityWh + 1 },
      100,
      10,
      1,
    ),
    /Battery energy must be between zero and the configured capacity/,
  );
  assert.throws(
    () => simulatePowerInterval(
      initial.power,
      100,
      10,
      1,
      { ...MISSION_RESOURCE_CONFIG, minimumBatteryFraction: 1.1 },
    ),
    /Minimum battery reserve must be a fraction/,
  );
});

test("mission setup reuses rover cost and mass calculations", () => {
  const rover = validRover();
  const resources = start();
  const metrics = calculateRoverMetrics(rover);

  assert.equal(resources.budget.constructionCredits, calculateRoverCost(rover));
  assert.equal(resources.mass.totalDeployedMassKg, calculateRoverMass(rover));
  assert.equal(resources.mass.installedInstrumentMassKg, metrics.payloadUsedKg);
  assert.equal(resources.mass.roverDryMassKg + resources.mass.installedInstrumentMassKg, metrics.totalMassKg);
  assert.equal(resources.mass.remainingPayloadCapacityKg, metrics.payloadRemainingKg);
});

test("initial budget records construction and launch expenses and rejects unaffordable operations", () => {
  const rover = validRover();
  const setupCost = calculateRoverCost(rover) + MISSION_RESOURCE_CONFIG.launchCostCredits;
  assert.throws(
    () => start({ initialBudgetCredits: setupCost - 1 }),
    /exceed the initial mission budget/,
  );
  const resources = start({ initialBudgetCredits: setupCost });
  assert.equal(resources.budget.remainingCredits, 0);
  assert.equal(resources.events[0].type, "construction-expenditure");
  assert.equal(resources.events[1].type, "launch-expenditure");
  assert.equal(resources.events[0].status, "success");
  assert.equal(resources.events[0].timestamp, MISSION_RESOURCE_CONFIG.missionStartTime);
  assert.equal(resources.events[0].eventId, "resource-event-0001");
  assert.equal(resources.events[1].eventId, "resource-event-0002");
  assert.throws(
    () => collectScientificData(resources, rover, "spectrometer"),
    /credits remain/,
  );
});

test("instrument operations generate MB from the existing catalog data units", () => {
  const rover = validRover();
  const resources = start();
  const next = collectScientificData(resources, rover, "spectrometer", 1);

  assert.equal(next.data.generatedMB, 12);
  assert.equal(next.data.storedMB, 12);
  assert.equal(getResourceSummary(next).data.remainingStorageMB, 500);
  assert.equal(next.time.instrumentOperationHours, 1);
  assert.equal(next.time.elapsedHours, 1);
  assert.equal(next.events.at(-1).type, "scientific-data-collected");
  assert.equal(next.events.at(-2).type, "instrument-activated");
  assert.equal(next.events.at(-1).status, "success");
  assert.equal(next.events.at(-1).timestamp, "2040-01-01T01:00:00.000Z");
  assert.equal(next.events.at(-1).resourceChanges.dataStoredMB, 12);
});

test("power-limited operations fail atomically without consuming other resources", () => {
  const rover = validRover();
  const initial = start();
  const atNight = setPowerEnvironment(initial, rover, "night");
  const lowBattery = {
    ...atNight,
    power: { ...atNight.power, batteryEnergyWh: 100 },
  };
  assert.throws(
    () => collectScientificData(lowBattery, rover, "spectrometer"),
    /battery reserve/,
  );
  assert.equal(lowBattery.data.storedMB, 0);
  assert.equal(lowBattery.time.elapsedHours, 0);
  assert.equal(lowBattery.budget.operationsCredits, 0);
});

test("storage limit prevents collection and leaves resources unchanged", () => {
  const rover = validRover();
  const resources = start({ storageCapacityMB: 11 });
  assert.throws(
    () => collectScientificData(resources, rover, "spectrometer"),
    /Data storage limit exceeded/,
  );
  assert.equal(resources.data.storedMB, 0);
  assert.equal(resources.time.elapsedHours, 0);
});

test("transmission spends time and power, moves stored data, and supports repeated collections", () => {
  const rover = validRover();
  const first = collectScientificData(start(), rover, "spectrometer");
  const second = collectScientificData(first, rover, "weather-station");
  const beforeTransmission = second.data.storedMB;
  const sent = transmitMissionData(second, rover);

  assert.equal(sent.data.storedMB, 0);
  assert.equal(sent.data.transmittedMB, beforeTransmission);
  assert.equal(sent.data.generatedMB, beforeTransmission);
  assert.equal(getResourceSummary(sent).data.remainingStorageMB, sent.data.storageCapacityMB);
  assert.ok(sent.time.communicationHours > 0);
  assert.equal(sent.events.at(-1).type, "data-transmitted");
  assert.equal(sent.events.at(-1).resourceChanges.dataTransmittedMB, beforeTransmission);
  assert.ok(sent.budget.operationsCredits > 0);
  assert.ok(sent.budget.communicationCredits > 0);
  assert.equal(
    sent.budget.remainingCredits,
    sent.budget.initialBudgetCredits
      - sent.budget.constructionCredits
      - sent.budget.launchCredits
      - sent.budget.operationsCredits
      - sent.budget.communicationCredits
      - sent.budget.maintenanceCredits,
  );
  assert.equal(sent.events.at(-1).status, "success");
  assert.equal(sent.events.map(({ eventId }) => eventId).length, new Set(sent.events.map(({ eventId }) => eventId)).size);
});

test("failed transmissions increment failure history and retain stored data", () => {
  const rover = validRover();
  const resources = start();
  const noData = transmitMissionData(resources, rover);
  assert.equal(noData.data.transmissionFailures, 1);
  assert.equal(noData.events.at(-1).type, "transmission-failed");
  assert.equal(noData.events.at(-1).status, "failure");
  assert.equal(noData.data.storedMB, 0);

  const collected = collectScientificData(resources, rover, "spectrometer");
  const noLink = transmitMissionData(collected, { ...rover, communications: null });
  assert.equal(noLink.data.transmissionFailures, 1);
  assert.equal(noLink.data.storedMB, collected.data.storedMB);
  assert.match(noLink.lastNotice, /Stored data was retained/);
});

test("mission clock and idle duration enforce the mission limit exactly", () => {
  const rover = validRover();
  const resources = start();
  const complete = advanceMissionTime(resources, rover, resources.time.missionDurationHours);

  assert.equal(complete.time.elapsedHours, 288);
  assert.equal(complete.time.remainingHours, 0);
  assert.equal(getResourceSummary(complete).missionClock, "Sol 013 · 00:00");
  assert.throws(() => advanceMissionTime(complete, rover, 1), /only 0 h remain/);
  assert.throws(() => advanceMissionTime(resources, rover, 0), /greater than zero/);
});

test("maintenance expenditure and duration are tracked separately", () => {
  const resources = recordMaintenance(start(), validRover());
  assert.equal(resources.budget.maintenanceCredits, MISSION_RESOURCE_CONFIG.maintenanceCostCredits);
  assert.equal(resources.time.maintenanceHours, MISSION_RESOURCE_CONFIG.maintenanceDurationHours);
  assert.equal(resources.events.at(-1).type, "maintenance-recorded");
});

test("emergency delays consume mission time and standby energy", () => {
  const resources = recordEmergencyDelay(start(), validRover(), 1);
  assert.equal(resources.time.emergencyDelayHours, 1);
  assert.equal(resources.time.idleHours, 0);
  assert.equal(resources.events.at(-1).type, "emergency-delay-recorded");
});

test("environment changes update solar output but do not alter radioisotope output", () => {
  const rover = validRover();
  const solar = start();
  const solarAtNight = setPowerEnvironment(solar, rover, "night");
  assert.equal(solarAtNight.power.availablePowerW, 0);
  assert.equal(solarAtNight.events.at(-1).type, "power-environment-updated");

  const isotopeRover = { ...rover, power: "radioisotope" };
  const isotope = start({}, isotopeRover);
  const isotopeAtNight = setPowerEnvironment(isotope, isotopeRover, "night");
  assert.equal(isotopeAtNight.power.availablePowerW, 205);
});

test("invalid instruments, unknown environments, and unaffordable data operations are explicit", () => {
  const rover = validRover();
  const resources = start();
  assert.throws(() => collectScientificData(resources, rover, "not-installed"), /Instrument is not installed/);
  assert.throws(() => setPowerEnvironment(resources, rover, "unknown"), /Unknown power environment/);
  assert.throws(() => simulatePowerInterval(resources.power, 0, 1000, 20), /battery reserve/);
});

test("resource snapshots and event records are immutable inputs to deterministic operations", () => {
  const rover = validRover();
  const resources = start();
  const frozen = Object.freeze({
    ...resources,
    power: Object.freeze({ ...resources.power }),
    budget: Object.freeze({ ...resources.budget }),
    data: Object.freeze({ ...resources.data }),
    time: Object.freeze({ ...resources.time }),
    mass: Object.freeze({ ...resources.mass }),
    events: Object.freeze(resources.events.map((event) => Object.freeze({ ...event }))),
  });
  const next = collectScientificData(frozen, rover, "spectrometer");

  assert.equal(frozen.data.storedMB, 0);
  assert.equal(frozen.time.elapsedHours, 0);
  assert.equal(frozen.events.length, 2);
  assert.equal(next.events.length, 4);
  assert.notEqual(next, frozen);
  assert.notEqual(next.events, frozen.events);
});
