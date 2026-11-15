import {
  ENGINEERING_LIMITS,
  LANDING_SITES,
  MISSION_CATALOG,
  MISSION_PLANNING_LIMITS,
  MISSION_RESOURCE_CONFIG,
  MISSION_STRATEGIES,
  ROVER_CATEGORIES,
  SCIENCE_CAPABILITY_REQUIREMENTS,
  SCIENCE_OBJECTIVES,
} from "./data.js";
import {
  calculateRoverMetrics,
  getScientificCapabilities,
  validateRoverConfiguration,
} from "./rover.js";
import {
  calculateAvailablePower,
  calculateEnergyConsumption,
  estimateMissionOperationExpenses,
  simulatePowerInterval,
} from "./resources.js";

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};
const KNOWN_OBJECTIVES = new Set(SCIENCE_OBJECTIVES.map(({ id }) => id));

function findMission(missionId) {
  return MISSION_CATALOG.find(({ id }) => id === missionId) ?? null;
}

function findSite(siteId) {
  return LANDING_SITES.find(({ id }) => id === siteId) ?? null;
}

function findStrategy(strategyId) {
  return MISSION_STRATEGIES.find(({ id }) => id === strategyId) ?? null;
}

function findOption(categoryId, optionId) {
  return ROVER_CATEGORIES.find(({ id }) => id === categoryId)
    ?.options.find(({ id }) => id === optionId) ?? null;
}

function selectedObjectives(configuration = {}) {
  return [...(Array.isArray(configuration.objectivePriorities)
    ? configuration.objectivePriorities
    : [])]
    .filter(({ objectiveId }) => KNOWN_OBJECTIVES.has(objectiveId))
    .sort((left, right) => left.priority - right.priority);
}

function canonicalConfiguration(configuration = {}) {
  return {
    missionName: configuration.missionName ?? "",
    missionProfileId: configuration.missionProfileId ?? null,
    landingSiteId: configuration.landingSiteId ?? null,
    durationSols: configuration.durationSols,
    objectivePriorities: [...(Array.isArray(configuration.objectivePriorities)
      ? configuration.objectivePriorities
      : [])]
      .map(({ objectiveId, priority }) => ({ objectiveId, priority }))
      .sort((left, right) => left.objectiveId.localeCompare(right.objectiveId)),
    strategyId: configuration.strategyId ?? null,
  };
}

export function createMissionPlanConfiguration(
  missionProfileId,
  landingSiteId = LANDING_SITES[0]?.id ?? null,
) {
  const mission = findMission(missionProfileId);
  return {
    missionName: mission ? `${mission.title} Mission` : "",
    missionProfileId: missionProfileId ?? null,
    landingSiteId,
    durationSols: mission ? Number.parseFloat(mission.duration) : 0,
    objectivePriorities: SCIENCE_OBJECTIVES.map(({ id }, index) => ({
      objectiveId: id,
      priority: index + 1,
    })),
    strategyId: "balanced",
  };
}

export function validatePlanningInputs(configuration = {}) {
  const checks = [
    {
      id: "mission-profile",
      passed: Boolean(findMission(configuration.missionProfileId)),
      message: "Choose an available mission profile.",
    },
    {
      id: "mission-name",
      passed: typeof configuration.missionName === "string"
        && configuration.missionName.trim().length > 0
        && configuration.missionName.trim().length <= 80,
      message: "Enter a mission name of 1–80 characters.",
    },
    {
      id: "landing-site",
      passed: Boolean(findSite(configuration.landingSiteId)),
      message: "Choose an available conceptual landing site.",
    },
    {
      id: "mission-duration",
      passed: Number.isFinite(configuration.durationSols)
        && Number.isInteger(configuration.durationSols)
        && configuration.durationSols >= MISSION_PLANNING_LIMITS.minimumDurationSols
        && configuration.durationSols <= MISSION_PLANNING_LIMITS.maximumDurationSols,
      message: `Set mission duration from ${MISSION_PLANNING_LIMITS.minimumDurationSols} to ${MISSION_PLANNING_LIMITS.maximumDurationSols} sols.`,
    },
    {
      id: "science-objectives",
      passed: selectedObjectives(configuration).length > 0,
      message: "Select at least one scientific objective.",
    },
    {
      id: "objective-priorities",
      passed: (Array.isArray(configuration.objectivePriorities)
        ? configuration.objectivePriorities
        : []).every(
        ({ objectiveId, priority }) => KNOWN_OBJECTIVES.has(objectiveId)
          && Number.isInteger(priority)
          && priority >= 1
          && priority <= SCIENCE_OBJECTIVES.length,
      ),
      message: "Assign each selected objective a priority from 1 to 4.",
    },
    {
      id: "operational-strategy",
      passed: Boolean(findStrategy(configuration.strategyId)),
      message: "Choose an operational strategy.",
    },
  ];
  return {
    isValid: checks.every(({ passed }) => passed),
    checks,
    errors: checks.filter(({ passed }) => !passed),
  };
}

