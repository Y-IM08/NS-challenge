import {
  LANDING_SITES,
  MISSION_CATALOG,
  MISSION_EXECUTION_CONFIG,
  MISSION_SURFACE_WAYPOINTS,
  ROVER_CATEGORIES,
  SCIENCE_OBJECTIVES,
  SCIENTIST_PROFILE,
} from "./data.js";

export const SCIENTIST_DIALOGUE_CATEGORIES = Object.freeze([
  "INTRODUCTION",
  "MISSION_BRIEFING",
  "SCIENCE_GUIDANCE",
  "ROVER_GUIDANCE",
  "EXPLORATION",
  "SAMPLE_ANALYSIS",
  "CHALLENGE_RESPONSE",
  "MISSION_PROGRESS",
  "ENCOURAGEMENT",
  "MISSION_CONCLUSION",
]);

export const SCIENTIST_CHANNEL_EMPTY_MESSAGE =
  "Dr. Chen has no new messages. Continue mission operations to unlock guidance from recorded mission events.";

const definitions = Object.freeze([
  {
    id: "mission-introduction",
    category: "INTRODUCTION",
    missionStage: "mission-accepted",
    priority: 30,
    triggerConditions: { type: "mission-accepted" },
    unlockConditions: { missionAccepted: true },
    text: "Welcome to the science channel. Our work is to test ideas about Martian geology and resources with careful observations. This simulation records illustrative activities; it does not report real discoveries.",
  },
  {
    id: "mission-briefing-science",
    category: "MISSION_BRIEFING",
    missionStage: "planning-complete",
    priority: 30,
    triggerConditions: { type: "planning-completed" },
    unlockConditions: { missionAccepted: true, planningVisited: true },
    text: "For {{missionTitle}} at {{siteName}}, connect each observation to a question: what rocks and minerals are present, what does the loose regolith imply for mobility, and what evidence would be needed before making a settlement claim? Water and ice indicators require multiple lines of evidence.",
  },
  {
    id: "habitability-context",
    category: "MISSION_BRIEFING",
    missionStage: "planning-complete",
    priority: 20,
    triggerConditions: { type: "planning-completed" },
    unlockConditions: { missionAccepted: true, planningVisited: true },
    text: "Habitability is a question about interacting conditions—liquid water stability, energy sources, chemistry, and environmental history—not a single mineral or site label. This mission can frame questions, but the game does not detect life or establish a habitable site.",
  },
  {
    id: "rover-instrument-guidance",
    category: "ROVER_GUIDANCE",
    missionStage: "rover-ready",
    priority: 30,
    triggerConditions: { type: "rover-completed" },
    unlockConditions: { missionAccepted: true, roverReady: true },
    text: "The rover's instruments answer different questions. A spectrometer can support mineral-composition work, while a sampler acquires material for later analysis. Neither an installed instrument nor an illustrative game observation establishes a real result.",
  },
  {
    id: "surface-exploration-guidance",
    category: "EXPLORATION",
    missionStage: "execution-started",
    priority: 20,
    triggerConditions: { type: "execution-started" },
    unlockConditions: { executionStarted: true },
    text: "Begin with the local context. Mars has diverse volcanic, sedimentary, and impact-modified terrains; a waypoint label in this simulation is a planning abstraction, not a verified field site. Compare observations before drawing conclusions.",
  },
  {
    id: "radiation-context",
    category: "SCIENCE_GUIDANCE",
    missionStage: "execution-started",
    priority: 10,
    triggerConditions: { type: "execution-started" },
    unlockConditions: { executionStarted: true },
    text: "Mars lacks Earth's global magnetic-field protection and has a thin atmosphere, so surface radiation is an important habitat-design concern. Exposure varies with location, time, and shielding; this simulator does not model radiation dose or protection performance.",
  },
  {
    id: "new-waypoint-guidance",
    category: "EXPLORATION",
    missionStage: "new-waypoint",
    priority: 30,
    triggerConditions: { type: "event", eventType: "rover-moved" },
    unlockConditions: { executionStarted: true },
    text: "At {{waypointName}}, consider the mapped context: {{waypointContext}} These are educational site notes, not measurements from Mars. Check the route and nearby science activities before choosing the next operation.",
  },
  {
    id: "observation-feedback",
    category: "SCIENCE_GUIDANCE",
    missionStage: "scientific-observation",
    priority: 35,
    triggerConditions: { type: "event", eventType: "scientific-observation" },
    unlockConditions: { executionStarted: true },
    text: "The {{instrumentName}} recorded an illustrative {{capabilityName}} observation for {{objectiveName}} at {{waypointName}}. The simulator logs that an operation occurred; it does not calculate a scientific measurement or confirm a discovery.",
  },
  {
    id: "mineral-composition-guidance",
    category: "SCIENCE_GUIDANCE",
    missionStage: "mineral-observation",
    priority: 25,
    triggerConditions: { type: "observation-objective", objectiveId: "minerals" },
    unlockConditions: { executionStarted: true },
    text: "Mineral composition helps reconstruct how rocks formed and were altered. Spectral patterns can guide identification, but interpretation depends on calibration, context, and corroborating measurements; this gameplay record is not a mineral identification.",
  },
  {
    id: "atmospheric-guidance",
    category: "SCIENCE_GUIDANCE",
    missionStage: "atmospheric-observation",
    priority: 25,
    triggerConditions: { type: "observation-objective", objectiveId: "atmosphere" },
    unlockConditions: { executionStarted: true },
    text: "Atmospheric pressure, temperature, and wind can affect surface operations and habitat design. Short observations describe local conditions only; this simulation does not forecast Mars weather.",
  },
  {
    id: "sample-analysis-guidance",
    category: "SAMPLE_ANALYSIS",
    missionStage: "sample-collected",
    priority: 35,
    triggerConditions: { type: "event", eventType: "sample-collected" },
    unlockConditions: { executionStarted: true },
    text: "The {{sampleName}} sample was collected at {{waypointName}}. Samples can help investigate mineral history, alteration, and the presence of water-related materials, but collection alone does not establish composition or habitability.",
  },
  {
    id: "ice-evidence-guidance",
    category: "SCIENCE_GUIDANCE",
    missionStage: "ice-related-sample",
    priority: 25,
    triggerConditions: { type: "sample-type", sampleTypeId: "ice-related-material" },
    unlockConditions: { executionStarted: true },
    text: "Water ice is important to geology and future resource studies, but surface appearance or a sample label is not proof of accessible ice. Confirmation would require suitable measurements and an assessment of depth, purity, stability, and extraction constraints.",
  },
  {
    id: "dust-storm-response",
    category: "CHALLENGE_RESPONSE",
    missionStage: "dust-storm-triggered",
    priority: 100,
    triggerConditions: { type: "challenge-triggered", challengeTypeId: "dust-storm" },
    unlockConditions: { executionStarted: true },
    text: "The mission log records a dust-storm challenge. Suspended and deposited dust can reduce sunlight reaching solar arrays and can accumulate on surfaces. The selected response changes illustrative game resources; use the displayed power and battery ledger to guide operations.",
  },
  {
    id: "instrument-unavailable-guidance",
    category: "SCIENCE_GUIDANCE",
    missionStage: "instrument-unavailable",
    priority: 90,
    triggerConditions: { type: "challenge-triggered", challengeTypeId: "instrument-malfunction" },
    unlockConditions: { executionStarted: true },
    text: "The mission log shows {{instrumentName}} is unavailable until recovery. Its planned activity, {{affectedActivity}}, cannot be performed with that instrument while it is failed; other installed, operational instruments remain subject to their own capability limits.",
  },
  {
    id: "challenge-resolution-response",
    category: "CHALLENGE_RESPONSE",
    missionStage: "challenge-resolved",
    priority: 40,
    triggerConditions: { type: "challenge-resolved" },
    unlockConditions: { executionStarted: true },
    text: "{{challengeTitle}} was resolved with “{{decisionTitle}}.” {{decisionConsequence}} The recorded response used {{timeCost}} hours, {{batteryCost}} Wh, and {{budgetCost}} credits in this illustrative simulation. Review the current resource ledger before planning more work.",
  },
  {
    id: "low-battery-encouragement",
    category: "ENCOURAGEMENT",
    missionStage: "low-battery",
    priority: 95,
    triggerConditions: { type: "low-battery", batteryFractionAtMost: 0.25 },
    unlockConditions: { executionStarted: true },
    text: "The current game-state battery level is {{batteryPercent}}% of configured capacity. Energy reserves matter because movement, instruments, communications, and standby all draw power. Consider deferring nonessential operations; this threshold is a gameplay indicator, not an engineering limit.",
  },
  {
    id: "objective-progress-guidance",
    category: "MISSION_PROGRESS",
    missionStage: "objective-completed",
    priority: 30,
    triggerConditions: { type: "objective-completed" },
    unlockConditions: { executionStarted: true },
    text: "The mission log now marks {{objectiveName}} complete under its configured gameplay criteria. Treat that as simulator progress only; it is not evidence that the corresponding scientific question has been answered on Mars.",
  },
  {
    id: "mission-conclusion",
    category: "MISSION_CONCLUSION",
    missionStage: "mission-completed",
    priority: 100,
    triggerConditions: { type: "mission-completed" },
    unlockConditions: { missionCompleted: true },
    text: "Mission control recorded completion against the configured requirements. Review the event and resource history as a record of this playthrough, not as a real mission result or scientific conclusion.",
  },
]);

