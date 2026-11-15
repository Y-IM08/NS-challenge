import {
  MISSION_COMPLETION_REQUIREMENTS,
  MISSION_EXECUTION_CONFIG,
  MISSION_RESOURCE_CONFIG,
  MISSION_SURFACE_WAYPOINTS,
  SCIENCE_CAPABILITY_REQUIREMENTS,
  SCIENCE_OBJECTIVES,
} from "./data.js";
import {
  advanceMissionTime,
  collectScientificData,
  createMissionResources,
  recordEmergencyDelay,
  recordMissionMovement,
  recordMissionSampleCollection,
  recordMaintenance,
  setPowerEnvironment,
  transmitMissionData,
} from "./resources.js";
import { calculateRoverMetrics, validateRoverConfiguration } from "./rover.js";
import { buildMissionPlan, isMissionPlanCurrent } from "./planning.js";

const TERMINAL_STATES = new Set(["COMPLETED", "FAILED", "ABORTED"]);
const ALLOWED_TRANSITIONS = Object.freeze({
  READY: new Set(["INITIALIZING", "ABORTED"]),
  INITIALIZING: new Set(["ACTIVE", "FAILED", "ABORTED"]),
  ACTIVE: new Set(["PAUSED", "COMPLETED", "FAILED", "ABORTED"]),
  PAUSED: new Set(["ACTIVE", "FAILED", "ABORTED"]),
  COMPLETED: new Set(),
  FAILED: new Set(),
  ABORTED: new Set(),
});

function getWaypoint(waypointId) {
  return MISSION_SURFACE_WAYPOINTS.find(({ id }) => id === waypointId) ?? null;
}

function getSiteWaypoints(siteId) {
  return MISSION_SURFACE_WAYPOINTS.filter(({ siteId: waypointSiteId }) => waypointSiteId === siteId);
}

function requireActive(execution) {
  if (!execution || execution.status !== "ACTIVE") {
    throw new Error(`Mission operation requires ACTIVE status; current status is ${execution?.status ?? "uninitialized"}.`);
  }
}

function createEvent(execution, type, message, details = {}, resources = null) {
  const elapsedHours = resources?.time.elapsedHours ?? 0;
  const eventTime = resources
    ? new Date(Date.parse(resources.missionStartTime) + elapsedHours * 60 * 60 * 1000).toISOString()
    : execution.updatedAt ?? execution.createdAt ?? new Date().toISOString();
  return {
    eventId: `execution-event-${String(execution.events.length + 1).padStart(4, "0")}`,
    type,
    message,
    status: "success",
    timestamp: eventTime,
    simulationTimeHours: elapsedHours,
    details,
  };
}

function appendEvent(execution, event) {
  return {
    ...execution,
    events: [...execution.events, event],
    updatedAt: event.timestamp,
  };
}

function objectiveState(configuration, observations = []) {
  const planned = new Set(
    (configuration.objectivePriorities ?? []).map(({ objectiveId }) => objectiveId),
  );
  return SCIENCE_OBJECTIVES.map((objective) => {
    const requirement = SCIENCE_CAPABILITY_REQUIREMENTS.find(
      ({ objectiveId }) => objectiveId === objective.id,
    );
    const investigated = new Set(
      observations
        .filter(({ objectiveId, status }) => objectiveId === objective.id && status === "success")
        .map(({ capabilityId }) => capabilityId),
    );
    const requiredCapabilities = (requirement?.requiredCapabilities ?? []).map((capability) => ({
      id: capability.id,
      label: capability.label,
      instrumentIds: [...capability.instrumentIds],
      investigated: investigated.has(capability.id),
    }));
    const total = requiredCapabilities.length;
    const complete = requiredCapabilities.filter(({ investigated: done }) => done).length;
    const selected = planned.has(objective.id);
    const completed = selected && total > 0 && complete === total;
    return {
      objectiveId: objective.id,
      name: objective.name,
      detail: objective.detail,
      selected,
      status: !selected ? "not-selected" : completed ? "completed" : complete > 0 ? "in-progress" : "planned",
      progress: total ? Math.round((complete / total) * 100) : 0,
      completed,
      completedCapabilities: complete,
      requiredCapabilities,
    };
  });
}

