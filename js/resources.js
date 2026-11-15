import {
  MISSION_RESOURCE_CONFIG,
  MISSION_CATALOG,
  ROVER_CATEGORIES,
} from "./data.js";
import {
  calculateRoverCost,
  calculateRoverMetrics,
} from "./rover.js";

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

function assertFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, non-negative number.`);
  }
}

function requirePositiveDuration(durationHours) {
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    throw new RangeError("Operation duration must be greater than zero hours.");
  }
}

function getOption(categoryId, optionId) {
  return ROVER_CATEGORIES.find(({ id }) => id === categoryId)
    ?.options.find(({ id }) => id === optionId) ?? null;
}

function getEnvironment(environmentIdOrProfile, settings) {
  const environmentId = typeof environmentIdOrProfile === "object" && environmentIdOrProfile !== null
    ? environmentIdOrProfile.id
    : environmentIdOrProfile ?? settings.initialEnvironmentId;
  const environment = settings.environmentProfiles.find(({ id }) => id === environmentId);
  if (!environment) {
    throw new RangeError(`Unknown power environment: ${environmentId}`);
  }
  for (const key of ["daylightFraction", "dustAccumulation", "solarEfficiency"]) {
    if (!Number.isFinite(environment[key]) || environment[key] < 0 || environment[key] > 1) {
      throw new RangeError(`Power environment ${environment.id} has an invalid ${key}; expected a value from 0 to 1.`);
    }
  }
  return environment;
}

function validateSettings(settings) {
  for (const [key, value] of Object.entries({
    hoursPerSol: settings.hoursPerSol,
    initialBudgetCredits: settings.initialBudgetCredits,
    launchCostCredits: settings.launchCostCredits,
    operationCostCreditsPerHour: settings.operationCostCreditsPerHour,
    communicationCostCreditsPerHour: settings.communicationCostCreditsPerHour,
    maintenanceCostCredits: settings.maintenanceCostCredits,
    batteryCapacityWh: settings.batteryCapacityWh,
    storageCapacityMB: settings.storageCapacityMB,
    megabytesPerDataUnit: settings.megabytesPerDataUnit,
    standbyPowerW: settings.standbyPowerW,
    maintenancePowerW: settings.maintenancePowerW,
    maintenanceDurationHours: settings.maintenanceDurationHours,
    defaultInstrumentOperationHours: settings.defaultInstrumentOperationHours,
    initialBatteryFraction: settings.initialBatteryFraction,
    minimumBatteryFraction: settings.minimumBatteryFraction,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`Resource setting ${key} must be a finite, non-negative number.`);
    }
  }
  if (
    settings.hoursPerSol === 0
    || settings.megabytesPerDataUnit === 0
    || settings.defaultInstrumentOperationHours === 0
    || settings.maintenanceDurationHours === 0
  ) {
    throw new RangeError("Hours per sol, data conversion, and operation durations must be greater than zero.");
  }
  if (settings.initialBatteryFraction > 1 || settings.minimumBatteryFraction > 1) {
    throw new RangeError("Battery fractions must be between zero and one.");
  }
  if (!Number.isFinite(Date.parse(settings.missionStartTime))) {
    throw new RangeError("Mission start time must be a valid ISO-8601 timestamp.");
  }
  if (!Array.isArray(settings.environmentProfiles) || settings.environmentProfiles.length === 0) {
    throw new RangeError("At least one power environment must be configured.");
  }
  getEnvironment(settings.initialEnvironmentId, settings);
}

function installedComponents(configuration) {
  return ROVER_CATEGORIES.flatMap((category) => {
    const selection = configuration?.[category.id];
    const ids = category.id === "instruments"
      ? Array.isArray(selection) ? selection : []
      : selection ? [selection] : [];
    return ids.map((id) => {
      const option = getOption(category.id, id);
      return option ? { categoryId: category.id, ...option } : null;
    }).filter(Boolean);
  });
}

function eventFor(resources, type, description, resourceChanges = {}, status = "success") {
  const sequence = resources.events.length + 1;
  const startTime = Date.parse(resources.missionStartTime);
  const event = {
    eventId: `resource-event-${String(sequence).padStart(4, "0")}`,
    type,
    description,
    status,
    timestamp: new Date(startTime + resources.time.elapsedHours * 60 * 60 * 1000).toISOString(),
    simulationTimeHours: resources.time.elapsedHours,
    simulationTime: formatMissionClock(resources.time.elapsedHours, resources.time.hoursPerSol),
    resourceChanges,
  };
  return {
    ...resources,
    events: [...resources.events, event],
    lastNotice: description,
  };
}

export function formatMissionClock(elapsedHours, hoursPerSol = MISSION_RESOURCE_CONFIG.hoursPerSol) {
  assertFiniteNonNegative(elapsedHours, "Elapsed mission time");
  if (!Number.isFinite(hoursPerSol) || hoursPerSol <= 0) {
    throw new RangeError("Hours per sol must be greater than zero.");
  }
  const sol = Math.floor(elapsedHours / hoursPerSol) + 1;
  const hourOfSol = elapsedHours % hoursPerSol;
  const hours = Math.floor(hourOfSol);
  const minutes = Math.floor((hourOfSol - hours) * 60);
  return `Sol ${String(sol).padStart(3, "0")} · ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function calculateAvailablePower(
  roverConfiguration,
  environmentIdOrProfile,
  settings = MISSION_RESOURCE_CONFIG,
) {
  const nominalGenerationW = calculateRoverMetrics(roverConfiguration).powerGenerationW;
  const powerSource = getOption("power", roverConfiguration?.power);
  const environment = getEnvironment(environmentIdOrProfile, settings);
  const isSolar = powerSource?.id !== "radioisotope";
  const daylightFactor = isSolar ? environment.daylightFraction : 1;
  const dustFactor = isSolar ? 1 - environment.dustAccumulation : 1;
  const efficiency = isSolar ? environment.solarEfficiency : 1;
  const availablePowerW = round(nominalGenerationW * daylightFactor * dustFactor * efficiency);

  return {
    nominalGenerationW,
    availablePowerW,
    environmentId: environment.id,
    isSolar,
    daylightFactor,
    dustFactor,
    solarEfficiency: efficiency,
  };
}