function plannedInstrumentIds(configuration, roverConfiguration) {
  const installed = new Set(roverConfiguration?.instruments ?? []);
  const planned = new Set();
  for (const { objectiveId } of selectedObjectives(configuration)) {
    const requirements = SCIENCE_CAPABILITY_REQUIREMENTS.find(
      ({ objectiveId: id }) => id === objectiveId,
    );
    for (const capability of requirements?.requiredCapabilities ?? []) {
      const instrumentId = capability.instrumentIds.find((id) => installed.has(id));
      if (instrumentId) {
        planned.add(instrumentId);
      }
    }
  }
  return [...planned];
}

function calculateIntervals(roverConfiguration, instrumentIds, communicationHours, settings) {
  const intervals = instrumentIds.map((instrumentId) => ({
    durationHours: MISSION_PLANNING_LIMITS.instrumentOperationHours,
    loadW: calculateEnergyConsumption(roverConfiguration, {
      mode: "instrument",
      instrumentId,
      durationHours: MISSION_PLANNING_LIMITS.instrumentOperationHours,
    }, settings).totalPowerW,
  }));
  if (communicationHours > 0) {
    intervals.push({
      durationHours: communicationHours,
      loadW: calculateEnergyConsumption(roverConfiguration, {
        mode: "transmit",
        durationHours: communicationHours,
      }, settings).totalPowerW,
    });
  }
  if (settings.maintenanceDurationHours > 0) {
    intervals.push({
      durationHours: settings.maintenanceDurationHours,
      loadW: calculateEnergyConsumption(roverConfiguration, {
        mode: "maintenance",
        durationHours: settings.maintenanceDurationHours,
      }, settings).totalPowerW,
    });
  }
  return intervals;
}

