import test from "node:test";
import assert from "node:assert/strict";
import {
  getAvailableScientistDialogues as availableDialogues,
  getNextScientistDialogue as nextDialogue,
  getScientistDialogueHistory as dialogueHistory,
  getScientistDialogueDefinitions,
  initializeScientistDialogue,
  markScientistDialogueViewed,
  resetScientistDialogue,
  synchronizeScientistDialogue,
} from "../js/scientist.js";
import {
  SCIENTIST_DIALOGUE_CATEGORIES,
} from "../js/scientist.js";
import {
  acceptMission,
  advanceScientistDialogue,
  assignRole,
  collectSample,
  getAvailableScientistDialogues,
  getCurrentScientistDialogue,
  getScientistDialogueHistory,
  getState,
  navigateTo,
  operateInstrument,
  moveRoverToDestination,
  resolveChallenge,
  resetMission,
  selectMission,
  selectMissionDestination,
  selectRoverOption,
  toggleMissionObjective,
} from "../js/state.js";

function openMissionControl({ sampler = false } = {}) {
  resetMission();
  selectMission("MARS-01");
  acceptMission();
  assignRole("aerospace-engineer");
  navigateTo("planning");
  if (sampler) {
    toggleMissionObjective("agriculture");
    toggleMissionObjective("atmosphere");
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
    ...(sampler
      ? ["regolith-sampler", "weather-station"]
      : ["ground-penetrating-radar", "weather-station"]),
  ]) {
    selectRoverOption("instruments", instrumentId);
  }
  navigateTo("control");
}

test("dialogue definitions are structured, categorized, and educational", () => {
  const definitions = getScientistDialogueDefinitions();
  assert.ok(definitions.length > 10);
  assert.deepEqual(
    new Set(definitions.map(({ category }) => category)),
    new Set(SCIENTIST_DIALOGUE_CATEGORIES),
  );
  for (const definition of definitions) {
    assert.equal(typeof definition.id, "string");
    assert.equal(definition.speaker, "Dr. Chen");
    assert.equal(typeof definition.text, "string");
    assert.equal(typeof definition.missionStage, "string");
    assert.equal(typeof definition.priority, "number");
    assert.equal(definition.displayStatus, "LOCKED");
    assert.ok(definition.triggerConditions);
    assert.ok(definition.unlockConditions);
  }
  assert.ok(definitions.some(({ text }) => /does not report real discoveries/.test(text)));
  assert.ok(definitions.some(({ text }) => /radiation/i.test(text)));
  assert.ok(definitions.some(({ text }) => /regolith/i.test(text)));
  assert.ok(definitions.some(({ text }) => /water ice/i.test(text)));
});

test("initialization, retrieval, viewed status, history, and reset are deterministic", () => {
  const initial = initializeScientistDialogue("MARS-01");
  assert.equal(initial.missionId, "MARS-01");
  assert.deepEqual(availableDialogues(initial), []);
  assert.equal(nextDialogue(initial), null);
  assert.deepEqual(dialogueHistory(initial), []);
  assert.deepEqual(resetScientistDialogue(initial, "MARS-02"), {
    missionId: "MARS-02",
    unlocked: [],
    history: [],
  });

  const unlocked = synchronizeScientistDialogue(initial, {
    currentMissionId: "MARS-01",
    selectedLandingSiteId: "jezero",
    screen: "roles",
    screenHistory: ["briefing"],
    missionExecution: null,
    resources: null,
  });
  const introduction = nextDialogue(unlocked);
  assert.equal(introduction.definitionId, "mission-introduction");
  assert.equal(introduction.category, "INTRODUCTION");
  assert.equal(introduction.displayStatus, "AVAILABLE");
  const viewed = markScientistDialogueViewed(unlocked, introduction.dialogueId);
  assert.equal(viewed.unlocked[0].displayStatus, "VIEWED");
  assert.equal(dialogueHistory(viewed).length, 1);
  assert.equal(nextDialogue(viewed), null);
  assert.equal(unlocked.unlocked[0].displayStatus, "AVAILABLE");
  assert.throws(
    () => markScientistDialogueViewed(viewed, introduction.dialogueId),
    /not available/,
  );
  assert.deepEqual(resetScientistDialogue(viewed, "MARS-02"), {
    missionId: "MARS-02",
    unlocked: [],
    history: [],
  });
});

test("mission stage dialogue unlocks progressively without duplicate entries", () => {
  openMissionControl();
  const state = getState();
  const entries = getAvailableScientistDialogues();
  const definitionIds = entries.map(({ definitionId }) => definitionId);
  assert.ok(definitionIds.includes("mission-introduction"));
  assert.ok(definitionIds.includes("mission-briefing-science"));
  assert.ok(definitionIds.includes("rover-instrument-guidance"));
  assert.ok(definitionIds.includes("surface-exploration-guidance"));
  assert.equal(new Set(entries.map(({ dialogueId }) => dialogueId)).size, entries.length);
  assert.ok(Object.isFrozen(state.scientistDialogue));

  navigateTo("scientist");
  const first = getCurrentScientistDialogue();
  assert.equal(first.definitionId, "mission-introduction");
  const resourcesBefore = getState().resources;
  const executionBefore = getState().missionExecution;
  advanceScientistDialogue(first.dialogueId);
  assert.equal(getScientistDialogueHistory().length, 1);
  assert.equal(getCurrentScientistDialogue().definitionId, "mission-briefing-science");
  assert.equal(getState().resources, resourcesBefore);
  assert.equal(getState().missionExecution, executionBefore);
  assert.throws(() => advanceScientistDialogue(first.dialogueId), /not the current available message/);
});