const categorySet = new Set(SCIENTIST_DIALOGUE_CATEGORIES);
const dialogueCatalog = Object.freeze(definitions.map((definition) => {
  if (!categorySet.has(definition.category)) {
    throw new TypeError(`Unknown scientist dialogue category: ${definition.category}`);
  }
  return Object.freeze({
    ...definition,
    speaker: SCIENTIST_PROFILE.name,
    triggerConditions: Object.freeze({ ...definition.triggerConditions }),
    unlockConditions: Object.freeze({ ...definition.unlockConditions }),
    displayStatus: "LOCKED",
  });
}));

function requireDialogueState(dialogueState) {
  if (!dialogueState || !Array.isArray(dialogueState.unlocked) || !Array.isArray(dialogueState.history)) {
    throw new TypeError("A valid scientist dialogue state is required.");
  }
}

function missionFacts(gameState) {
  const execution = gameState?.missionExecution ?? null;
  const visited = new Set([gameState?.screen, ...(gameState?.screenHistory ?? [])]);
  const mission = MISSION_CATALOG.find(({ id }) => id === gameState?.currentMissionId);
  const site = LANDING_SITES.find(({ id }) => id === gameState?.selectedLandingSiteId);
  const batteryCapacity = gameState?.resources?.power?.batteryCapacityWh ?? 0;
  const batteryEnergy = gameState?.resources?.power?.batteryEnergyWh ?? 0;
  const events = execution?.events ?? [];

  return {
    gameState,
    execution,
    events,
    mission,
    site,
    missionAccepted: Boolean(gameState?.currentMissionId && mission),
    planningVisited: visited.has("rover"),
    roverReady: Boolean(execution && gameState?.resources),
    executionStarted: events.some(({ type }) => type === "mission-initialized"),
    missionCompleted: execution?.status === "COMPLETED"
      && events.some(({ type }) => type === "mission-completed"),
    batteryFraction: batteryCapacity > 0 ? batteryEnergy / batteryCapacity : 1,
  };
}