export function calculateMissionEstimates(configuration, roverConfiguration) {
  const mission = findMission(configuration?.missionProfileId);
  const site = findSite(configuration?.landingSiteId);
  const metrics = calculateRoverMetrics(roverConfiguration, {
    selectedLandingSiteId: site?.id,
  });
  const durationSols = Number.isFinite(configuration?.durationSols)
    ? Math.max(0, configuration.durationSols)
    : 0;
  const missionDurationHours = durationSols * MISSION_RESOURCE_CONFIG.hoursPerSol;
  const instrumentIds = plannedInstrumentIds(configuration, roverConfiguration);
  const instrumentOptions = instrumentIds
    .map((id) => findOption("instruments", id))
    .filter(Boolean);
  const instrumentOperationHours =
    instrumentIds.length * MISSION_PLANNING_LIMITS.instrumentOperationHours;
  const expectedDataMB = round(instrumentOptions.reduce(
    (total, instrument) => total
      + instrument.dataUnitsPerOperation * MISSION_RESOURCE_CONFIG.megabytesPerDataUnit,
    0,
  ));
  const communication = findOption("communications", roverConfiguration?.communications);
  const communicationCapacityMBPerSol =
    (communication?.dataCapacityUnitsPerSol ?? 0)
    * MISSION_RESOURCE_CONFIG.megabytesPerDataUnit;
  const communicationCapacityMBPerHour =
    communicationCapacityMBPerSol / MISSION_RESOURCE_CONFIG.hoursPerSol;
  const communicationHours = communicationCapacityMBPerHour > 0
    ? round(expectedDataMB / communicationCapacityMBPerHour)
    : 0;
  const maintenanceAllowanceHours = MISSION_RESOURCE_CONFIG.maintenanceDurationHours;
  const emergencyReserveHours = round(
    missionDurationHours * MISSION_PLANNING_LIMITS.emergencyReserveFraction,
  );
  const requiredHours = round(
    instrumentOperationHours
    + communicationHours
    + maintenanceAllowanceHours
    + emergencyReserveHours,
  );
  const environmentId = site?.powerEnvironmentId
    ?? MISSION_RESOURCE_CONFIG.initialEnvironmentId;
  const power = calculateAvailablePower(
    roverConfiguration,
    environmentId,
    MISSION_RESOURCE_CONFIG,
  );
  const intervals = calculateIntervals(
    roverConfiguration,
    instrumentIds,
    communicationHours,
    MISSION_RESOURCE_CONFIG,
  );
  const emergencyInterval = {
    durationHours: emergencyReserveHours,
    loadW: MISSION_RESOURCE_CONFIG.standbyPowerW,
  };
  if (emergencyReserveHours > 0) {
    intervals.push(emergencyInterval);
  }
  const initialBatteryWh =
    MISSION_RESOURCE_CONFIG.batteryCapacityWh
    * MISSION_RESOURCE_CONFIG.initialBatteryFraction;
  let powerState = {
    batteryCapacityWh: MISSION_RESOURCE_CONFIG.batteryCapacityWh,
    batteryEnergyWh: initialBatteryWh,
    energyGeneratedWh: 0,
    energyConsumedWh: 0,
  };
  let energyConsumedWh = 0;
  let peakLoadW = 0;
  for (const interval of intervals) {
    const simulated = simulatePowerInterval(
      powerState,
      power.availablePowerW,
      interval.loadW,
      interval.durationHours,
      { ...MISSION_RESOURCE_CONFIG, minimumBatteryFraction: 0 },
    );
    powerState = simulated.powerState;
    energyConsumedWh += simulated.energyConsumedWh;
    peakLoadW = Math.max(peakLoadW, interval.loadW);
  }
  const launchCredits = MISSION_RESOURCE_CONFIG.launchCostCredits;
  const expenses = estimateMissionOperationExpenses(
    instrumentOperationHours,
    communicationHours,
    MISSION_RESOURCE_CONFIG,
  );
  const operationCredits = expenses.operationsCredits;
  const communicationCredits = expenses.communicationCredits;
  const maintenanceCredits = expenses.maintenanceCredits;
  const plannedOperatingCredits = expenses.totalCredits;
  const totalPlannedCredits = round(
    metrics.totalCostCredits + launchCredits + plannedOperatingCredits,
  );
  const budgetRemainingCredits = round(
    MISSION_RESOURCE_CONFIG.initialBudgetCredits - totalPlannedCredits,
  );

  return {
    mission: mission ? { id: mission.id, title: mission.title } : null,
    site: site ? { id: site.id, name: site.name } : null,
    instrumentIds,
    budget: {
      availableCredits: MISSION_RESOURCE_CONFIG.initialBudgetCredits,
      constructionCredits: metrics.totalCostCredits,
      launchCredits,
      plannedOperationsCredits: operationCredits,
      plannedCommunicationsCredits: communicationCredits,
      maintenanceCredits,
      plannedOperatingCredits,
      totalPlannedCredits,
      remainingCredits: budgetRemainingCredits,
    },
    power: {
      systemName: findOption("power", roverConfiguration?.power)?.name ?? "Not selected",
      nominalGenerationW: metrics.powerGenerationW,
      estimatedAvailablePowerW: power.availablePowerW,
      estimatedPeakLoadW: round(peakLoadW),
      estimatedPowerMarginW: round(power.availablePowerW - peakLoadW),
      batteryCapacityWh: MISSION_RESOURCE_CONFIG.batteryCapacityWh,
      estimatedBatteryReserveWh: round(powerState.batteryEnergyWh),
      estimatedBatteryReservePercentage: MISSION_RESOURCE_CONFIG.batteryCapacityWh > 0
        ? round(powerState.batteryEnergyWh / MISSION_RESOURCE_CONFIG.batteryCapacityWh * 100, 1)
        : 0,
      environmentLabel: site
        ? MISSION_RESOURCE_CONFIG.environmentProfiles.find(({ id }) => id === environmentId)?.label
        : null,
      estimatedEnergyConsumptionWh: round(energyConsumedWh),
    },
    data: {
      expectedScienceDataMB: expectedDataMB,
      storageCapacityMB: MISSION_RESOURCE_CONFIG.storageCapacityMB,
      communicationCapacityMBPerSol,
      estimatedTransmissionHours: communicationHours,
      plannedInstrumentIds: instrumentIds,
    },
    time: {
      durationSols,
      durationHours: missionDurationHours,
      instrumentOperationHours,
      communicationHours,
      maintenanceAllowanceHours,
      emergencyReserveHours,
      requiredHours,
      planningHoursRemaining: round(missionDurationHours - requiredHours),
    },
    mass: {
      roverMassKg: metrics.totalMassKg,
      instrumentPayloadMassKg: metrics.payloadUsedKg,
      remainingPayloadCapacityKg: metrics.payloadRemainingKg,
      payloadCapacityKg: metrics.payloadCapacityKg,
    },
  };
}