function findRoute(execution, destinationId) {
  const destination = getWaypoint(destinationId);
  if (!destination || destination.siteId !== execution.landingSiteId) {
    throw new RangeError(`Unknown destination for selected landing site: ${destinationId}`);
  }
  const origin = getWaypoint(execution.currentWaypointId);
  if (!origin) {
    throw new Error("Current rover location is unavailable.");
  }
  if (origin.id === destination.id) {
    throw new RangeError("Rover is already at the selected destination.");
  }
  const dx = destination.coordinates.x - origin.coordinates.x;
  const dy = destination.coordinates.y - origin.coordinates.y;
  const distanceKm = Math.round(
    Math.hypot(dx, dy) * MISSION_EXECUTION_CONFIG.mapDistanceScaleKm * 100,
  ) / 100;
  const durationHours = Math.round(
    (distanceKm / MISSION_EXECUTION_CONFIG.roverMovementSpeedKmPerHour) * 10000,
  ) / 10000;
  return {
    origin,
    destination,
    distanceKm,
    durationHours,
    movementPowerW: MISSION_EXECUTION_CONFIG.roverMovementPowerW,
  };
}

function getSampleType(sampleTypeId) {
  return MISSION_EXECUTION_CONFIG.sampleTypes.find(({ id }) => id === sampleTypeId) ?? null;
}

function currentProgress(execution, resources) {
  const selectedObjectives = execution.objectiveProgress.filter(({ selected }) => selected);
  const completedObjectives = selectedObjectives.filter(({ completed }) => completed);
  const allObjectivesComplete = selectedObjectives.length > 0
    && completedObjectives.length === selectedObjectives.length;
  const locationsRequirementMet = execution.exploredWaypointIds.length
    >= MISSION_COMPLETION_REQUIREMENTS.minimumExploredWaypoints;
  const transmissionRequirementMet = !MISSION_COMPLETION_REQUIREMENTS.requireTransmittedData
    || resources.data.transmittedMB > 0;
  return {
    totalObjectives: selectedObjectives.length,
    startedObjectives: selectedObjectives.filter(({ status }) => status === "in-progress" || status === "completed").length,
    completedObjectives: completedObjectives.length,
    samplesCollected: execution.samples.length,
    locationsExplored: execution.exploredWaypointIds.length,
    observationsRecorded: execution.observations.length,
    canComplete: allObjectivesComplete && locationsRequirementMet && transmissionRequirementMet,
    requirements: {
      allObjectivesComplete,
      locationsRequirementMet,
      transmissionRequirementMet,
    },
  };
}

export function calculateMissionRoute(execution, destinationId) {
  const route = findRoute(execution, destinationId);
  return {
    originId: route.origin.id,
    destinationId: route.destination.id,
    distanceKm: route.distanceKm,
    durationHours: route.durationHours,
    movementPowerW: route.movementPowerW,
    estimatedCostCredits: Math.round(
      route.durationHours * MISSION_RESOURCE_CONFIG.operationCostCreditsPerHour * 100,
    ) / 100,
  };
}

