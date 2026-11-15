import {
  CHALLENGE_PRESENTATION,
  INITIAL_GAME_STATE,
  LANDING_SITES,
  MISSION_CATALOG,
  MISSION_RESOURCE_CONFIG,
  MISSION_STRATEGIES,
  PLAYER_ROLES,
  PLAYER_SLOTS,
  ROVER_CATEGORIES,
  SCIENCE_OBJECTIVES,
} from "./data.js";
import { validateRoverConfiguration } from "./rover.js";
import {
  buildMissionPlan,
  createMissionPlanConfiguration,
  validatePlanningInputs,
} from "./planning.js";
import {
  abortMissionExecution,
  collectMissionSample,
  completeMissionExecution,
  executeMissionIdle,
  executeMissionEmergencyDelay,
  executeMissionMaintenance,
  executeMissionTransmission,
  failMissionExecution,
  getActiveMissionChallenges as getExecutionActiveChallenges,
  getMissionChallengeHistory as getExecutionChallengeHistory,
  getScientificOperationOptions,
  initializeMissionExecution,
  moveMissionRover,
  pauseMissionExecution,
  performNextScientificObservation,
  performScientificObservation,
  resumeMissionExecution,
  resolveMissionChallenge as resolveExecutionChallenge,
  recoverMissionEquipment as recoverExecutionEquipment,
  selectMissionDestination as selectExecutionDestination,
  updateMissionPowerEnvironment,
} from "./mission.js";
import {
  getAvailableScientistDialogues as availableDialoguesForState,
  getNextScientistDialogue as getNextDialogue,
  getScientistDialogueHistory as getDialogueHistory,
  initializeScientistDialogue,
  markScientistDialogueViewed,
  synchronizeScientistDialogue,
} from "./scientist.js";
import { evaluateMission } from "./evaluation.js";

const VALID_SCREENS = new Set([
  "home",
  "briefing",
  "roles",
  "planning",
  "rover",
  "control",
  "challenge",
  "scientist",
  "results",
  "archive",
  "how-to",
  "settings",
  "credits",
]);

const TRANSITIONS = Object.freeze({
  home: new Set(["briefing", "archive", "how-to", "settings", "credits"]),
  briefing: new Set(["roles", "archive"]),
  roles: new Set(["briefing", "planning", "scientist"]),
  planning: new Set(["roles", "rover", "scientist"]),
  rover: new Set(["planning", "control", "scientist"]),
  control: new Set(["rover", "challenge", "scientist", "results"]),
  challenge: new Set(["control", "scientist"]),
  scientist: new Set(["roles", "planning", "rover", "control", "challenge", "results"]),
  results: new Set(["briefing"]),
  archive: new Set(["briefing"]),
  "how-to": new Set(),
  settings: new Set(),
  credits: new Set(),
});

const listeners = new Set();
let state = freezeDeep({ ...INITIAL_GAME_STATE });

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function publish(nextState) {
  if (nextState.missionPlan?.configuration && nextState.currentMissionId) {
    const configuration = {
      ...nextState.missionPlan.configuration,
      missionProfileId: nextState.currentMissionId,
      landingSiteId: nextState.selectedLandingSiteId,
    };
    nextState = {
      ...nextState,
      missionPlan: buildMissionPlan(configuration, nextState.rover),
    };
  }
  nextState = {
    ...nextState,
    scientistDialogue: synchronizeScientistDialogue(
      nextState.scientistDialogue ?? initializeScientistDialogue(),
      nextState,
    ),
  };
  if (
    !nextState.missionEvaluation
    && ["COMPLETED", "ABORTED", "FAILED"].includes(nextState.missionExecution?.status)
  ) {
    nextState = {
      ...nextState,
      missionEvaluation: evaluateMission(nextState),
    };
  }
  state = freezeDeep(nextState);
  listeners.forEach((listener) => listener(state));
  return state;
}

function getMission(missionId) {
  const mission = MISSION_CATALOG.find(({ id }) => id === missionId);
  if (!mission) {
    throw new RangeError(`Unknown mission profile: ${missionId}`);
  }
  return mission;
}