function risk(id, category, severity, description, reason, mitigation, blocksValidation = false) {
  return {
    id,
    category,
    severity,
    description,
    reason,
    mitigation,
    blocksValidation,
  };
}

export function assessMissionRisks(configuration, roverConfiguration, estimates = null) {
  const resourceEstimates = estimates
    ?? calculateMissionEstimates(configuration, roverConfiguration);
  const selectedIds = selectedObjectives(configuration).map(({ objectiveId }) => objectiveId);
  const site = findSite(configuration?.landingSiteId);
  const metrics = calculateRoverMetrics(roverConfiguration, {
    selectedLandingSiteId: site?.id,
  });
  const roverValidation = validateRoverConfiguration(roverConfiguration, ENGINEERING_LIMITS, {
    selectedLandingSiteId: site?.id,
    objectiveIds: selectedIds,
  });
  const capabilities = new Map(
    getScientificCapabilities(roverConfiguration)
      .map((item) => [item.objectiveId, item]),
  );
  const missingCapabilities = selectedIds.filter(
    (id) => capabilities.get(id)?.coverageStatus !== "ready",
  );
  const powerCheckFailed = metrics.powerGenerationW <= 0
    || metrics.powerMarginW < ENGINEERING_LIMITS.minPowerMarginW
    || resourceEstimates.power.estimatedBatteryReserveWh
      < MISSION_RESOURCE_CONFIG.batteryCapacityWh
        * MISSION_RESOURCE_CONFIG.minimumBatteryFraction;
  const budgetFraction = resourceEstimates.budget.availableCredits > 0
    ? resourceEstimates.budget.remainingCredits / resourceEstimates.budget.availableCredits
    : 0;
  const budgetViolation = resourceEstimates.budget.remainingCredits < 0
    || resourceEstimates.budget.constructionCredits
      > ENGINEERING_LIMITS.maxConstructionBudgetCredits;
  const storageFraction = resourceEstimates.data.storageCapacityMB > 0
    ? resourceEstimates.data.expectedScienceDataMB / resourceEstimates.data.storageCapacityMB
    : 0;
  const remainingTimeFraction = resourceEstimates.time.durationHours > 0
    ? resourceEstimates.time.planningHoursRemaining / resourceEstimates.time.durationHours
    : 0;
  const siteFit = metrics.environmentalSuitability;
  const scheduleOverrun = resourceEstimates.time.planningHoursRemaining < 0;
  const siteObjectiveMatches = site
    ? selectedIds.some((id) => site.objectiveSuitability.includes(id))
    : false;

  return [
    risk(
      "power-reserve",
      "Power",
      powerCheckFailed ? "high" : resourceEstimates.power.estimatedBatteryReservePercentage
        < MISSION_PLANNING_LIMITS.lowBatteryReserveFraction * 100
        || resourceEstimates.power.estimatedPowerMarginW < 0
        ? "medium"
        : "low",
      powerCheckFailed
        ? "Projected power reserve does not meet the configured engineering requirement."
        : "Power generation and battery reserve are estimated for the selected site profile.",
      `${resourceEstimates.power.estimatedAvailablePowerW} W estimated generation versus a ${resourceEstimates.power.estimatedPeakLoadW} W peak planning load; estimated battery reserve ${resourceEstimates.power.estimatedBatteryReservePercentage}%.`,
      "Review the power source, instrument operating load, and operation schedule.",
      powerCheckFailed,
    ),
    risk(
      "rover-mass",
      "Mass",
      metrics.totalMassKg > ENGINEERING_LIMITS.maxRoverMassKg
        ? "high"
        : metrics.totalMassKg >= ENGINEERING_LIMITS.maxRoverMassKg
          * MISSION_PLANNING_LIMITS.nearCapacityFraction
          ? "medium"
          : "low",
      "Rover mass is compared with the configured illustrative mission limit.",
      `${metrics.totalMassKg} kg rover mass against a ${ENGINEERING_LIMITS.maxRoverMassKg} kg limit.`,
      "Compare chassis and component mass, then remove nonessential payload if needed.",
      metrics.totalMassKg > ENGINEERING_LIMITS.maxRoverMassKg,
    ),
    risk(
      "mission-budget",
      "Budget",
      budgetViolation
        ? "high"
        : budgetFraction < MISSION_PLANNING_LIMITS.lowBudgetReserveFraction
          ? "medium"
          : "low",
      "The estimate includes rover construction, launch, planned operations, communications, and maintenance.",
      `${resourceEstimates.budget.remainingCredits} credits remain; construction costs ${resourceEstimates.budget.constructionCredits} credits against the ${ENGINEERING_LIMITS.maxConstructionBudgetCredits}-credit rover limit.`,
      "Reduce component or operational costs while retaining the capabilities required by selected objectives.",
      budgetViolation,
    ),
    risk(
      "data-storage",
      "Data",
      storageFraction > 1
        ? "high"
        : storageFraction >= MISSION_PLANNING_LIMITS.nearCapacityFraction
          ? "medium"
          : "low",
      "Expected science data is compared with onboard storage capacity.",
      `${resourceEstimates.data.expectedScienceDataMB} MB planned against ${resourceEstimates.data.storageCapacityMB} MB storage.`,
      "Prioritize observations, plan transmissions, or review the selected instrument set.",
      storageFraction > 1,
    ),
    risk(
      "communication-capacity",
      "Communications",
      resourceEstimates.data.communicationCapacityMBPerSol <= 0
        ? "high"
        : resourceEstimates.data.estimatedTransmissionHours > resourceEstimates.time.durationHours
          ? "high"
          : resourceEstimates.data.expectedScienceDataMB
            > resourceEstimates.data.communicationCapacityMBPerSol
            ? "medium"
            : "low",
      "Communication capacity is compared with the estimated volume and time needed to return planned data.",
      `${resourceEstimates.data.communicationCapacityMBPerSol} MB/sol capacity; estimated transmission time ${resourceEstimates.data.estimatedTransmissionHours} h.`,
      "Review the installed communication system and schedule transmissions across the mission.",
      resourceEstimates.data.communicationCapacityMBPerSol <= 0
        || resourceEstimates.data.estimatedTransmissionHours > resourceEstimates.time.durationHours,
    ),
    risk(
      "mission-duration",
      "Time",
      scheduleOverrun ? "high" : remainingTimeFraction < MISSION_PLANNING_LIMITS.emergencyReserveFraction
        ? "medium"
        : "low",
      "Planned instrument, communications, maintenance, and emergency reserve time is compared with mission duration.",
      `${resourceEstimates.time.requiredHours} h planned against ${resourceEstimates.time.durationHours} h available.`,
      "Adjust mission duration or reduce planned operations while preserving contingency time.",
      scheduleOverrun,
    ),
    risk(
      "missing-science-capabilities",
      "Science",
      missingCapabilities.length ? "high" : "low",
      missingCapabilities.length
        ? "One or more selected objectives lack the instrument capabilities they require."
        : "Selected objectives have their required instrument capabilities.",
      missingCapabilities.length
        ? `Coverage is incomplete for: ${missingCapabilities.map((id) => SCIENCE_OBJECTIVES.find(({ id: objectiveId }) => objectiveId === id)?.name ?? id).join(", ")}.`
        : "Every selected objective is covered by the current instrument configuration.",
      "Install the instruments required by each selected objective or revise the objective priorities.",
      missingCapabilities.length > 0,
    ),
    risk(
      "landing-site-suitability",
      "Landing site",
      !site
        ? "high"
        : siteFit?.status !== "strong-fit" || !siteObjectiveMatches
          ? "medium"
          : "low",
      "The rover mobility and landing components are compared with illustrative site terrain tags.",
      site
        ? `${site.name}: ${siteFit?.score ?? "unavailable"}/100 conceptual fit; ${siteObjectiveMatches ? "at least one selected objective aligns with the site's planning context" : "selected objectives do not match the site's illustrative planning context"}.`
        : "No available landing-site profile is selected.",
      "Compare site terrain tags with the selected mobility system; this is not a landing-safety assessment.",
      !site,
    ),
    risk(
      "maintenance-allowance",
      "Maintenance",
      scheduleOverrun ? "high" : resourceEstimates.time.planningHoursRemaining
        < resourceEstimates.time.emergencyReserveHours
        ? "medium"
        : "low",
      "The plan reserves the configured maintenance allowance before considering remaining contingency time.",
      `${resourceEstimates.time.maintenanceAllowanceHours} h maintenance allowance and ${resourceEstimates.time.emergencyReserveHours} h emergency reserve are included.`,
      "Retain time for maintenance and contingency instead of allocating the full mission window to science operations.",
      scheduleOverrun,
    ),
  ];
}