export function initializeMissionExecution({
  missionId,
  missionPlan,
  roverConfiguration,
  landingSiteId,
  settings = MISSION_RESOURCE_CONFIG,
} = {}) {
  if (!missionPlan?.configuration) {
    throw new Error("A configured mission plan is required to initialize execution.");
  }
  const freshPlan = buildMissionPlan(missionPlan.configuration, roverConfiguration);
  if (!isMissionPlanCurrent(missionPlan, roverConfiguration) || !freshPlan.validation.isReady) {
    throw new Error("Mission execution requires a current, fully validated mission plan.");
  }
  const resolvedMissionId = missionId ?? missionPlan.configuration.missionProfileId;
  if (resolvedMissionId !== missionPlan.configuration.missionProfileId) {
    throw new Error("Mission profile does not match the approved plan.");
  }
  const siteId = landingSiteId ?? missionPlan.configuration.landingSiteId;
  const waypoints = getSiteWaypoints(siteId);
  if (!waypoints.length) {
    throw new RangeError(`No surface waypoints are configured for landing site: ${siteId}`);
  }
  const roverValidation = validateRoverConfiguration(roverConfiguration, undefined, {
    selectedLandingSiteId: siteId,
    objectiveIds: missionPlan.configuration.objectivePriorities.map(({ objectiveId }) => objectiveId),
  });
  if (!roverValidation.isValid) {
    throw new Error(`Rover configuration is invalid: ${roverValidation.errors.map(({ message }) => message).join(" ")}`);
  }

  const resources = createMissionResources({
    roverConfiguration,
    missionId: resolvedMissionId,
    missionDurationSols: missionPlan.configuration.durationSols,
    settings,
  });
  const initialWaypoint = waypoints[0];
  const timestamp = new Date(Date.parse(resources.missionStartTime)).toISOString();
  const execution = {
    missionId: resolvedMissionId,
    missionName: missionPlan.configuration.missionName,
    missionPlan,
    landingSiteId: siteId,
    status: "ACTIVE",
    currentWaypointId: initialWaypoint.id,
    selectedDestinationId: null,
    currentActivity: "Surface survey",
    operationalStatus: "operational",
    distanceTraveledKm: 0,
    movementHistory: [],
    samples: [],
    sampleHistory: [],
    observations: [],
    objectiveProgress: objectiveState(missionPlan.configuration),
    exploredWaypointIds: [initialWaypoint.id],
    events: [{
      eventId: "execution-event-0001",
      type: "mission-initialized",
      message: `${missionPlan.configuration.missionName} initialized at ${initialWaypoint.name}.`,
      status: "success",
      timestamp,
      simulationTimeHours: 0,
      details: { waypointId: initialWaypoint.id, landingSiteId: siteId },
    }],
    completion: { completed: false, completedAt: null },
    createdAt: timestamp,
    updatedAt: timestamp,
    planSignature: missionPlan.sourceSignature,
    roverMetrics: calculateRoverMetrics(roverConfiguration, { selectedLandingSiteId: siteId }),
  };
  return { execution, resources };
}

export function transitionMissionStatus(
  execution,
  nextStatus,
  message = `Mission status changed to ${nextStatus}.`,
  resources = null,
) {
  if (!execution || !ALLOWED_TRANSITIONS[execution.status]?.has(nextStatus)) {
    throw new Error(`Invalid mission transition: ${execution?.status ?? "uninitialized"} -> ${nextStatus}.`);
  }
  const next = {
    ...execution,
    status: nextStatus,
  };
  const event = createEvent(next, "mission-status", message, {}, resources);
  return appendEvent(next, event);
}

export function pauseMissionExecution(execution, resources = null) {
  return transitionMissionStatus(execution, "PAUSED", "Mission execution paused.", resources);
}

export function resumeMissionExecution(execution, resources = null) {
  return transitionMissionStatus(execution, "ACTIVE", "Mission execution resumed.", resources);
}

export function failMissionExecution(execution, reason, resources = null) {
  const failed = transitionMissionStatus(execution, "FAILED", reason ?? "Mission execution failed.", resources);
  return { ...failed, operationalStatus: "failed" };
}

export function abortMissionExecution(execution, reason, resources = null) {
  return transitionMissionStatus(execution, "ABORTED", reason ?? "Mission execution aborted.", resources);
}

export function selectMissionDestination(execution, destinationId) {
  requireActive(execution);
  const route = calculateMissionRoute(execution, destinationId);
  return { ...execution, selectedDestinationId: destinationId, routePreview: route };
}

