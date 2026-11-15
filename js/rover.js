import {
  ENGINEERING_LIMITS,
  LANDING_SITES,
  ROVER_CATEGORIES,
  SCIENCE_CAPABILITY_REQUIREMENTS,
  SCIENCE_OBJECTIVES,
} from "./data.js";

const REQUIRED_COMPONENT_CATEGORIES = Object.freeze([
  "chassis",
  "mobility",
  "power",
  "communications",
  "landing",
]);

function getCategory(categoryId) {
  return ROVER_CATEGORIES.find(({ id }) => id === categoryId);
}

function getOption(categoryId, optionId) {
  return getCategory(categoryId)?.options.find(({ id }) => id === optionId) ?? null;
}

function getInstalledComponents(configuration = {}) {
  const components = [];
  for (const category of ROVER_CATEGORIES) {
    const selection = configuration[category.id];
    const ids = category.id === "instruments"
      ? Array.isArray(selection) ? selection : []
      : selection ? [selection] : [];
    ids.forEach((id) => {
      const option = getOption(category.id, id);
      if (option) {
        components.push({ categoryId: category.id, ...option });
      }
    });
  }
  return components;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sumProperty(components, property) {
  return components.reduce((total, component) => total + (component[property] ?? 0), 0);
}

function objectiveCoverage(instrumentIds, objectiveIds) {
  const instruments = new Set(instrumentIds);
  const missing = [];
  for (const objectiveId of objectiveIds) {
    const requirement = SCIENCE_CAPABILITY_REQUIREMENTS.find(
      ({ objectiveId: id }) => id === objectiveId,
    );
    if (!requirement) {
      missing.push(`No science capability mapping exists for selected objective "${objectiveId}".`);
      continue;
    }
    for (const capability of requirement.requiredCapabilities) {
      if (!capability.instrumentIds.some((id) =>
        instruments.has(id) && Boolean(getOption("instruments", id)))) {
        missing.push(
          `${capability.label} requires an available catalog instrument: ${capability.instrumentIds.join(" or ")}.`,
        );
      }
    }
  }
  return missing;
}

function objectiveMappingIssues(objectiveIds) {
  const issues = [];
  for (const objectiveId of objectiveIds) {
    const requirement = SCIENCE_CAPABILITY_REQUIREMENTS.find(
      ({ objectiveId: id }) => id === objectiveId,
    );
    if (!requirement) {
      issues.push(`No science capability mapping exists for selected objective "${objectiveId}".`);
      continue;
    }
    for (const capability of requirement.requiredCapabilities) {
      if (!capability.instrumentIds.some((id) => getOption("instruments", id))) {
        issues.push(
          `${capability.label} has no matching instrument in the component catalog.`,
        );
      }
    }
  }
  return issues;
}

function instrumentSelections() {
  const instruments = getCategory("instruments")?.options ?? [];
  const selections = [];
  for (let mask = 0; mask < 2 ** instruments.length; mask += 1) {
    selections.push(instruments
      .filter((_, index) => mask & (1 << index))
      .map(({ id }) => id));
  }
  return selections;
}

function minimalCoveringInstrumentSelections(objectiveIds) {
  const covering = instrumentSelections().filter((selection) =>
    objectiveCoverage(selection, objectiveIds).length === 0,
  );
  return covering.filter((selection) =>
    !covering.some((other) =>
      other.length < selection.length && other.every((id) => selection.includes(id)),
    ),
  );
}

function componentExplanations(configuration, objectiveIds, selectedLandingSiteId) {
  const site = LANDING_SITES.find(({ id }) => id === selectedLandingSiteId);
  const instruments = configuration.instruments.map((id) => {
    const option = getOption("instruments", id);
    const capabilities = SCIENCE_CAPABILITY_REQUIREMENTS
      .filter((objective) => objectiveIds.includes(objective.objectiveId))
      .flatMap((objective) =>
        objective.requiredCapabilities
          .filter(({ instrumentIds }) => instrumentIds.includes(id))
          .map(({ label }) => label),
      );
    const coveredObjectives = SCIENCE_CAPABILITY_REQUIREMENTS
      .filter((objective) => objectiveIds.includes(objective.objectiveId)
        && objective.requiredCapabilities.some(({ instrumentIds }) => instrumentIds.includes(id)))
      .map(({ objectiveId }) =>
        SCIENCE_OBJECTIVES.find(({ id }) => id === objectiveId)?.name ?? objectiveId,
      );
    return {
      id,
      name: option.name,
      categoryId: "instruments",
      explanation: `Needed for ${capabilities.join(", ")}${coveredObjectives.length
        ? ` supporting ${coveredObjectives.join(" and ")}`
        : ""}.`,
    };
  });
  const selected = [
    {
      categoryId: "chassis",
      id: configuration.chassis,
      reason: "Provides the mass, payload, instrument-slot, and equipment-slot envelope needed by this build.",
    },
    {
      categoryId: "mobility",
      id: configuration.mobility,
      reason: `Required mobility system; its terrain capability covers the selected site's ${site?.name ?? "landing-site"} terrain profile.`,
    },
    {
      categoryId: "power",
      id: configuration.power,
      reason: "Required power source; its nominal generation satisfies the installed systems' power demand within the mission limits.",
    },
    {
      categoryId: "communications",
      id: configuration.communications,
      reason: "Required communication system; it meets the minimum link capability and data-capacity limits.",
    },
    {
      categoryId: "landing",
      id: configuration.landing,
      reason: "Required landing system; it completes the mandatory rover configuration within mass and budget limits.",
    },
    ...instruments.map(({ categoryId, id, explanation }) => ({
      categoryId,
      id,
      reason: explanation,
    })),
  ];
  return selected.map(({ categoryId, id, reason }) => ({
    categoryId,
    id,
    name: getOption(categoryId, id)?.name ?? id,
    explanation: reason,
  }));
}

export function recommendRoverConfiguration(
  objectiveIds = [],
  selectedLandingSiteId,
  limits = ENGINEERING_LIMITS,
) {
  const objectives = [...new Set(Array.isArray(objectiveIds) ? objectiveIds : [])];
  const missingCapabilities = objectiveMappingIssues(objectives);
  if (missingCapabilities.length) {
    return {
      isValid: false,
      configuration: null,
      metrics: null,
      validation: null,
      explanations: [],
      reason: `No recommended rover can cover the selected objectives. ${missingCapabilities.join(" ")}`,
      blockingConstraints: missingCapabilities,
    };
  }

  const singleChoiceCategories = REQUIRED_COMPONENT_CATEGORIES;
  const candidates = [];
  const optionSets = singleChoiceCategories.map((categoryId) =>
    getCategory(categoryId)?.options ?? [],
  );
  const siteTerrainTags = LANDING_SITES.find(({ id }) => id === selectedLandingSiteId)?.terrainTags ?? [];
  const missingSystems = singleChoiceCategories
    .filter((_, index) => optionSets[index].length === 0)
    .map((categoryId) => getCategory(categoryId)?.title ?? categoryId);
  if (missingSystems.length) {
    const blockingConstraints = missingSystems.map((name) =>
      `No catalog component is available for required ${name.toLowerCase()}.`,
    );
    return {
      isValid: false,
      configuration: null,
      metrics: null,
      validation: null,
      explanations: [],
      reason: `No recommended rover can be assembled. ${blockingConstraints.join(" ")}`,
      blockingConstraints,
    };
  }
  const compatibleMobility = optionSets[1].some(({ terrainCapabilities = [] }) =>
    siteTerrainTags.every((tag) => terrainCapabilities.includes(tag)),
  );
  if (!compatibleMobility) {
    const blockingConstraints = [
      `No catalog mobility system covers all required terrain tags for ${LANDING_SITES.find(({ id }) => id === selectedLandingSiteId)?.name ?? "the selected site"}: ${siteTerrainTags.join(", ")}.`,
    ];
    return {
      isValid: false,
      configuration: null,
      metrics: null,
      validation: null,
      explanations: [],
      reason: `No recommended rover can satisfy the selected-site mobility requirement. ${blockingConstraints[0]}`,
      blockingConstraints,
    };
  }

  for (const selectedInstruments of minimalCoveringInstrumentSelections(objectives)) {
    for (const chassis of optionSets[0]) {
      for (const mobility of optionSets[1]) {
        if (!siteTerrainTags.every((tag) => mobility.terrainCapabilities?.includes(tag))) continue;
        for (const power of optionSets[2]) {
          for (const communications of optionSets[3]) {
            for (const landing of optionSets[4]) {
              const configuration = {
                chassis: chassis.id,
                mobility: mobility.id,
                power: power.id,
                communications: communications.id,
                landing: landing.id,
                instruments: selectedInstruments,
              };
              const validation = validateRoverConfiguration(configuration, limits, {
                selectedLandingSiteId,
                objectiveIds: objectives,
              });
              const metrics = calculateRoverMetrics(configuration, {
                limits,
                selectedLandingSiteId,
              });
              candidates.push({
                configuration,
                validation,
                metrics,
                cost: metrics.totalCostCredits,
              });
            }
          }
        }
      }
    }
  }

  candidates.sort((left, right) => left.cost - right.cost);
  const best = candidates.find(({ validation }) => validation.isValid);
  if (best) {
    return {
      ...best,
      isValid: true,
      explanations: componentExplanations(best.configuration, objectives, selectedLandingSiteId),
      reason: `Selected the least expensive valid catalog configuration for ${objectives.length
        ? objectiveNames(objectives)
        : "the required rover systems"}.`,
      blockingConstraints: [],
    };
  }

  const nearest = candidates
    .map((candidate) => ({
      ...candidate,
      violations: candidate.validation.errors.length,
    }))
    .sort((left, right) => left.violations - right.violations || left.cost - right.cost)[0];
  const blockingConstraints = [...new Set(
    nearest?.validation.errors.map(({ message }) => message) ?? [],
  )];
  return {
    isValid: false,
    configuration: null,
    metrics: nearest?.metrics ?? null,
    validation: nearest?.validation ?? null,
    explanations: [],
    reason: blockingConstraints.length
      ? `No valid rover configuration fits the selected objectives and engineering limits. Closest catalog build is blocked by: ${blockingConstraints.join(" ")}`
      : "No catalog configuration is available for the required rover systems.",
    blockingConstraints,
  };
}

function objectiveNames(objectiveIds) {
  return objectiveIds.map((id) =>
    SCIENCE_OBJECTIVES.find(({ id: objectiveId }) => objectiveId === id)?.name ?? id,
  ).join(", ");
}

export function calculateRoverMass(configuration) {
  return round(sumProperty(getInstalledComponents(configuration), "massKg"));
}

export function calculateRoverCost(configuration) {
  return round(sumProperty(getInstalledComponents(configuration), "costCredits"));
}

export function calculatePowerGeneration(configuration) {
  const powerSystem = getOption("power", configuration?.power);
  return round(powerSystem?.generationW ?? 0);
}

export function calculatePowerConsumption(configuration) {
  return round(sumProperty(getInstalledComponents(configuration), "operatingPowerW"));
}

export function calculatePowerMargin(configuration) {
  return round(calculatePowerGeneration(configuration) - calculatePowerConsumption(configuration));
}

export function calculatePayloadRemaining(configuration, limits = ENGINEERING_LIMITS) {
  const chassis = getOption("chassis", configuration?.chassis);
  if (!chassis) {
    return null;
  }
  const instrumentMass = sumProperty(getInstalledComponents(configuration).filter(
    ({ categoryId }) => categoryId === "instruments",
  ), "massKg");
  return round(Math.min(chassis.payloadCapacityKg, limits.maxPayloadKg) - instrumentMass);
}

export function calculateReliability(configuration) {
  const components = getInstalledComponents(configuration);
  if (components.length === 0) {
    return null;
  }
  return round(sumProperty(components, "reliability") / components.length, 4);
}

export function getScientificCapabilities(configuration) {
  const instrumentIds = Array.isArray(configuration?.instruments)
    ? [...new Set(configuration.instruments)]
    : [];
  const installed = instrumentIds
    .map((id) => getOption("instruments", id))
    .filter(Boolean);

  return SCIENCE_OBJECTIVES.map((objective) => {
    const requirements = SCIENCE_CAPABILITY_REQUIREMENTS.find(
      ({ objectiveId }) => objectiveId === objective.id,
    );
    const requiredCapabilities = (requirements?.requiredCapabilities ?? []).map((requirement) => {
      const availableInstruments = requirement.instrumentIds
        .map((id) => getOption("instruments", id))
        .filter(Boolean);
      const installedInstruments = installed.filter(({ id }) =>
        requirement.instrumentIds.includes(id),
      );
      return {
        id: requirement.id,
        label: requirement.label,
        requiredInstruments: availableInstruments.map(({ name }) => name),
        availableInstruments: installedInstruments.map(({ name }) => name),
        covered: installedInstruments.length > 0,
      };
    });
    const coveredCount = requiredCapabilities.filter(({ covered }) => covered).length;
    const missingCapabilities = requiredCapabilities
      .filter(({ covered }) => !covered)
      .map(({ label }) => label);
    const status = coveredCount === requiredCapabilities.length
      ? "ready"
      : coveredCount > 0
        ? "partial"
        : "not-covered";
    return {
      objectiveId: objective.id,
      objectiveName: objective.name,
      requiredCapabilities,
      availableInstruments: installed
        .filter(({ supportedObjectives }) => supportedObjectives.includes(objective.id))
        .map(({ name }) => name),
      missingCapabilities,
      coverageStatus: status,
    };
  });
}

export function calculateEnvironmentalSuitability(configuration, selectedLandingSiteId) {
  const mobility = getOption("mobility", configuration?.mobility);
  const landing = getOption("landing", configuration?.landing);
  const site = LANDING_SITES.find(({ id }) => id === selectedLandingSiteId);
  if (!mobility || !landing || !site) {
    return null;
  }

  const matchingTerrain = site.terrainTags.filter((tag) =>
    mobility.terrainCapabilities.includes(tag),
  ).length;
  const terrainMatch = site.terrainTags.length === 0 ? 0 : matchingTerrain / site.terrainTags.length;
  const score = round((terrainMatch * 70) + (landing.environmentalProtection * 0.3));
  const status = score >= 80 ? "strong-fit" : score >= 60 ? "consider-fit" : "limited-fit";
  return {
    score,
    status,
    terrainMatch: round(terrainMatch * 100),
    landingProtection: landing.environmentalProtection,
    siteName: site.name,
    explanation: `${matchingTerrain} of ${site.terrainTags.length} illustrative terrain tags match the selected mobility system; landing protection is a separate component rating.`,
  };
}

export function calculateRoverMetrics(configuration, options = {}) {
  const limits = options.limits ?? ENGINEERING_LIMITS;
  const components = getInstalledComponents(configuration);
  const chassis = getOption("chassis", configuration?.chassis);
  const communications = getOption("communications", configuration?.communications);
  const installedInstruments = components.filter(({ categoryId }) => categoryId === "instruments");
  const instrumentSlotLimit = chassis
    ? Math.min(chassis.instrumentSlots, limits.maxInstrumentSlots)
    : limits.maxInstrumentSlots;
  const equipmentSlotsUsed = components.filter(({ categoryId }) =>
    ["mobility", "power", "communications", "landing", "instruments"].includes(categoryId),
  ).length;

  return {
    totalMassKg: calculateRoverMass(configuration),
    totalCostCredits: calculateRoverCost(configuration),
    powerGenerationW: calculatePowerGeneration(configuration),
    powerConsumptionW: calculatePowerConsumption(configuration),
    powerMarginW: calculatePowerMargin(configuration),
    payloadCapacityKg: chassis ? Math.min(chassis.payloadCapacityKg, limits.maxPayloadKg) : null,
    payloadUsedKg: round(sumProperty(installedInstruments, "massKg")),
    payloadRemainingKg: calculatePayloadRemaining(configuration, limits),
    instrumentSlotsUsed: installedInstruments.length,
    instrumentSlotsAvailable: instrumentSlotLimit,
    equipmentSlotsUsed,
    equipmentSlotsAvailable: chassis?.equipmentSlots ?? null,
    instrumentDataUnitsPerOperation: round(sumProperty(installedInstruments, "dataUnitsPerOperation")),
    communicationCapability: communications?.communicationCapability ?? null,
    dataCapacityUnitsPerSol: communications?.dataCapacityUnitsPerSol ?? 0,
    reliability: calculateReliability(configuration),
    scientificCapabilities: getScientificCapabilities(configuration),
    environmentalSuitability: calculateEnvironmentalSuitability(
      configuration,
      options.selectedLandingSiteId,
    ),
    installedComponents: components,
  };
}

export function validateRoverConfiguration(
  configuration,
  limits = ENGINEERING_LIMITS,
  options = {},
) {
  const errors = [];
  const warnings = [];
  const addError = (id, message) => errors.push({ id, severity: "error", message });
  const addWarning = (id, message) => warnings.push({ id, severity: "warning", message });

  for (const category of ROVER_CATEGORIES) {
    const selection = configuration?.[category.id];
    const ids = category.id === "instruments"
      ? Array.isArray(selection) ? selection : []
      : selection ? [selection] : [];
    ids.forEach((id) => {
      if (!getOption(category.id, id)) {
        addError(`unknown-${category.id}-${id}`, `Unknown ${category.title.toLowerCase()} selection: ${id}.`);
      }
    });
    if (category.id === "instruments" && new Set(ids).size !== ids.length) {
      addError("duplicate-instruments", "The instrument list contains duplicate selections.");
    }
  }

  REQUIRED_COMPONENT_CATEGORIES.forEach((categoryId) => {
    if (!getOption(categoryId, configuration?.[categoryId])) {
      const category = getCategory(categoryId);
      addError(`missing-${categoryId}`, `Select a ${category.title.toLowerCase()} before configuring a mission rover.`);
    }
  });

  const metrics = calculateRoverMetrics(configuration, { ...options, limits });
  const chassis = getOption("chassis", configuration?.chassis);
  if (metrics.totalMassKg > limits.maxRoverMassKg) {
    addError("mass-limit", `Rover mass ${metrics.totalMassKg} kg exceeds the ${limits.maxRoverMassKg} kg mission limit.`);
  }
  if (metrics.totalCostCredits > limits.maxConstructionBudgetCredits) {
    addError("budget-limit", `Construction cost ${metrics.totalCostCredits} credits exceeds the ${limits.maxConstructionBudgetCredits}-credit budget.`);
  }
  if (chassis && metrics.payloadUsedKg > Math.min(chassis.payloadCapacityKg, limits.maxPayloadKg)) {
    addError("payload-limit", `Installed instruments use ${metrics.payloadUsedKg} kg, exceeding the ${chassis.payloadCapacityKg} kg chassis payload or ${limits.maxPayloadKg} kg mission payload limit.`);
  }
  if (metrics.instrumentSlotsUsed > metrics.instrumentSlotsAvailable) {
    addError("instrument-slots", `${metrics.instrumentSlotsUsed} instruments exceed the ${metrics.instrumentSlotsAvailable} available instrument slots.`);
  }
  if (chassis && metrics.equipmentSlotsUsed > chassis.equipmentSlots) {
    addError("equipment-slots", `${metrics.equipmentSlotsUsed} installed systems exceed the chassis limit of ${chassis.equipmentSlots} equipment slots.`);
  }
  if (metrics.powerGenerationW > limits.maxPowerGenerationW) {
    addError("power-generation-limit", `Power generation ${metrics.powerGenerationW} W exceeds the ${limits.maxPowerGenerationW} W mission interface limit.`);
  }
  if (metrics.powerGenerationW > 0 && metrics.powerMarginW < limits.minPowerMarginW) {
    addError(
      "insufficient-power",
      `Power margin ${metrics.powerMarginW} W is below the required ${limits.minPowerMarginW} W reserve.`,
    );
  } else if (metrics.powerGenerationW > 0 && metrics.powerMarginW <= metrics.powerGenerationW * limits.lowPowerMarginRatio) {
    addWarning("low-power-margin", `Power margin is ${metrics.powerMarginW} W; review the limited reserve before adding operations.`);
  }

  const communication = getOption("communications", configuration?.communications);
  if (!communication) {
    addError("missing-communication", "Install a communication system to meet the mission communication requirement.");
  } else {
    if (communication.communicationCapability < limits.minCommunicationCapability) {
      addError("communication-capability", `Communication capability ${communication.communicationCapability} is below the required level ${limits.minCommunicationCapability}.`);
    }
    if (communication.dataCapacityUnitsPerSol < limits.minDataCapacityUnitsPerSol) {
      addError("communication-capacity", `Data capacity ${communication.dataCapacityUnitsPerSol} units/sol is below the required ${limits.minDataCapacityUnitsPerSol} units/sol.`);
    }
    if (communication.dataCapacityUnitsPerSol < 40) {
      addWarning("communication-bandwidth", "The selected link has limited illustrative data capacity; consider whether it can return the planned science data.");
    }
    if (
      metrics.instrumentDataUnitsPerOperation > communication.dataCapacityUnitsPerSol
    ) {
      addWarning(
        "data-throughput",
        `Installed instruments generate ${metrics.instrumentDataUnitsPerOperation} illustrative data units per operation, compared with ${communication.dataCapacityUnitsPerSol} units/sol of link capacity. Operation scheduling is not modeled, so review this as a planning trade-off.`,
      );
    }
  }

  const requiredObjectiveIds = options.objectiveIds
    ? new Set(options.objectiveIds)
    : null;
  metrics.scientificCapabilities
    .filter((objective) => !requiredObjectiveIds || requiredObjectiveIds.has(objective.objectiveId))
    .forEach((objective) => {
    if (objective.coverageStatus !== "ready") {
      addError(
        `science-${objective.objectiveId}`,
        `${objective.objectiveName} cannot be fully investigated; missing capabilities: ${objective.missingCapabilities.join(", ")}.`,
      );
    }
    });

  if (metrics.totalMassKg >= limits.maxRoverMassKg * 0.85 && metrics.totalMassKg <= limits.maxRoverMassKg) {
    addWarning("mass-margin", `Mass is close to the ${limits.maxRoverMassKg} kg limit.`);
  }
  if (
    metrics.totalCostCredits >= limits.maxConstructionBudgetCredits * 0.85
    && metrics.totalCostCredits <= limits.maxConstructionBudgetCredits
  ) {
    addWarning("budget-margin", "Construction cost is close to the mission budget.");
  }
  if (metrics.reliability !== null && metrics.reliability < 0.88) {
    addWarning("reliability", "The illustrative average component reliability rating is below 88%; consider system simplicity and trade-offs.");
  }
  if (metrics.environmentalSuitability?.status === "limited-fit") {
    addWarning("environment-fit", `Environmental suitability is limited for ${metrics.environmentalSuitability.siteName}: ${metrics.environmentalSuitability.explanation}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}