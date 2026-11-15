import {
  CHALLENGE_PRESENTATION,
  INITIAL_GAME_STATE,
  LANDING_SITES,
  MISSION_CATALOG,
  MISSION_RESOURCE_CONFIG,
  PLAYER_ROLES,
  PLAYER_SLOTS,
  ROVER_CATEGORIES,
} from "./data.js";
import { validateRoverConfiguration } from "./rover.js";
import {
  advanceMissionTime as advanceResourcesTime,
  collectScientificData,
  createMissionResources,
  recordEmergencyDelay as recordResourcesEmergencyDelay,
  recordMaintenance as recordResourcesMaintenance,
  setPowerEnvironment as updateResourcesEnvironment,
  transmitMissionData,
} from "./resources.js";

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
  roles: new Set(["briefing", "planning"]),
  planning: new Set(["roles", "rover"]),
  rover: new Set(["planning", "control"]),
  control: new Set(["rover", "challenge"]),
  challenge: new Set(["control", "scientist"]),
  scientist: new Set(["challenge", "results"]),
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
  if (screen === "control" && !state.currentMissionId) {
    throw new Error("Accept a mission briefing before opening mission control.");
  }
  if (screen === "control") {
    const validation = validateRoverConfiguration(state.rover, undefined, {
      selectedLandingSiteId: state.selectedLandingSiteId,
    });
    if (!validation.isValid) {
      throw new Error(`Rover configuration is invalid: ${validation.errors.map(({ message }) => message).join(" ")}`);
    }
  }
  const nextState = screen === "control" && state.resources === null
    ? {
      ...state,
      resources: createMissionResources({
        roverConfiguration: state.rover,
        missionId: state.currentMissionId,
        missionDurationSols: Number.parseFloat(getMission(state.currentMissionId).duration),
      }),
    }
    : state;
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
    resources: null,
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
    resources: null,
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
  return publish({ ...state, selectedLandingSiteId: siteId });
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
  if (state.screen !== "control" || !state.resources) {
    throw new Error("Mission resource operations are only available in mission control.");
  }
}

export function operateInstrument(instrumentId, durationHours = MISSION_RESOURCE_CONFIG.defaultInstrumentOperationHours) {
  requireMissionControl();
  const resources = collectScientificData(state.resources, state.rover, instrumentId, durationHours);
  return publish({ ...state, resources });
}

export function transmitMissionDataToControl() {
  requireMissionControl();
  const resources = transmitMissionData(state.resources, state.rover);
  return publish({ ...state, resources });
}

export function advanceMissionIdleTime(durationHours) {
  requireMissionControl();
  const resources = advanceResourcesTime(state.resources, state.rover, durationHours);
  return publish({ ...state, resources });
}

export function recordMaintenance() {
  requireMissionControl();
  const resources = recordResourcesMaintenance(state.resources, state.rover);
  return publish({ ...state, resources });
}

export function recordEmergencyDelay(durationHours) {
  requireMissionControl();
  const resources = recordResourcesEmergencyDelay(
    state.resources,
    state.rover,
    durationHours,
  );
  return publish({ ...state, resources });
}

export function selectPowerEnvironment(environmentId) {
  requireMissionControl();
  if (state.resources.power.environmentId === environmentId) {
    return state;
  }
  const resources = updateResourcesEnvironment(
    state.resources,
    state.rover,
    environmentId,
  );
  return publish({ ...state, resources });
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