export function getScientificOperationOptions(execution, roverConfiguration, instrumentId) {
  const waypoint = getWaypoint(execution?.currentWaypointId);
  if (!waypoint || !roverConfiguration?.instruments?.includes(instrumentId)) {
    return [];
  }
  return execution.objectiveProgress.flatMap((objective) => {
    if (!objective.selected || !waypoint.objectiveIds.includes(objective.objectiveId)) {
      return [];
    }
    return objective.requiredCapabilities
      .filter(({ instrumentIds, investigated }) => instrumentIds.includes(instrumentId) && !investigated)
      .map(({ id: capabilityId, label }) => ({
        objectiveId: objective.objectiveId,
        objectiveName: objective.name,
        capabilityId,
        capabilityName: label,
        instrumentId,
      }));
  });
}

export function performNextScientificObservation(execution, resources, roverConfiguration, instrumentId, durationHours = MISSION_RESOURCE_CONFIG.defaultInstrumentOperationHours, settings = MISSION_RESOURCE_CONFIG) {
  const [target] = getScientificOperationOptions(execution, roverConfiguration, instrumentId);
  if (!target) {
    throw new Error(`No selected, uninvestigated science capability is available for ${instrumentId} at the current waypoint.`);
  }
  return performScientificObservation(
    execution,
    resources,
    roverConfiguration,
    instrumentId,
    target.objectiveId,
    target.capabilityId,
    durationHours,
    settings,
  );
}

export function moveMissionRover(execution, resources, roverConfiguration, destinationId = execution?.selectedDestinationId, settings = MISSION_RESOURCE_CONFIG) {
  requireActive(execution);
  if (execution.operationalStatus !== "operational") {
    throw new Error("Rover is not operational and cannot move.");
  }
  if (!destinationId) {
    throw new RangeError("Select a destination before moving the rover.");
  }
  const route = findRoute(execution, destinationId);
  const nextResources = recordMissionMovement(resources, roverConfiguration, {
    durationHours: route.durationHours,
    movementPowerW: route.movementPowerW,
    settings,
  });
  const movement = {
    movementId: `movement-${String(execution.movementHistory.length + 1).padStart(4, "0")}`,
    fromWaypointId: route.origin.id,
    toWaypointId: route.destination.id,
    distanceKm: route.distanceKm,
    durationHours: route.durationHours,
    timestamp: nextResources.events.at(-1).timestamp,
  };
  const next = {
    ...execution,
    currentWaypointId: route.destination.id,
    selectedDestinationId: null,
    routePreview: null,
    currentActivity: `Exploration at ${route.destination.name}`,
    distanceTraveledKm: Math.round((execution.distanceTraveledKm + route.distanceKm) * 100) / 100,
    movementHistory: [...execution.movementHistory, movement],
    exploredWaypointIds: execution.exploredWaypointIds.includes(route.destination.id)
      ? execution.exploredWaypointIds
      : [...execution.exploredWaypointIds, route.destination.id],
  };
  const event = createEvent(next, "rover-moved", `Rover reached ${route.destination.name}.`, movement, nextResources);
  return {
    execution: appendEvent(next, event),
    resources: nextResources,
  };
}