function createCheck(id, label, passed, message, recommendation = message) {
  return { id, label, passed, blocking: true, message, recommendation };
}

export function validateMissionPlan(configuration, roverConfiguration) {
  const estimates = calculateMissionEstimates(configuration, roverConfiguration);
  const selectedIds = selectedObjectives(configuration).map(({ objectiveId }) => objectiveId);
  const site = findSite(configuration?.landingSiteId);
  const mission = findMission(configuration?.missionProfileId);
  const strategy = findStrategy(configuration?.strategyId);
  const setup = validatePlanningInputs(configuration);
  const roverValidation = validateRoverConfiguration(roverConfiguration, ENGINEERING_LIMITS, {
    selectedLandingSiteId: site?.id,
    objectiveIds: selectedIds,
  });
  const metrics = calculateRoverMetrics(roverConfiguration, {
    selectedLandingSiteId: site?.id,
  });
  const scienceCapabilities = new Map(
    getScientificCapabilities(roverConfiguration)
      .map((item) => [item.objectiveId, item]),
  );
  const objectivesCovered = selectedIds.length > 0 && selectedIds.every(
    (id) => scienceCapabilities.get(id)?.coverageStatus === "ready",
  );
  const risks = assessMissionRisks(configuration, roverConfiguration, estimates);
  const communications = findOption("communications", roverConfiguration?.communications);
  const powerCheck = roverValidation.errors.every(
    ({ id }) => id !== "missing-power" && id !== "insufficient-power",
  ) && metrics.powerGenerationW > 0
    && estimates.power.estimatedBatteryReserveWh
      >= MISSION_RESOURCE_CONFIG.batteryCapacityWh
        * MISSION_RESOURCE_CONFIG.minimumBatteryFraction;
  const engineeringPasses = roverValidation.isValid;
  const checks = [
    createCheck(
      "mission-profile",
      "Mission profile selected",
      Boolean(mission),
      mission ? `${mission.id} · ${mission.title}` : "Choose an available mission profile.",
    ),
    createCheck(
      "mission-name",
      "Mission name is valid",
      setup.checks.find(({ id }) => id === "mission-name").passed,
      setup.checks.find(({ id }) => id === "mission-name").passed
        ? configuration.missionName.trim()
        : "Enter a mission name of 1–80 characters.",
    ),
    createCheck(
      "landing-site",
      "Landing site selected",
      Boolean(site),
      site ? `${site.name} selected.` : "Choose an available conceptual landing site.",
    ),
    createCheck(
      "mission-duration",
      "Mission duration is valid",
      setup.checks.find(({ id }) => id === "mission-duration").passed,
      setup.checks.find(({ id }) => id === "mission-duration").passed
        ? `${estimates.time.durationSols} sols (${estimates.time.durationHours} gameplay hours).`
        : setup.checks.find(({ id }) => id === "mission-duration").message,
    ),
    createCheck(
      "science-objectives",
      "At least one objective is selected",
      selectedIds.length > 0,
      selectedIds.length
        ? `${selectedIds.length} objective${selectedIds.length === 1 ? "" : "s"} prioritized.`
        : "Select at least one scientific objective.",
    ),
    createCheck(
      "objective-priorities",
      "Objective priorities are assigned",
      setup.checks.find(({ id }) => id === "objective-priorities").passed,
      setup.checks.find(({ id }) => id === "objective-priorities").passed
        ? "Selected objectives have priorities from 1 to 4."
        : "Assign each selected objective a priority from 1 to 4.",
    ),
    createCheck(
      "operational-strategy",
      "Operational strategy selected",
      Boolean(strategy),
      strategy ? `${strategy.name}: ${strategy.description}` : "Choose an available operational strategy.",
    ),
    createCheck(
      "objective-capabilities",
      "Selected objectives have instrument coverage",
      objectivesCovered,
      objectivesCovered
        ? "Installed instruments cover every selected objective."
        : "Install required instruments for each selected objective.",
      "Review the required capability list for each objective and update the rover design.",
    ),
    createCheck(
      "rover-engineering",
      "Rover engineering validation passes",
      engineeringPasses,
      engineeringPasses
        ? "The rover passes mandatory engineering validation."
        : roverValidation.errors.map(({ message }) => message).join(" "),
      "Review the rover engineering report and correct its mandatory errors.",
    ),
    createCheck(
      "rover-mass",
      "Rover mass is within limits",
      metrics.totalMassKg <= ENGINEERING_LIMITS.maxRoverMassKg,
      `${metrics.totalMassKg} kg / ${ENGINEERING_LIMITS.maxRoverMassKg} kg maximum.`,
      "Reduce component mass or select a lighter chassis.",
    ),
    createCheck(
      "payload-capacity",
      "Instrument payload is within capacity",
      metrics.payloadRemainingKg !== null && metrics.payloadRemainingKg >= 0,
      metrics.payloadRemainingKg === null
        ? "Select a chassis to establish payload capacity."
        : `${metrics.payloadUsedKg} kg installed; ${metrics.payloadRemainingKg} kg payload capacity remains.`,
      "Select a chassis with sufficient payload capacity or reduce instrument mass.",
    ),
    createCheck(
      "power-requirements",
      "Power requirements and reserve are satisfied",
      powerCheck,
      powerCheck
        ? `${estimates.power.estimatedAvailablePowerW} W estimated at site conditions; battery reserve ${estimates.power.estimatedBatteryReservePercentage}%.`
        : "The rover does not meet configured power or battery reserve requirements.",
      "Review the selected power system and instrument operating loads.",
    ),
    createCheck(
      "budget-sufficient",
      "Mission budget is sufficient",
      estimates.budget.remainingCredits >= 0
        && metrics.totalCostCredits <= ENGINEERING_LIMITS.maxConstructionBudgetCredits,
      `${estimates.budget.remainingCredits} credits remain after planned construction, launch, operations, communications, and maintenance.`,
      "Reduce rover or operating costs while preserving mandatory mission capabilities.",
    ),
    createCheck(
      "communication-system",
      "Communication system is installed",
      Boolean(communications && communications.dataCapacityUnitsPerSol > 0),
      communications
        ? `${communications.name} · ${estimates.data.communicationCapacityMBPerSol} MB/sol.`
        : "Install a communication system with nonzero data capacity.",
      "Install or upgrade a communication system.",
    ),
    createCheck(
      "data-storage",
      "Expected data fits onboard storage",
      estimates.data.expectedScienceDataMB <= estimates.data.storageCapacityMB,
      `${estimates.data.expectedScienceDataMB} MB estimated / ${estimates.data.storageCapacityMB} MB capacity.`,
      "Reduce planned instrument operations or plan adequate data return.",
    ),
    createCheck(
      "mission-duration-operations",
      "Mission duration allows planned operations",
      estimates.time.requiredHours <= estimates.time.durationHours,
      `${estimates.time.requiredHours} h required including maintenance and contingency / ${estimates.time.durationHours} h available.`,
      "Extend the mission duration or reduce scheduled operations while retaining contingency time.",
    ),
    createCheck(
      "blocking-high-risks",
      "No blocking high-severity risks remain",
      !risks.some(({ severity, blocksValidation }) => severity === "high" && blocksValidation),
      "Blocking high-severity risks must be resolved before mission control.",
      "Resolve the blocking high-severity risk items listed below.",
    ),
  ];
  const failedChecks = checks.filter(({ passed }) => !passed);
  const warnings = [
    ...risks.filter(({ severity }) => severity !== "low"),
    ...roverValidation.warnings.map((item) => ({
      id: item.id,
      category: "Engineering",
      severity: "medium",
      description: item.message,
      reason: item.message,
      mitigation: "Review this optimization warning before finalizing the rover.",
      blocksValidation: false,
    })),
  ];
  const blockingRisks = risks.filter(
    ({ severity, blocksValidation }) => severity === "high" && blocksValidation,
  );
  const isReady = failedChecks.length === 0 && blockingRisks.length === 0;
  const overallStatus = !isReady
    ? "NOT READY"
    : warnings.length > 0
      ? "NEEDS ATTENTION"
      : "READY";
  const recommendations = [...new Set([
    ...failedChecks.map(({ recommendation }) => recommendation),
    ...warnings.map(({ mitigation }) => mitigation),
  ])];
  const riskSummary = {
    low: risks.filter(({ severity }) => severity === "low").length,
    medium: risks.filter(({ severity }) => severity === "medium").length,
    high: risks.filter(({ severity }) => severity === "high").length,
    blocking: blockingRisks.length,
  };
  return {
    overallStatus,
    isReady,
    checks,
    passedChecks: checks.filter(({ passed }) => passed),
    failedChecks,
    warnings,
    risks,
    riskSummary,
    recommendations,
    estimates,
    validatedAt: "Deterministic planning-state evaluation",
    sourceSignature:     JSON.stringify({
      configuration: canonicalConfiguration(configuration),
      roverConfiguration,
    }),
  };
}

export function buildMissionPlan(configuration, roverConfiguration) {
  const canonical = canonicalConfiguration(configuration);
  const validation = validateMissionPlan(canonical, roverConfiguration);
  return {
    configuration: canonical,
    estimates: validation.estimates,
    risks: validation.risks,
    validation,
    readiness: validation.overallStatus,
    sourceSignature: validation.sourceSignature,
  };
}

export function isMissionPlanCurrent(missionPlan, roverConfiguration) {
  return Boolean(
    missionPlan?.configuration
    && missionPlan.sourceSignature
      === validateMissionPlan(missionPlan.configuration, roverConfiguration).sourceSignature,
  );
}