test("waypoint and observation guidance use actual mission events and do not repeat", () => {
  openMissionControl();
  operateInstrument("spectrometer", "minerals", "mineral-identification");
  const observationMessages = getAvailableScientistDialogues().filter(
    ({ sourceEventId }) => sourceEventId?.startsWith("execution-event-"),
  );
  const observation = observationMessages.find(
    ({ definitionId }) => definitionId === "observation-feedback",
  );
  assert.ok(observation);
  assert.match(observation.text, /Spectrometer/);
  assert.match(observation.text, /illustrative/);
  assert.ok(getAvailableScientistDialogues().some(
    ({ definitionId }) => definitionId === "mineral-composition-guidance",
  ));

  selectMissionDestination("jezero-delta");
  moveRoverToDestination();
  const waypointMessage = getAvailableScientistDialogues().find(
    ({ definitionId }) => definitionId === "new-waypoint-guidance",
  );
  assert.ok(waypointMessage);
  assert.match(waypointMessage.text, /Layered Delta/);
  assert.ok(!waypointMessage.text.includes("undefined"));

  const count = getState().scientistDialogue.unlocked.length;
  const repeated = synchronizeScientistDialogue(getState().scientistDialogue, getState());
  assert.equal(repeated.unlocked.length, count);
});

test("sample collection unlocks sample analysis tied to the collected sample", () => {
  openMissionControl({ sampler: true });
  collectSample("regolith");
  const message = getAvailableScientistDialogues().find(
    ({ definitionId }) => definitionId === "sample-analysis-guidance",
  );
  assert.ok(message);
  assert.match(message.text, /Regolith/);
  assert.match(message.text, /does not establish composition or habitability/);
  assert.equal(getState().missionExecution.sampleHistory.length, 1);
});

test("dust-storm challenge dialogue follows the actual trigger and resolution events", () => {
  openMissionControl();
  operateInstrument("spectrometer", "minerals", "mineral-identification");
  const warning = getAvailableScientistDialogues().find(
    ({ definitionId }) => definitionId === "dust-storm-response",
  );
  assert.ok(warning);
  assert.match(warning.text, /dust-storm challenge/);
  assert.ok(getState().missionExecution.events.some(
    ({ type, details }) => type === "challenge-triggered" && details.challengeTypeId === "dust-storm",
  ));

  navigateTo("scientist");
  while (getCurrentScientistDialogue()?.definitionId !== "dust-storm-response") {
    advanceScientistDialogue(getCurrentScientistDialogue().dialogueId);
  }
  advanceScientistDialogue(getCurrentScientistDialogue().dialogueId);
  navigateTo("control");
  const dust = getState().missionExecution.challengeHistory.find(({ typeId }) => typeId === "dust-storm");
  resolveChallenge(dust.challengeId, "continue-operations");
  const response = getAvailableScientistDialogues().find(
    ({ definitionId }) => definitionId === "challenge-resolution-response",
  );
  assert.ok(response);
  assert.match(response.text, /Dust storm was resolved with/);
  assert.match(response.text, /drew 90 Wh from the battery/);
  assert.match(response.text, /power factor to 55%/);
  assert.match(response.text, /credits in this illustrative simulation/);
});

test("instrument failure dialogue identifies the unavailable instrument and affected work", () => {
  openMissionControl({ sampler: true });
  operateInstrument("spectrometer", "minerals", "mineral-identification");
  operateInstrument("soil-analyzer", "regolith", "soil-characterization");
  const instrumentChallenge = getState().missionExecution.challengeHistory.find(
    ({ typeId }) => typeId === "instrument-malfunction",
  );
  assert.equal(instrumentChallenge.instrumentId, "soil-analyzer");
  assert.equal(
    getState().missionExecution.operationalCondition.instruments["soil-analyzer"],
    "failed",
  );
  const guidance = getAvailableScientistDialogues().find(
    ({ definitionId }) => definitionId === "instrument-unavailable-guidance",
  );
  assert.ok(guidance);
  assert.match(guidance.text, /Soil composition analyzer/);
  assert.match(guidance.text, /observations requiring Soil composition analyzer, cannot be performed/);
  assert.throws(
    () => operateInstrument("soil-analyzer", "regolith", "soil-characterization"),
    /malfunctioned and must be recovered/,
  );
});

test("low-battery guidance is tied to the live resource snapshot and unlocks once", () => {
  openMissionControl();
  const state = getState();
  const lowBatteryState = {
    ...state,
    resources: {
      ...state.resources,
      power: {
        ...state.resources.power,
        batteryEnergyWh: state.resources.power.batteryCapacityWh * 0.2,
      },
    },
  };
  const synchronized = synchronizeScientistDialogue(state.scientistDialogue, lowBatteryState);
  const guidance = availableDialogues(synchronized).find(
    ({ definitionId }) => definitionId === "low-battery-encouragement",
  );
  assert.ok(guidance);
  assert.match(guidance.text, /20% of configured capacity/);
  assert.equal(
    synchronizeScientistDialogue(synchronized, lowBatteryState).unlocked.length,
    synchronized.unlocked.length,
  );
});

test("dialogue state resets for a newly accepted mission and rejects invalid access", () => {
  resetMission();
  assert.equal(getCurrentScientistDialogue(), null);
  assert.throws(() => navigateTo("scientist"), /Cannot navigate/);
  assert.throws(() => advanceScientistDialogue("missing"), /only advance from an accepted mission/);

  selectMission("MARS-02");
  acceptMission();
  assert.equal(getState().scientistDialogue.missionId, "MARS-02");
  assert.deepEqual(getScientistDialogueHistory(), []);
  assert.equal(getCurrentScientistDialogue().definitionId, "mission-introduction");
});