function sourceEvent(event, index, details = event.details ?? {}) {
  return {
    sourceEventId: event.eventId,
    timestamp: event.timestamp,
    sourceOrder: index,
    event,
    details,
  };
}

function getTriggerSources(definition, facts) {
  const trigger = definition.triggerConditions;
  const { execution, events } = facts;
  if (trigger.type === "mission-accepted" && facts.missionAccepted) {
    return [{ sourceEventId: `mission-accepted:${execution?.missionId ?? facts.gameState.currentMissionId}`, sourceOrder: -4 }];
  }
  if (trigger.type === "planning-completed" && facts.missionAccepted && facts.planningVisited) {
    return [{ sourceEventId: `planning-completed:${facts.gameState.currentMissionId}`, sourceOrder: -3 }];
  }
  if (trigger.type === "rover-completed" && facts.roverReady) {
    return [{ sourceEventId: `rover-completed:${facts.gameState.currentMissionId}`, sourceOrder: -2 }];
  }
  if (trigger.type === "execution-started" && facts.executionStarted) {
    const index = events.findIndex(({ type }) => type === "mission-initialized");
    return [sourceEvent(events[index], index)];
  }
  if (trigger.type === "event") {
    return events.flatMap((event, index) => event.type === trigger.eventType
      ? [sourceEvent(event, index)]
      : []);
  }
  if (trigger.type === "observation-objective") {
    return events.flatMap((event, index) => event.type === "scientific-observation"
      && event.details.objectiveId === trigger.objectiveId
      ? [sourceEvent(event, index)]
      : []);
  }
  if (trigger.type === "sample-type") {
    return events.flatMap((event, index) => event.type === "sample-collected"
      && event.details.sampleType === trigger.sampleTypeId
      ? [sourceEvent(event, index)]
      : []);
  }
  if (trigger.type === "challenge-triggered" || trigger.type === "challenge-resolved") {
    return events.flatMap((event, index) => {
      const expectedType = trigger.type === "challenge-triggered" ? "challenge-triggered" : null;
      if (expectedType && event.type !== expectedType) return [];
      if (!expectedType && !["challenge-resolved", "equipment-recovered"].includes(event.type)) return [];
      const challenge = execution.challengeHistory.find(
        ({ challengeId }) => challengeId === event.details.challengeId,
      );
      if (!challenge || (trigger.challengeTypeId && challenge.typeId !== trigger.challengeTypeId)) {
        return [];
      }
      return [sourceEvent(event, index, { ...event.details, challenge })];
    });
  }
  if (trigger.type === "low-battery"
    && facts.executionStarted
    && facts.batteryFraction <= trigger.batteryFractionAtMost) {
    return [{
      sourceEventId: `low-battery:${execution.missionId}`,
      sourceOrder: events.length,
      details: { batteryFraction: facts.batteryFraction },
    }];
  }
  if (trigger.type === "objective-completed") {
    return (execution?.objectiveProgress ?? []).flatMap((objective) => objective.completed
      ? [{
        sourceEventId: `objective-completed:${objective.objectiveId}`,
        sourceOrder: events.length,
        details: { objective },
      }]
      : []);
  }
  if (trigger.type === "mission-completed" && facts.missionCompleted) {
    const index = events.findIndex(({ type }) => type === "mission-completed");
    return [sourceEvent(events[index], index)];
  }
  return [];
}