export function calculateEnergyConsumption(
  roverConfiguration,
  { mode = "idle", instrumentId = null, durationHours = 0, movementPowerW = 0 } = {},
  settings = MISSION_RESOURCE_CONFIG,
) {
  assertFiniteNonNegative(durationHours, "Operation duration");
  assertFiniteNonNegative(movementPowerW, "Movement power");
  const components = installedComponents(roverConfiguration);
  const roverOperatingPowerW = ["instrument", "transmit", "movement", "sample"].includes(mode)
    ? components
      .filter(({ categoryId }) => !["instruments", "communications", "power", "landing"].includes(categoryId))
      .reduce((total, component) => total + (component.operatingPowerW ?? 0), 0)
    : 0;
  const instrument = instrumentId ? getOption("instruments", instrumentId) : null;
  if ((mode === "instrument" || mode === "sample") && !instrument) {
    throw new RangeError(`Unknown instrument: ${instrumentId}`);
  }
  const instrumentPowerW = mode === "instrument" || mode === "sample"
    ? instrument.operatingPowerW
    : 0;
  const communication = getOption("communications", roverConfiguration?.communications);
  const communicationPowerW = mode === "transmit"
    ? communication?.operatingPowerW ?? 0
    : 0;
  const maintenancePowerW = mode === "maintenance" ? settings.maintenancePowerW : 0;
  const standbyPowerW = settings.standbyPowerW;
  const operationMovementPowerW = mode === "movement" ? movementPowerW : 0;
  const totalPowerW = round(
    roverOperatingPowerW + instrumentPowerW + communicationPowerW
    + maintenancePowerW + operationMovementPowerW + standbyPowerW,
  );
  assertFiniteNonNegative(totalPowerW, "Total operation power");

  return {
    roverOperatingPowerW,
    instrumentPowerW,
    communicationPowerW,
    maintenancePowerW,
    movementPowerW: operationMovementPowerW,
    standbyPowerW,
    totalPowerW,
    durationHours,
    energyWh: round(totalPowerW * durationHours),
  };
}

export function calculateBatteryLevel(powerState) {
  const capacityWh = powerState?.batteryCapacityWh ?? 0;
  const energyWh = powerState?.batteryEnergyWh ?? 0;
  const fraction = capacityWh > 0 ? Math.max(0, Math.min(1, energyWh / capacityWh)) : 0;
  return {
    energyWh: round(energyWh),
    capacityWh: round(capacityWh),
    fraction: round(fraction, 4),
    percentage: round(fraction * 100, 1),
    status: fraction <= 0.1 ? "critical" : fraction <= 0.25 ? "warning" : "normal",
  };
}