export function collectMissionSample(execution, resources, roverConfiguration, sampleTypeId, settings = MISSION_RESOURCE_CONFIG) {
  requireActive(execution);
  const waypoint = getWaypoint(execution.currentWaypointId);
  const sampleType = getSampleType(sampleTypeId);
  if (!waypoint?.activities.includes("sample") || !waypoint.sampleTypes.includes(sampleTypeId) || !sampleType) {
    throw new RangeError(`Sample type is not available at the current waypoint: ${sampleTypeId}`);
  }
  if (!roverConfiguration.instruments?.includes("regolith-sampler")) {
    throw new Error("Sample collection requires an installed regolith sampling system.");
  }
  const metrics = calculateRoverMetrics(roverConfiguration, { selectedLandingSiteId: execution.landingSiteId });
  const remainingPayload = Math.min(
    metrics.payloadRemainingKg ?? 0,
    resources.mass.remainingPayloadCapacityKg,
  );
  if (sampleType.massKg > remainingPayload) {
    throw new Error(`Sample weighs ${sampleType.massKg} kg, but only ${remainingPayload} kg of payload capacity remain.`);
  }
  const nextResources = recordMissionSampleCollection(resources, roverConfiguration, {
    sampleMassKg: sampleType.massKg,
    durationHours: MISSION_EXECUTION_CONFIG.sampleCollectionDurationHours,
    costCredits: MISSION_EXECUTION_CONFIG.sampleCollectionCostCredits,
    settings,
  });
  const sample = {
    sampleId: `sample-${String(execution.samples.length + 1).padStart(4, "0")}`,
    name: sampleType.name,
    locationId: waypoint.id,
    locationName: waypoint.name,
    sampleType: sampleType.id,
    collectionTime: nextResources.events.at(-1).timestamp,
    massKg: sampleType.massKg,
    scientificRelevance: `Illustrative ${sampleType.name.toLowerCase()} sample for planned surface science; no scientific conclusion is implied.`,
    status: "collected",
  };
  const next = {
    ...execution,
    samples: [...execution.samples, sample],
    sampleHistory: [...execution.sampleHistory, sample],
    currentActivity: `Collected ${sample.name}`,
  };
  return {
    execution: appendEvent(next, createEvent(next, "sample-collected", `${sample.name} collected at ${waypoint.name}.`, sample, nextResources)),
    resources: nextResources,
  };
}

export function performScientificObservation(
  execution,
  resources,
  roverConfiguration,
  instrumentId,
  objectiveId,
  capabilityId,
  durationHours = MISSION_RESOURCE_CONFIG.defaultInstrumentOperationHours,
  settings = MISSION_RESOURCE_CONFIG,
) {
  requireActive(execution);
  const objective = execution.objectiveProgress.find(({ objectiveId: id }) => id === objectiveId);
  if (!objective?.selected) {
    throw new RangeError(`Scientific objective is not selected in the mission plan: ${objectiveId}`);
  }
  const capability = objective.requiredCapabilities.find(({ id }) => id === capabilityId);
  if (!capability || !capability.instrumentIds.includes(instrumentId)) {
    throw new Error(`Instrument ${instrumentId} does not support ${capabilityId} for objective ${objectiveId}.`);
  }
  if (!roverConfiguration.instruments?.includes(instrumentId)) {
    throw new Error(`Instrument is not installed: ${instrumentId}`);
  }
  const waypoint = getWaypoint(execution.currentWaypointId);
  if (!waypoint?.activities.includes("science") || !waypoint.objectiveIds.includes(objectiveId)) {
    throw new Error(`Objective ${objectiveId} is not available at the current waypoint.`);
  }
  if (objective.requiredCapabilities.find(({ id }) => id === capabilityId)?.investigated) {
    throw new Error(`Capability already investigated: ${capability.label}`);
  }

  const nextResources = collectScientificData(resources, roverConfiguration, instrumentId, durationHours, settings);
  const instrument = nextResources.events.at(-1);
  const observation = {
    observationId: `observation-${String(execution.observations.length + 1).padStart(4, "0")}`,
    instrumentId,
    objectiveId,
    capabilityId,
    locationId: waypoint.id,
    locationName: waypoint.name,
    timestamp: instrument.timestamp,
    durationHours,
    generatedDataMB: instrument.resourceChanges.dataStoredMB,
    status: "success",
    note: `Illustrative observation for ${capability.label.toLowerCase()}; it is not a real Mars measurement.`,
  };
  const observations = [...execution.observations, observation];
  const next = {
    ...execution,
    observations,
    objectiveProgress: objectiveState(execution.missionPlan.configuration, observations),
    currentActivity: `Observing ${objective.name}`,
  };
  return {
    execution: appendEvent(next, createEvent(next, "scientific-observation", `${capability.label} observed with ${instrumentId}.`, observation, nextResources)),
    resources: nextResources,
  };
}