function navigate(screen, nextState = state) {
  return publish({
    ...nextState,
    screen,
    screenHistory: [...state.screenHistory, state.screen],
  });
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  if (typeof listener !== "function") {
    throw new TypeError("State subscriber must be a function.");
  }

  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function completeLoading() {
  if (state.loadingComplete) {
    return state;
  }
  return publish({ ...state, loadingComplete: true, screen: "home" });
}

export function navigateTo(screen) {
  if (!VALID_SCREENS.has(screen)) {
    throw new RangeError(`Unknown application screen: ${screen}`);
  }
  if (screen === state.screen) {
    return state;
  }
  if (!TRANSITIONS[state.screen].has(screen)) {
    throw new Error(`Cannot navigate from "${state.screen}" to "${screen}".`);
  }
  if (screen === "planning" && !state.playerAssignments.some(({ roleId }) => roleId)) {
    throw new Error("Assign at least one mission role before continuing to planning.");
  }
  if (screen === "rover" && !state.currentMissionId) {
    throw new Error("Accept a mission briefing before opening rover design.");
  }
  if (screen === "rover") {
    const planningInputs = validatePlanningInputs(state.missionPlan?.configuration);
    if (!planningInputs.isValid) {
      throw new Error(
        `Mission planning is incomplete: ${planningInputs.errors.map(({ message }) => message).join(" ")}`,
      );
    }
  }
  if (screen === "control" && !state.currentMissionId) {
    throw new Error("Accept a mission briefing before opening mission control.");
  }
  if (screen === "scientist" && !state.currentMissionId) {
    throw new Error("Accept a mission before opening Dr. Chen's science channel.");
  }
  if (screen === "control") {
    const validation = validateRoverConfiguration(state.rover, undefined, {
      selectedLandingSiteId: state.selectedLandingSiteId,
      objectiveIds: state.missionPlan?.configuration.objectivePriorities
        .map(({ objectiveId }) => objectiveId) ?? [],
    });
    if (!validation.isValid) {
      throw new Error(`Rover configuration is invalid: ${validation.errors.map(({ message }) => message).join(" ")}`);
    }
  }
  const missionPlan = screen === "control" && state.missionPlan?.configuration
    ? buildMissionPlan(state.missionPlan.configuration, state.rover)
    : state.missionPlan;
  if (screen === "control" && !missionPlan?.validation.isReady) {
    const failures = missionPlan?.validation.failedChecks
      .map(({ message }) => message)
      .join(" ") || "Complete and validate the mission plan first.";
    throw new Error(`Mission plan is not ready: ${failures}`);
  }
  let nextState = state;
  if (screen === "control" && state.resources === null) {
    const initialized = initializeMissionExecution({
      missionId: state.currentMissionId,
      missionPlan,
      roverConfiguration: state.rover,
      landingSiteId: state.selectedLandingSiteId,
    });
    nextState = {
      ...state,
      missionPlan,
      resources: initialized.resources,
      missionExecution: initialized.execution,
    };
  } else if (screen === "control") {
    nextState = {
      ...state,
      missionPlan,
    };
  }
  return navigate(screen, nextState);
}

export function returnToMenu() {
  return publish({ ...state, screen: "home", screenHistory: [] });
}

export function goBack() {
  if (state.screenHistory.length === 0) {
    return returnToMenu();
  }

  const previousScreen = state.screenHistory[state.screenHistory.length - 1];
  return publish({
    ...state,
    screen: previousScreen,
    screenHistory: state.screenHistory.slice(0, -1),
  });
}

export function selectMission(missionId) {
  getMission(missionId);
  if (!["home", "archive", "briefing", "results"].includes(state.screen)) {
    throw new Error(`Cannot select a mission from "${state.screen}".`);
  }
  return publish({
    ...state,
    selectedMissionId: missionId,
    currentMissionId: null,
    missionPlan: null,
    resources: null,
    missionExecution: null,
    missionEvaluation: null,
    screen: "briefing",
    screenHistory: [...state.screenHistory, state.screen],
  });
}

export function acceptMission() {
  if (state.screen !== "briefing") {
    throw new Error("A mission can only be accepted from its briefing.");
  }
  getMission(state.selectedMissionId);
  return publish({
    ...state,
    currentMissionId: state.selectedMissionId,
    missionPlan: {
      configuration: createMissionPlanConfiguration(
        state.selectedMissionId,
        state.selectedLandingSiteId,
      ),
    },
    resources: null,
    missionExecution: null,
    missionEvaluation: null,
    scientistDialogue: initializeScientistDialogue(state.selectedMissionId),
    screen: "roles",
    screenHistory: [...state.screenHistory, state.screen],
  });
}

export function selectPlayerSlot(slotId) {
  if (!PLAYER_SLOTS.some(({ id }) => id === slotId)) {
    throw new RangeError(`Unknown player slot: ${slotId}`);
  }
  return publish({ ...state, activePlayerSlotId: slotId });
}

export function assignRole(roleId) {
  if (!PLAYER_ROLES.some(({ id }) => id === roleId)) {
    throw new RangeError(`Unknown mission role: ${roleId}`);
  }
  return publish({
    ...state,
    playerAssignments: state.playerAssignments.map((assignment) =>
      assignment.slotId === state.activePlayerSlotId
        ? { ...assignment, roleId }
        : assignment,
    ),
  });
}

export function selectLandingSite(siteId) {
  if (!LANDING_SITES.some(({ id }) => id === siteId)) {
    throw new RangeError(`Unknown landing site: ${siteId}`);
  }
  if (state.resources) {
    throw new Error("Landing-site planning is locked after mission operations begin.");
  }
  if (state.selectedLandingSiteId === siteId) {
    return state;
  }
  return publish({ ...state, selectedLandingSiteId: siteId });
}

function requireEditableMissionPlan() {
  if (!state.missionPlan?.configuration || !["planning", "rover"].includes(state.screen)) {
    throw new Error("Mission planning can only be edited from the planning or rover-design screen.");
  }
  if (state.resources) {
    throw new Error("Mission planning is locked after mission operations begin.");
  }
}

export function selectPlanningMissionProfile(missionId) {
  requireEditableMissionPlan();
  const mission = getMission(missionId);
  const previousMission = getMission(state.currentMissionId);
  const configuration = state.missionPlan.configuration;
  const previousDefaultDuration = Number.parseFloat(previousMission.duration);
  const durationSols = configuration.durationSols === previousDefaultDuration
    ? Number.parseFloat(mission.duration)
    : configuration.durationSols;
  const defaultName = `${previousMission.title} Mission`;
  const missionName = configuration.missionName === defaultName
    ? `${mission.title} Mission`
    : configuration.missionName;
  return publish({
    ...state,
    selectedMissionId: missionId,
    currentMissionId: missionId,
    missionPlan: {
      configuration: {
        ...configuration,
        missionName,
        missionProfileId: missionId,
        durationSols,
      },
    },
  });
}

export function updateMissionPlanField(field, value) {
  requireEditableMissionPlan();
  if (field !== "missionName" && field !== "durationSols") {
    throw new RangeError(`Unknown mission planning field: ${field}`);
  }
  const nextValue = field === "missionName"
    ? value
    : Number(value);
  if (field === "missionName" && typeof nextValue !== "string") {
    throw new TypeError("Mission name must be text.");
  }
  return publish({
    ...state,
    missionPlan: {
      configuration: {
        ...state.missionPlan.configuration,
        [field]: nextValue,
      },
    },
  });
}

export function toggleMissionObjective(objectiveId) {
  requireEditableMissionPlan();
  if (!SCIENCE_OBJECTIVES.some(({ id }) => id === objectiveId)) {
    throw new RangeError(`Unknown scientific objective: ${objectiveId}`);
  }
  const objectives = state.missionPlan.configuration.objectivePriorities;
  const existing = objectives.find(({ objectiveId: id }) => id === objectiveId);
  const objectivePriorities = existing
    ? objectives.filter(({ objectiveId: id }) => id !== objectiveId)
    : [...objectives, {
      objectiveId,
      priority: Math.min(
        SCIENCE_OBJECTIVES.length,
        Math.max(0, ...objectives.map(({ priority }) => priority)) + 1,
      ),
    }];
  return publish({
    ...state,
    missionPlan: {
      configuration: {
        ...state.missionPlan.configuration,
        objectivePriorities,
      },
    },
  });
}

export function setMissionObjectivePriority(objectiveId, priority) {
  requireEditableMissionPlan();
  if (!SCIENCE_OBJECTIVES.some(({ id }) => id === objectiveId)) {
    throw new RangeError(`Unknown scientific objective: ${objectiveId}`);
  }
  if (!Number.isInteger(priority) || priority < 1 || priority > SCIENCE_OBJECTIVES.length) {
    throw new RangeError(`Objective priority must be between 1 and ${SCIENCE_OBJECTIVES.length}.`);
  }
  const objectivePriorities = state.missionPlan.configuration.objectivePriorities.map((item) =>
    item.objectiveId === objectiveId ? { ...item, priority } : item,
  );
  if (objectivePriorities.length === state.missionPlan.configuration.objectivePriorities.length) {
    return publish({
      ...state,
      missionPlan: {
        configuration: {
          ...state.missionPlan.configuration,
          objectivePriorities,
        },
      },
    });
  }
  throw new Error("Select the scientific objective before assigning its priority.");
}

export function selectMissionStrategy(strategyId) {
  requireEditableMissionPlan();
  if (!MISSION_STRATEGIES.some(({ id }) => id === strategyId)) {
    throw new RangeError(`Unknown mission strategy: ${strategyId}`);
  }
  if (state.missionPlan.configuration.strategyId === strategyId) {
    return state;
  }
  return publish({
    ...state,
    missionPlan: {
      configuration: {
        ...state.missionPlan.configuration,
        strategyId,
      },
    },
  });
}

export function selectChallengeDecision(decisionId) {
  if (!CHALLENGE_PRESENTATION.decisions.some(({ id }) => id === decisionId)) {
    throw new RangeError(`Unknown scenario discussion prompt: ${decisionId}`);
  }
  return publish({ ...state, selectedChallengeDecisionId: decisionId });
}

export function selectRoverOption(categoryId, optionId) {
  if (state.resources) {
    throw new Error("Rover configuration is locked after mission operations begin.");
  }
  const category = ROVER_CATEGORIES.find(({ id }) => id === categoryId);
  if (!category || !category.options.some(({ id }) => id === optionId)) {
    throw new RangeError(`Unknown rover configuration: ${categoryId}/${optionId}`);
  }
  if (categoryId === "instruments") {
    const installed = new Set(state.rover.instruments);
    if (installed.has(optionId)) {
      installed.delete(optionId);
    } else {
      installed.add(optionId);
    }
    return publish({
      ...state,
      rover: { ...state.rover, instruments: [...installed] },
    });
  }
  if (state.rover[categoryId] === optionId) {
    return state;
  }
  return publish({ ...state, rover: { ...state.rover, [categoryId]: optionId } });
}

export function resetRoverConfiguration() {
  if (state.resources) {
    throw new Error("Rover configuration is locked after mission operations begin.");
  }
  return publish({
    ...state,
    rover: INITIAL_GAME_STATE.rover,
  });
}

function requireMissionControl() {
  if (!["control", "challenge"].includes(state.screen) || !state.resources) {
    throw new Error("Mission resource operations are only available in mission control or the linked challenge center.");
  }
  if (!state.missionExecution) {
    throw new Error("Mission execution is not initialized.");
  }
}

function publishMissionOperation(result) {
  return publish({
    ...state,
    resources: result.resources,
    missionExecution: result.execution,
  });
}

export function operateInstrument(
  instrumentId,
  objectiveId = null,
  capabilityId = null,
  durationHours = MISSION_RESOURCE_CONFIG.defaultInstrumentOperationHours,
) {
  requireMissionControl();
  if (!objectiveId && !capabilityId) {
    return publishMissionOperation(performNextScientificObservation(
      state.missionExecution,
      state.resources,
      state.rover,
      instrumentId,
      durationHours,
    ));
  }
  return publishMissionOperation(performScientificObservation(
    state.missionExecution,
    state.resources,
    state.rover,
    instrumentId,
    objectiveId,
    capabilityId,
    durationHours,
  ));
}

export function getAvailableScientificOperations(instrumentId) {
  requireMissionControl();
  return getScientificOperationOptions(state.missionExecution, state.rover, instrumentId);
}

export function selectMissionDestination(waypointId) {
  requireMissionControl();
  const missionExecution = selectExecutionDestination(state.missionExecution, waypointId);
  return publish({ ...state, missionExecution });
}

export function moveRoverToDestination(waypointId = state.missionExecution?.selectedDestinationId) {
  requireMissionControl();
  const result = moveMissionRover(
    state.missionExecution,
    state.resources,
    state.rover,
    waypointId,
  );
  return publishMissionOperation(result);
}

export function collectSample(sampleTypeId) {
  requireMissionControl();
  return publishMissionOperation(collectMissionSample(
    state.missionExecution,
    state.resources,
    state.rover,
    sampleTypeId,
  ));
}

export function transmitMissionDataToControl() {
  requireMissionControl();
  return publishMissionOperation(executeMissionTransmission(
    state.missionExecution,
    state.resources,
    state.rover,
  ));
}

export function advanceMissionIdleTime(durationHours) {
  requireMissionControl();
  return publishMissionOperation(executeMissionIdle(
    state.missionExecution,
    state.resources,
    state.rover,
    durationHours,
  ));
}

export function recordMaintenance() {
  requireMissionControl();
  return publishMissionOperation(executeMissionMaintenance(
    state.missionExecution,
    state.resources,
    state.rover,
  ));
}

export function recordEmergencyDelay(durationHours) {
  requireMissionControl();
  return publishMissionOperation(executeMissionEmergencyDelay(
    state.missionExecution,
    state.resources,
    state.rover,
    durationHours,
  ));
}

export function selectPowerEnvironment(environmentId) {
  requireMissionControl();
  if (state.resources.power.environmentId === environmentId) {
    return state;
  }
  return publishMissionOperation(updateMissionPowerEnvironment(
    state.missionExecution,
    state.resources,
    state.rover,
    environmentId,
  ));
}

export function getActiveChallenges() {
  requireMissionControl();
  return Object.freeze(getExecutionActiveChallenges(state.missionExecution));
}

export function getAvailableScientistDialogues() {
  return availableDialoguesForState(state.scientistDialogue);
}

export function getCurrentScientistDialogue() {
  return getNextDialogue(state.scientistDialogue);
}

export function getScientistDialogueHistory() {
  return getDialogueHistory(state.scientistDialogue);
}

export function advanceScientistDialogue(dialogueId) {
  if (state.screen !== "scientist" || !state.currentMissionId) {
    throw new Error("Scientist dialogue can only advance from an accepted mission's science channel.");
  }
  const currentDialogue = getNextDialogue(state.scientistDialogue);
  if (!currentDialogue || currentDialogue.dialogueId !== dialogueId) {
    throw new Error(`Scientist dialogue is not the current available message: ${dialogueId}.`);
  }
  return publish({
    ...state,
    scientistDialogue: markScientistDialogueViewed(state.scientistDialogue, dialogueId),
  });
}

export function getChallengeHistory() {
  requireMissionControl();
  return Object.freeze(getExecutionChallengeHistory(state.missionExecution));
}

export function resolveChallenge(challengeId, decisionId) {
  requireMissionControl();
  return publishMissionOperation(resolveExecutionChallenge(
    state.missionExecution,
    state.resources,
    state.rover,
    challengeId,
    decisionId,
  ));
}

export function recoverEquipment(subsystem) {
  requireMissionControl();
  return publishMissionOperation(recoverExecutionEquipment(
    state.missionExecution,
    state.resources,
    state.rover,
    subsystem,
  ));
}

export function pauseMission() {
  requireMissionControl();
  return publish({
    ...state,
    missionExecution: pauseMissionExecution(state.missionExecution, state.resources),
  });
}

export function resumeMission() {
  requireMissionControl();
  return publish({
    ...state,
    missionExecution: resumeMissionExecution(state.missionExecution, state.resources),
  });
}

export function completeMission() {
  requireMissionControl();
  return publish({ ...state, missionExecution: completeMissionExecution(state.missionExecution, state.resources) });
}

export function abortMission(reason) {
  requireMissionControl();
  return publish({
    ...state,
    missionExecution: abortMissionExecution(state.missionExecution, reason, state.resources),
  });
}

export function failMission(reason) {
  requireMissionControl();
  return publish({
    ...state,
    missionExecution: failMissionExecution(state.missionExecution, reason, state.resources),
  });
}

export function setPreference(name, value) {
  if (name !== "reduceMotion" || typeof value !== "boolean") {
    throw new TypeError(`Invalid preference update: ${name}`);
  }

  return publish({
    ...state,
    preferences: { ...state.preferences, [name]: value },
  });
}

export function resetMission() {
  return publish({
    ...INITIAL_GAME_STATE,
    loadingComplete: state.loadingComplete,
    preferences: state.preferences,
  });
}