export function validatePowerAvailability(
  powerState,
  availablePowerW,
  loadW,
  durationHours,
  settings = MISSION_RESOURCE_CONFIG,
) {
  const errors = [];
  for (const [value, label] of [
    [availablePowerW, "Available power"],
    [loadW, "Power demand"],
    [durationHours, "Operation duration"],
  ]) {
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${label} must be a finite, non-negative value.`);
    }
  }
  if (!Number.isFinite(powerState?.batteryEnergyWh) || !Number.isFinite(powerState?.batteryCapacityWh)) {
    errors.push("Battery state is unavailable.");
  }
  if (
    Number.isFinite(powerState?.batteryCapacityWh)
    && (powerState.batteryCapacityWh < 0 || powerState.batteryEnergyWh < 0
      || powerState.batteryEnergyWh > powerState.batteryCapacityWh)
  ) {
    errors.push("Battery energy must be between zero and the configured capacity.");
  }
  if (
    !Number.isFinite(settings.minimumBatteryFraction)
    || settings.minimumBatteryFraction < 0
    || settings.minimumBatteryFraction > 1
  ) {
    errors.push("Minimum battery reserve must be a fraction from zero to one.");
  }
  if (errors.length > 0) {
    return { isValid: false, errors, remainingBatteryWh: null };
  }
  const netBatteryChangeWh = (availablePowerW - loadW) * durationHours;
  const remainingBatteryWh = Math.min(
    powerState.batteryCapacityWh,
    Math.max(0, powerState.batteryEnergyWh + netBatteryChangeWh),
  );
  const reserveWh = powerState.batteryCapacityWh * settings.minimumBatteryFraction;
  if (powerState.batteryEnergyWh + netBatteryChangeWh < reserveWh) {
    errors.push(
      `Operation would leave ${round(Math.max(0, powerState.batteryEnergyWh + netBatteryChangeWh))} Wh, below the ${round(reserveWh)} Wh battery reserve.`,
    );
  }
  return { isValid: errors.length === 0, errors, remainingBatteryWh: round(remainingBatteryWh) };
}

export function simulatePowerInterval(
  powerState,
  availablePowerW,
  loadW,
  durationHours,
  settings = MISSION_RESOURCE_CONFIG,
) {
  requirePositiveDuration(durationHours);
  assertFiniteNonNegative(availablePowerW, "Available power");
  assertFiniteNonNegative(loadW, "Power demand");
  const validation = validatePowerAvailability(
    powerState,
    availablePowerW,
    loadW,
    durationHours,
    settings,
  );
  if (!validation.isValid) {
    throw new Error(validation.errors.join(" "));
  }
  const energyGeneratedWh = round(availablePowerW * durationHours);
  const energyConsumedWh = round(loadW * durationHours);
  const batteryEnergyWh = validation.remainingBatteryWh;
  return {
    powerState: {
      ...powerState,
      batteryEnergyWh,
      lastLoadW: round(loadW),
      energyGeneratedWh: round((powerState.energyGeneratedWh ?? 0) + energyGeneratedWh),
      energyConsumedWh: round((powerState.energyConsumedWh ?? 0) + energyConsumedWh),
      status: calculateBatteryLevel({ ...powerState, batteryEnergyWh }).status,
    },
    energyGeneratedWh,
    energyConsumedWh,
    batteryLevel: calculateBatteryLevel({ ...powerState, batteryEnergyWh }),
  };
}

function buildResourceStatus(resources) {
  const battery = calculateBatteryLevel(resources.power);
  const budgetFraction = resources.budget.initialBudgetCredits > 0
    ? resources.budget.remainingCredits / resources.budget.initialBudgetCredits
    : 0;
  const dataFraction = resources.data.storageCapacityMB > 0
    ? resources.data.storedMB / resources.data.storageCapacityMB
    : 0;
  const timeFraction = resources.time.remainingHours / resources.time.missionDurationHours;
  const payloadFraction = resources.mass.payloadCapacityKg > 0
    ? resources.mass.remainingPayloadCapacityKg / resources.mass.payloadCapacityKg
    : 0;
  const classify = (fraction, warningAt = 0.25, criticalAt = 0.1) =>
    fraction <= criticalAt ? "critical" : fraction <= warningAt ? "warning" : "normal";
  return {
    power: battery.status === "critical"
      ? "critical"
      : resources.power.availablePowerW < resources.power.lastLoadW
        ? "warning"
        : battery.status,
    budget: classify(budgetFraction),
    data: classify(1 - dataFraction),
    time: classify(timeFraction),
    mass: classify(payloadFraction),
  };
}

function withStatuses(resources) {
  return { ...resources, status: buildResourceStatus(resources) };
}

export function createMissionResources({
  roverConfiguration,
  missionId,
  missionDurationSols,
  settings = MISSION_RESOURCE_CONFIG,
}) {
  validateSettings(settings);
  if (!Number.isFinite(missionDurationSols) || missionDurationSols <= 0) {
    throw new RangeError("Mission duration must be greater than zero sols.");
  }
  const mission = MISSION_CATALOG.find(({ id }) => id === missionId);
  if (!mission) {
    throw new RangeError(`Unknown mission profile: ${missionId}`);
  }
  const metrics = calculateRoverMetrics(roverConfiguration);
  const constructionCost = calculateRoverCost(roverConfiguration);
  const initialExpenditure = constructionCost + settings.launchCostCredits;
  if (initialExpenditure > settings.initialBudgetCredits) {
    throw new Error("Construction and launch expenditure exceed the initial mission budget.");
  }
  const communication = getOption("communications", roverConfiguration?.communications);
  const missionDurationHours = missionDurationSols * settings.hoursPerSol;
  const installedInstrumentMassKg = metrics.payloadUsedKg;
  const power = calculateAvailablePower(
    roverConfiguration,
    settings.initialEnvironmentId,
    settings,
  );
  const events = [];
  const base = {
    missionId,
    missionStartTime: settings.missionStartTime,
    hoursPerSol: settings.hoursPerSol,
    lastNotice: "",
    power: {
      ...power,
      batteryCapacityWh: settings.batteryCapacityWh,
      batteryEnergyWh: round(settings.batteryCapacityWh * settings.initialBatteryFraction),
      challengePowerFactor: 1,
      equipmentPowerFactor: 1,
      energyGeneratedWh: 0,
      energyConsumedWh: 0,
      lastLoadW: 0,
      lastLoadBreakdownW: {
        roverOperatingPowerW: 0,
        instrumentPowerW: 0,
        communicationPowerW: 0,
        maintenancePowerW: 0,
        movementPowerW: 0,
        standbyPowerW: 0,
      },
      status: "normal",
      environment: getEnvironment(settings.initialEnvironmentId, settings),
    },
    budget: {
      initialBudgetCredits: settings.initialBudgetCredits,
      constructionCredits: constructionCost,
      launchCredits: settings.launchCostCredits,
      operationsCredits: 0,
      communicationCredits: 0,
      maintenanceCredits: 0,
      sampleCredits: 0,
      challengeCredits: 0,
      remainingCredits: settings.initialBudgetCredits - initialExpenditure,
    },
    data: {
      generatedMB: 0,
      storedMB: 0,
      transmittedMB: 0,
      storageCapacityMB: settings.storageCapacityMB,
      communicationCapacityMBPerSol:
        (communication?.dataCapacityUnitsPerSol ?? 0) * settings.megabytesPerDataUnit,
      transmissionFailures: 0,
    },
    time: {
      hoursPerSol: settings.hoursPerSol,
      elapsedHours: 0,
      missionDurationHours,
      remainingHours: missionDurationHours,
      roverOperationHours: 0,
      instrumentOperationHours: 0,
      communicationHours: 0,
      idleHours: 0,
      emergencyDelayHours: 0,
      maintenanceHours: 0,
      movementHours: 0,
      sampleCollectionHours: 0,
    },
    mass: {
      roverDryMassKg: round(metrics.totalMassKg - installedInstrumentMassKg),
      installedInstrumentMassKg,
      payloadMassKg: 0,
      payloadCapacityKg: metrics.payloadCapacityKg ?? 0,
      remainingPayloadCapacityKg: metrics.payloadRemainingKg ?? 0,
      totalDeployedMassKg: metrics.totalMassKg,
    },
    events,
  };

  let initialized = eventFor(
    base,
    "construction-expenditure",
    `Rover construction charged ${constructionCost} credits.`,
    { budgetCredits: -constructionCost },
  );
  initialized = eventFor(
    initialized,
    "launch-expenditure",
    `Mission launch expenditure charged ${settings.launchCostCredits} credits.`,
    { budgetCredits: -settings.launchCostCredits },
  );
  return withStatuses(initialized);
}

function validateTime(resources, durationHours) {
  requirePositiveDuration(durationHours);
  if (durationHours > resources.time.remainingHours) {
    throw new Error(
      `Operation needs ${durationHours} h, but only ${round(resources.time.remainingHours)} h remain in the mission.`,
    );
  }
}

function calculateOperationCost(mode, durationHours, settings) {
  return calculateTimedOperationExpense(mode, durationHours, settings);
}

export function calculateTimedOperationExpense(
  mode,
  durationHours,
  settings = MISSION_RESOURCE_CONFIG,
) {
  assertFiniteNonNegative(durationHours, "Operation duration");
  const operationsCredits = mode === "maintenance"
    ? 0
    : durationHours * settings.operationCostCreditsPerHour;
  const communicationCredits = mode === "transmit"
    ? durationHours * settings.communicationCostCreditsPerHour
    : 0;
  return {
    operationsCredits: round(operationsCredits),
    communicationCredits: round(communicationCredits),
    totalCredits: round(operationsCredits + communicationCredits),
  };
}

export function estimateMissionOperationExpenses(
  instrumentOperationHours,
  communicationHours,
  settings = MISSION_RESOURCE_CONFIG,
) {
  assertFiniteNonNegative(instrumentOperationHours, "Instrument operation time");
  assertFiniteNonNegative(communicationHours, "Communication time");
  const instrument = calculateTimedOperationExpense(
    "instrument",
    instrumentOperationHours,
    settings,
  );
  const communication = calculateTimedOperationExpense(
    "transmit",
    communicationHours,
    settings,
  );
  return {
    operationsCredits: round(instrument.operationsCredits + communication.operationsCredits),
    communicationCredits: communication.communicationCredits,
    maintenanceCredits: settings.maintenanceCostCredits,
    totalCredits: round(
      instrument.totalCredits
      + communication.totalCredits
      + settings.maintenanceCostCredits,
    ),
  };
}

function applyTimedOperation(resources, roverConfiguration, {
  type,
  description,
  mode,
  durationHours,
  instrumentId = null,
  dataGeneratedMB = 0,
  dataTransmittedMB = 0,
  clearStoredData = false,
  movementPowerW = 0,
  sampleMassKg = 0,
  budgetCategory = "operationsCredits",
  fixedCostCredits = null,
}, settings) {
  validateTime(resources, durationHours);
  const costBreakdown = fixedCostCredits === null
    ? calculateOperationCost(mode, durationHours, settings)
    : {
      operationsCredits: 0,
      communicationCredits: 0,
      totalCredits: fixedCostCredits,
    };
  assertFiniteNonNegative(costBreakdown.totalCredits, "Operation expenditure");
  const expenditure = costBreakdown.totalCredits;
  if (expenditure > resources.budget.remainingCredits) {
    throw new Error(
      `Operation costs ${expenditure} credits, but only ${resources.budget.remainingCredits} credits remain.`,
    );
  }
  if (dataGeneratedMB > resources.data.storageCapacityMB - resources.data.storedMB) {
    throw new Error(
      `Data storage limit exceeded: ${round(resources.data.storageCapacityMB - resources.data.storedMB)} MB remain, but the operation generates ${round(dataGeneratedMB)} MB.`,
    );
  }
  if (sampleMassKg > resources.mass.remainingPayloadCapacityKg) {
    throw new Error(
      `Sample payload limit exceeded: ${round(resources.mass.remainingPayloadCapacityKg)} kg remain, but the sample weighs ${round(sampleMassKg)} kg.`,
    );
  }

  const energy = calculateEnergyConsumption(
    roverConfiguration,
    { mode, instrumentId, durationHours, movementPowerW },
    settings,
  );
  const powerResult = simulatePowerInterval(
    resources.power,
    resources.power.availablePowerW,
    energy.totalPowerW,
    durationHours,
    settings,
  );
  const elapsedHours = round(resources.time.elapsedHours + durationHours);
  const time = {
    ...resources.time,
    elapsedHours,
    remainingHours: round(resources.time.missionDurationHours - elapsedHours),
    roverOperationHours: round(resources.time.roverOperationHours + (["instrument", "transmit", "movement", "sample"].includes(mode) ? durationHours : 0)),
    instrumentOperationHours: round(resources.time.instrumentOperationHours + (mode === "instrument" ? durationHours : 0)),
    communicationHours: round(resources.time.communicationHours + (mode === "transmit" ? durationHours : 0)),
    idleHours: round(resources.time.idleHours + (mode === "idle" ? durationHours : 0)),
    emergencyDelayHours: round(resources.time.emergencyDelayHours + (mode === "emergency-delay" ? durationHours : 0)),
    maintenanceHours: round(resources.time.maintenanceHours + (mode === "maintenance" ? durationHours : 0)),
    movementHours: round(resources.time.movementHours + (mode === "movement" ? durationHours : 0)),
    sampleCollectionHours: round(resources.time.sampleCollectionHours + (mode === "sample" ? durationHours : 0)),
  };
  const budget = {
    ...resources.budget,
    operationsCredits: round(resources.budget.operationsCredits + costBreakdown.operationsCredits),
    communicationCredits: round(resources.budget.communicationCredits + costBreakdown.communicationCredits),
    ...(fixedCostCredits === null
      ? {}
      : { [budgetCategory]: round(resources.budget[budgetCategory] + expenditure) }),
    remainingCredits: round(resources.budget.remainingCredits - expenditure),
  };
  const data = dataGeneratedMB > 0
    ? {
      ...resources.data,
      generatedMB: round(resources.data.generatedMB + dataGeneratedMB),
      storedMB: round(resources.data.storedMB + dataGeneratedMB),
    }
    : dataTransmittedMB > 0
      ? {
        ...resources.data,
        storedMB: clearStoredData ? 0 : resources.data.storedMB,
        transmittedMB: round(resources.data.transmittedMB + dataTransmittedMB),
      }
      : resources.data;
  const next = {
    ...resources,
    power: {
      ...powerResult.powerState,
      lastLoadBreakdownW: {
        roverOperatingPowerW: energy.roverOperatingPowerW,
        instrumentPowerW: energy.instrumentPowerW,
        communicationPowerW: energy.communicationPowerW,
        maintenancePowerW: energy.maintenancePowerW,
        standbyPowerW: energy.standbyPowerW,
        movementPowerW: energy.movementPowerW,
      },
    },
    budget,
    data,
    time,
    mass: sampleMassKg > 0
      ? {
        ...resources.mass,
        payloadMassKg: round(resources.mass.payloadMassKg + sampleMassKg),
        remainingPayloadCapacityKg: round(resources.mass.remainingPayloadCapacityKg - sampleMassKg),
      }
      : resources.mass,
  };
  const result = withStatuses(next);
  return eventFor(result, type, description, {
    elapsedHours: durationHours,
    energyConsumedWh: -powerResult.energyConsumedWh,
    energyGeneratedWh: powerResult.energyGeneratedWh,
    batteryEnergyWh: round(powerResult.batteryLevel.energyWh - resources.power.batteryEnergyWh),
    budgetCredits: -expenditure,
    operationsCredits: -costBreakdown.operationsCredits,
    communicationCredits: -costBreakdown.communicationCredits,
    maintenanceCredits: budgetCategory === "maintenanceCredits" ? -expenditure : 0,
    sampleCredits: budgetCategory === "sampleCredits" ? -expenditure : 0,
    sampleMassKg,
    dataStoredMB: dataGeneratedMB - (clearStoredData ? dataTransmittedMB : 0),
    dataTransmittedMB,
  });
}

export function collectScientificData(
  resources,
  roverConfiguration,
  instrumentId,
  durationHours = MISSION_RESOURCE_CONFIG.defaultInstrumentOperationHours,
  settings = MISSION_RESOURCE_CONFIG,
) {
  const instrument = getOption("instruments", instrumentId);
  if (!instrument || !roverConfiguration?.instruments?.includes(instrumentId)) {
    throw new RangeError(`Instrument is not installed: ${instrumentId}`);
  }
  const dataGeneratedMB = round(
    instrument.dataUnitsPerOperation * settings.megabytesPerDataUnit,
  );
  const activated = eventFor(
    resources,
    "instrument-activated",
    `${instrument.name} activated for a ${durationHours} h science operation.`,
  );
  return applyTimedOperation(activated, roverConfiguration, {
    type: "scientific-data-collected",
    description: `${instrument.name} operated for ${durationHours} h and collected ${dataGeneratedMB} MB of illustrative mission data.`,
    mode: "instrument",
    durationHours,
    instrumentId,
    dataGeneratedMB,
  }, settings);
}

function recordTransmissionFailure(resources, reason) {
  const failed = {
    ...resources,
    data: {
      ...resources.data,
      transmissionFailures: resources.data.transmissionFailures + 1,
    },
  };
  return eventFor(
    withStatuses(failed),
    "transmission-failed",
    `Data transmission failed: ${reason} Stored data was retained.`,
    { transmissionFailures: 1, dataStoredMB: 0 },
    "failure",
  );
}

export function transmitMissionData(
  resources,
  roverConfiguration,
  settings = MISSION_RESOURCE_CONFIG,
) {
  if (!roverConfiguration?.communications) {
    return recordTransmissionFailure(resources, "no communication system is installed.");
  }
  if (resources.data.storedMB <= 0) {
    return recordTransmissionFailure(resources, "there is no stored data to send.");
  }
  const capacityMBPerHour =
    resources.data.communicationCapacityMBPerSol / resources.time.hoursPerSol;
  if (capacityMBPerHour <= 0) {
    return recordTransmissionFailure(resources, "the selected link has no transmission capacity.");
  }
  const dataToTransmitMB = resources.data.storedMB;
  const durationHours = round(dataToTransmitMB / capacityMBPerHour, 4);
  try {
    const sent = applyTimedOperation(resources, roverConfiguration, {
      type: "data-transmitted",
      description: `Transmitted ${dataToTransmitMB} MB of stored mission data in ${durationHours} h.`,
      mode: "transmit",
      durationHours,
      dataTransmittedMB: dataToTransmitMB,
      clearStoredData: true,
    }, settings);
    return withStatuses(sent);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return recordTransmissionFailure(resources, error.message);
  }
}

export function advanceMissionTime(
  resources,
  roverConfiguration,
  durationHours,
  settings = MISSION_RESOURCE_CONFIG,
) {
  return applyTimedOperation(resources, roverConfiguration, {
    type: "mission-time-advanced",
    description: `Advanced mission time by ${durationHours} h in standby.`,
    mode: "idle",
    durationHours,
  }, settings);
}

export function recordEmergencyDelay(
  resources,
  roverConfiguration,
  durationHours,
  settings = MISSION_RESOURCE_CONFIG,
) {
  return applyTimedOperation(resources, roverConfiguration, {
    type: "emergency-delay-recorded",
    description: `Recorded an emergency delay of ${durationHours} h; mission clock and standby power advanced.`,
    mode: "emergency-delay",
    durationHours,
  }, settings);
}

export function recordChallengeConsequences(
  resources,
  roverConfiguration,
  {
    challengeId,
    description,
    durationHours = 0,
    batteryDeltaWh = 0,
    environmentalPowerFactor = null,
    equipmentPowerFactor = null,
    budgetCostCredits = 0,
    settings = MISSION_RESOURCE_CONFIG,
  } = {},
) {
  if (typeof challengeId !== "string" || challengeId.length === 0) {
    throw new TypeError("Challenge consequences require a challenge identifier.");
  }
  if (typeof description !== "string" || description.length === 0) {
    throw new TypeError("Challenge consequences require a description.");
  }
  assertFiniteNonNegative(durationHours, "Challenge duration");
  assertFiniteNonNegative(budgetCostCredits, "Challenge budget cost");
  if (!Number.isFinite(batteryDeltaWh)) {
    throw new RangeError("Challenge battery change must be a finite number.");
  }
  for (const [label, factor] of [
    ["Environmental power factor", environmentalPowerFactor],
    ["Equipment power factor", equipmentPowerFactor],
  ]) {
    if (factor !== null && (!Number.isFinite(factor) || factor < 0 || factor > 1)) {
      throw new RangeError(`${label} must be a number from zero to one.`);
    }
  }
  const timed = durationHours > 0
    ? recordEmergencyDelay(resources, roverConfiguration, durationHours, settings)
    : resources;
  if (budgetCostCredits > timed.budget.remainingCredits) {
    throw new Error(
      `Challenge response costs ${budgetCostCredits} credits after timed operation costs, but only ${timed.budget.remainingCredits} credits remain.`,
    );
  }
  const batteryEnergyWh = round(timed.power.batteryEnergyWh + batteryDeltaWh);
  if (batteryEnergyWh < 0 || batteryEnergyWh > timed.power.batteryCapacityWh) {
    throw new Error(
      `Challenge response would leave ${batteryEnergyWh} Wh in the battery, outside its 0–${timed.power.batteryCapacityWh} Wh capacity.`,
    );
  }
  const basePower = calculateAvailablePower(
    roverConfiguration,
    timed.power.environment,
    settings,
  );
  const challengePowerFactor = environmentalPowerFactor === null || !basePower.isSolar
    ? timed.power.challengePowerFactor ?? 1
    : environmentalPowerFactor;
  const equipmentFactor = equipmentPowerFactor
    ?? timed.power.equipmentPowerFactor
    ?? 1;
  const power = {
    ...timed.power,
    ...basePower,
    challengePowerFactor,
    equipmentPowerFactor: equipmentFactor,
    availablePowerW: round(basePower.availablePowerW * challengePowerFactor * equipmentFactor),
    batteryEnergyWh,
    energyConsumedWh: round(
      timed.power.energyConsumedWh + Math.max(0, -batteryDeltaWh),
    ),
    energyGeneratedWh: round(
      timed.power.energyGeneratedWh + Math.max(0, batteryDeltaWh),
    ),
    status: calculateBatteryLevel({ ...timed.power, batteryEnergyWh }).status,
  };
  const next = withStatuses({
    ...timed,
    power,
    budget: {
      ...timed.budget,
      challengeCredits: round((timed.budget.challengeCredits ?? 0) + budgetCostCredits),
      remainingCredits: round(timed.budget.remainingCredits - budgetCostCredits),
    },
  });
  return eventFor(
    next,
    "challenge-consequence",
    description,
    {
      challengeId,
      elapsedHours: durationHours,
      batteryEnergyWh: round(batteryEnergyWh - resources.power.batteryEnergyWh),
      batteryPenaltyWh: batteryDeltaWh,
      availablePowerW: round(power.availablePowerW - resources.power.availablePowerW),
      budgetCredits: -budgetCostCredits,
    },
  );
}

export function recordMaintenance(
  resources,
  roverConfiguration,
  settings = MISSION_RESOURCE_CONFIG,
) {
  return applyTimedOperation(resources, roverConfiguration, {
    type: "maintenance-recorded",
    description: `Recorded maintenance lasting ${settings.maintenanceDurationHours} h and costing ${settings.maintenanceCostCredits} credits.`,
    mode: "maintenance",
    durationHours: settings.maintenanceDurationHours,
    budgetCategory: "maintenanceCredits",
    fixedCostCredits: settings.maintenanceCostCredits,
  }, settings);
}

export function recordMissionMovement(
  resources,
  roverConfiguration,
  { durationHours, movementPowerW, settings = MISSION_RESOURCE_CONFIG } = {},
) {
  requirePositiveDuration(durationHours);
  return applyTimedOperation(resources, roverConfiguration, {
    type: "rover-moved",
    description: `Rover movement completed in ${durationHours} h.`,
    mode: "movement",
    durationHours,
    movementPowerW,
  }, settings);
}

export function recordMissionSampleCollection(
  resources,
  roverConfiguration,
  { sampleMassKg, durationHours, costCredits, settings = MISSION_RESOURCE_CONFIG } = {},
) {
  requirePositiveDuration(durationHours);
  assertFiniteNonNegative(sampleMassKg, "Sample mass");
  assertFiniteNonNegative(costCredits, "Sample collection cost");
  if (!roverConfiguration?.instruments?.includes("regolith-sampler")) {
    throw new Error("Sample collection requires an installed regolith sampling system.");
  }
  return applyTimedOperation(resources, roverConfiguration, {
    type: "sample-collected",
    description: `Collected an illustrative ${sampleMassKg} kg sample.`,
    mode: "sample",
    instrumentId: "regolith-sampler",
    durationHours,
    sampleMassKg,
    budgetCategory: "sampleCredits",
    fixedCostCredits: costCredits,
  }, settings);
}

export function setPowerEnvironment(
  resources,
  roverConfiguration,
  environmentId,
  settings = MISSION_RESOURCE_CONFIG,
) {
  const environment = getEnvironment(environmentId, settings);
  const availability = calculateAvailablePower(roverConfiguration, environment, settings);
  const challengePowerFactor = resources.power.challengePowerFactor ?? 1;
  const equipmentPowerFactor = resources.power.equipmentPowerFactor ?? 1;
  const next = {
    ...resources,
    power: {
      ...resources.power,
      ...availability,
      challengePowerFactor,
      equipmentPowerFactor,
      availablePowerW: round(
        availability.availablePowerW * challengePowerFactor * equipmentPowerFactor,
      ),
      environment,
    },
  };
  return eventFor(
    withStatuses(next),
    "power-environment-updated",
    `Power environment set to ${environment.label}; available generation is ${next.power.availablePowerW} W.`,
    {
      availablePowerW: round(
        next.power.availablePowerW - resources.power.availablePowerW,
      ),
    },
  );
}

export function getResourceSummary(resources) {
  const battery = calculateBatteryLevel(resources.power);
  return {
    missionClock: formatMissionClock(resources.time.elapsedHours, resources.time.hoursPerSol),
    power: {
      nominalGenerationW: resources.power.nominalGenerationW,
      availablePowerW: resources.power.availablePowerW,
      currentLoadW: resources.power.lastLoadW,
      powerMarginW: round(resources.power.availablePowerW - resources.power.lastLoadW),
      batteryEnergyWh: battery.energyWh,
      batteryCapacityWh: battery.capacityWh,
      batteryPercentage: battery.percentage,
      energyConsumedWh: resources.power.energyConsumedWh,
      status: resources.status.power,
    },
    budget: {
      ...resources.budget,
      spentCredits:
        resources.budget.constructionCredits
        + resources.budget.launchCredits
        + resources.budget.operationsCredits
        + resources.budget.communicationCredits
        + resources.budget.maintenanceCredits
        + resources.budget.sampleCredits
        + (resources.budget.challengeCredits ?? 0),
      status: resources.status.budget,
    },
    data: {
      ...resources.data,
      remainingStorageMB: round(
        resources.data.storageCapacityMB - resources.data.storedMB,
      ),
      storageUtilizationPercentage: resources.data.storageCapacityMB > 0
        ? round(resources.data.storedMB / resources.data.storageCapacityMB * 100, 1)
        : 0,
      status: resources.status.data,
    },
    time: { ...resources.time, status: resources.status.time },
    mass: { ...resources.mass, status: resources.status.mass },
    status: resources.status,
  };
}