export function executeMissionTransmission(execution, resources, roverConfiguration, settings = MISSION_RESOURCE_CONFIG) {
  requireActive(execution);
  const nextResources = transmitMissionData(resources, roverConfiguration, settings);
  const transmissionEvent = nextResources.events.at(-1);
  const next = {
    ...execution,
    currentActivity: transmissionEvent.status === "success" ? "Transmitted science data" : "Transmission attempt failed",
  };
  return {
    execution: appendEvent({
      ...next,
    }, {
      ...createEvent(
      next,
      transmissionEvent.type,
      transmissionEvent.description,
      transmissionEvent.resourceChanges,
      nextResources,
      ),
      status: transmissionEvent.status,
    }),
    resources: nextResources,
  };
}

export function executeMissionIdle(execution, resources, roverConfiguration, durationHours = 1, settings = MISSION_RESOURCE_CONFIG) {
  requireActive(execution);
  const nextResources = advanceMissionTime(resources, roverConfiguration, durationHours, settings);
  const next = { ...execution, currentActivity: "Standby" };
  return {
    execution: appendEvent(next, createEvent(next, "mission-idle", `Rover remained in standby for ${durationHours} h.`, { durationHours }, nextResources)),
    resources: nextResources,
  };
}

export function executeMissionEmergencyDelay(execution, resources, roverConfiguration, durationHours = 1, settings = MISSION_RESOURCE_CONFIG) {
  requireActive(execution);
  const nextResources = recordEmergencyDelay(resources, roverConfiguration, durationHours, settings);
  const next = { ...execution, currentActivity: "Emergency delay" };
  return {
    execution: appendEvent(next, createEvent(next, "emergency-delay", `Emergency delay recorded for ${durationHours} h.`, { durationHours }, nextResources)),
    resources: nextResources,
  };
}

export function executeMissionMaintenance(execution, resources, roverConfiguration, settings = MISSION_RESOURCE_CONFIG) {
  requireActive(execution);
  const nextResources = recordMaintenance(resources, roverConfiguration, settings);
  const next = { ...execution, currentActivity: "Maintenance" };
  return {
    execution: appendEvent(next, createEvent(next, "maintenance", "Rover maintenance recorded.", {}, nextResources)),
    resources: nextResources,
  };
}

export function updateMissionPowerEnvironment(execution, resources, roverConfiguration, environmentId, settings = MISSION_RESOURCE_CONFIG) {
  requireActive(execution);
  const nextResources = setPowerEnvironment(resources, roverConfiguration, environmentId, settings);
  const next = { ...execution, currentActivity: "Power environment updated" };
  return {
    execution: appendEvent(next, createEvent(next, "power-environment", `Power environment set to ${environmentId}.`, {}, nextResources)),
    resources: nextResources,
  };
}

export function getMissionExecutionProgress(execution, resources) {
  return currentProgress(execution, resources);
}

export function completeMissionExecution(execution, resources) {
  requireActive(execution);
  const progress = currentProgress(execution, resources);
  if (!progress.canComplete) {
    throw new Error("Mission completion requirements are not met.");
  }
  const completed = {
    ...execution,
    status: "COMPLETED",
    currentActivity: "Mission complete",
    completion: {
      completed: true,
      completedAt: new Date(Date.parse(resources.missionStartTime) + resources.time.elapsedHours * 60 * 60 * 1000).toISOString(),
    },
  };
  return appendEvent(completed, createEvent(completed, "mission-completed", "All configured mission completion requirements were met.", progress, resources));
}

export function getMissionAvailableWaypoints(execution) {
  return getSiteWaypoints(execution.landingSiteId);
}

export function getMissionWaypoint(waypointId) {
  return getWaypoint(waypointId);
}

export function isMissionTerminal(execution) {
  return TERMINAL_STATES.has(execution?.status);
}