function unlockConditionsMet(definition, facts) {
  const conditions = definition.unlockConditions;
  return (!conditions.missionAccepted || facts.missionAccepted)
    && (!conditions.planningVisited || facts.planningVisited)
    && (!conditions.roverReady || facts.roverReady)
    && (!conditions.executionStarted || facts.executionStarted)
    && (!conditions.missionCompleted || facts.missionCompleted);
}

function findInstrumentName(instrumentId) {
  return ROVER_CATEGORIES.find(({ id }) => id === "instruments")
    ?.options.find(({ id }) => id === instrumentId)?.name ?? instrumentId ?? "selected instrument";
}

function findObjectiveName(objectiveId) {
  return SCIENCE_OBJECTIVES.find(({ id }) => id === objectiveId)?.name ?? objectiveId ?? "the selected objective";
}

function dialogueContent(definition, source, facts) {
  const details = source.details ?? {};
  const waypointId = details.toWaypointId
    ?? details.movement?.toWaypointId
    ?? details.locationId
    ?? details.challenge?.locationId;
  const waypoint = MISSION_SURFACE_WAYPOINTS.find(({ id }) => id === waypointId);
  const observation = details.observation ?? details;
  const sample = details.sample ?? details;
  const challenge = details.challenge;
  const decision = challenge?.decisions.find(({ id }) => id === challenge.selectedDecisionId);
  const effects = challenge?.resolution?.effects ?? {};
  const instrumentId = challenge?.instrumentId ?? observation.instrumentId;
  const recoveryCosts = challenge?.resolution?.resourceCosts ?? {};
  const replacements = {
    missionTitle: facts.mission?.title ?? "this mission",
    siteName: facts.site?.name ?? "the selected site",
    waypointName: waypoint?.name ?? details.locationName ?? "the current waypoint",
    waypointContext: waypoint?.scientificImportance ?? "compare the mapped terrain and planned science activities.",
    instrumentName: findInstrumentName(instrumentId),
    capabilityName: observation.capabilityId ?? "science",
    objectiveName: findObjectiveName(observation.objectiveId ?? details.objective?.objectiveId),
    sampleName: sample.name ?? "the collected sample",
    affectedActivity: challenge?.instrumentId
      ? `observations requiring ${findInstrumentName(challenge.instrumentId)}`
      : "the affected scientific activity",
    challengeTitle: challenge?.title ?? "The operational challenge",
    decisionTitle: decision?.title ?? "the recorded recovery",
    decisionConsequence: effects.batteryDeltaWh < 0
      ? `That response drew ${Math.abs(effects.batteryDeltaWh)} Wh from the battery${effects.environmentalPowerFactor === undefined ? "" : ` and set the environmental power factor to ${Math.round(effects.environmentalPowerFactor * 100)}%`}.`
      : effects.durationHours > 0
        ? `That response used ${effects.durationHours} hours of mission time.`
        : "The configured operational effects are recorded in the mission history.",
    timeCost: Number(recoveryCosts.timeHours ?? 0).toFixed(1),
    batteryCost: Number(recoveryCosts.batteryWh ?? 0).toFixed(0),
    budgetCost: Number(recoveryCosts.budgetCredits ?? 0).toFixed(0),
    batteryPercent: Math.round(facts.batteryFraction * 100),
  };
  const text = definition.text.replace(/\{\{(\w+)\}\}/g, (_match, key) =>
    String(replacements[key] ?? ""));
  return {
    text,
    contextLabel: waypoint
      ? `${waypoint.name} · ${facts.site?.name ?? "Mars surface"}`
      : facts.site?.name ?? facts.mission?.title ?? "Mission science channel",
  };
}

export function getScientistDialogueDefinitions() {
  return dialogueCatalog;
}

export function initializeScientistDialogue(missionId = null) {
  if (missionId !== null && (typeof missionId !== "string" || missionId.length === 0)) {
    throw new TypeError("Scientist dialogue mission ID must be a non-empty string or null.");
  }
  return { missionId, unlocked: [], history: [] };
}

export function resetScientistDialogue(_dialogueState, missionId = null) {
  return initializeScientistDialogue(missionId);
}

export function synchronizeScientistDialogue(dialogueState, gameState) {
  requireDialogueState(dialogueState);
  const missionId = gameState?.currentMissionId ?? null;
  if (!missionId) return dialogueState;
  const current = dialogueState.missionId === missionId
    ? dialogueState
    : initializeScientistDialogue(missionId);
  const facts = missionFacts(gameState);
  if (!facts.missionAccepted) return current;

  const existing = new Set(current.unlocked.map(({ dialogueId }) => dialogueId));
  const newlyUnlocked = dialogueCatalog.flatMap((definition) => {
    if (!unlockConditionsMet(definition, facts)) return [];
    return getTriggerSources(definition, facts).map((source) => ({
      definition,
      source,
      dialogueId: `${definition.id}:${source.sourceEventId}`,
    }));
  }).filter(({ dialogueId }) => !existing.has(dialogueId))
    .sort((left, right) =>
      left.source.sourceOrder - right.source.sourceOrder
      || right.definition.priority - left.definition.priority
      || left.definition.id.localeCompare(right.definition.id));

  if (!newlyUnlocked.length) return current;
  const unlocked = newlyUnlocked.map(({ definition, source, dialogueId }) => {
    const content = dialogueContent(definition, source, facts);
    return {
      dialogueId,
      definitionId: definition.id,
      speaker: definition.speaker,
      text: content.text,
      category: definition.category,
      missionStage: definition.missionStage,
      triggerConditions: definition.triggerConditions,
      priority: definition.priority,
      displayStatus: "AVAILABLE",
      unlockConditions: definition.unlockConditions,
      contextLabel: content.contextLabel,
      sourceEventId: source.sourceEventId,
      createdAt: source.timestamp ?? gameState.missionExecution?.updatedAt ?? null,
    };
  });
  return { ...current, missionId, unlocked: [...current.unlocked, ...unlocked] };
}

export function getAvailableScientistDialogues(dialogueState) {
  requireDialogueState(dialogueState);
  return dialogueState.unlocked.filter(({ displayStatus }) => displayStatus === "AVAILABLE");
}

export function getNextScientistDialogue(dialogueState) {
  return getAvailableScientistDialogues(dialogueState)[0] ?? null;
}

export function markScientistDialogueViewed(dialogueState, dialogueId) {
  requireDialogueState(dialogueState);
  const dialogue = dialogueState.unlocked.find(({ dialogueId: id }) => id === dialogueId);
  if (!dialogue || dialogue.displayStatus !== "AVAILABLE") {
    throw new Error(`Scientist dialogue is not available: ${dialogueId}.`);
  }
  const viewed = { ...dialogue, displayStatus: "VIEWED" };
  return {
    ...dialogueState,
    unlocked: dialogueState.unlocked.map((item) =>
      item.dialogueId === dialogueId ? viewed : item),
    history: [...dialogueState.history, viewed],
  };
}

export function getScientistDialogueHistory(dialogueState) {
  requireDialogueState(dialogueState);
  return [...dialogueState.history];
}
