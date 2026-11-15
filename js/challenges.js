import { MISSION_CHALLENGE_CONFIG } from "./data.js";

const challengeDefinitions = MISSION_CHALLENGE_CONFIG.challenges;

function getDefinition(typeId) {
  const definition = challengeDefinitions.find(({ id }) => id === typeId);
  if (!definition) {
    throw new RangeError(`Unknown mission challenge: ${typeId}`);
  }
  return definition;
}

function matchesTrigger(definition, context) {
  const trigger = definition.trigger;
  return (
    (trigger.elapsedHours !== undefined && context.elapsedHours >= trigger.elapsedHours)
    || (trigger.locations?.includes(context.locationId) ?? false)
    || (trigger.batteryFractionAtMost !== undefined
      && context.batteryFraction <= trigger.batteryFractionAtMost)
    || (trigger.movements !== undefined && context.movementCount >= trigger.movements)
    || (trigger.observations !== undefined && context.observationCount >= trigger.observations)
    || (trigger.successfulTransmissions !== undefined
      && context.successfulTransmissionCount >= trigger.successfulTransmissions)
  ) && (!trigger.solarPowerRequired || context.solarPowered);
}

export function getMissionChallengeDefinition(typeId) {
  return getDefinition(typeId);
}

export function createMissionChallenge(typeId, context, sequence) {
  const definition = getDefinition(typeId);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError("Challenge sequence must be a positive integer.");
  }
  return {
    challengeId: `challenge-${String(sequence).padStart(4, "0")}`,
    typeId,
    title: definition.title,
    severity: definition.severity,
    category: definition.category,
    subsystem: definition.subsystem ?? null,
    instrumentId: definition.subsystem === "instrument"
      ? context.instrumentId ?? null
      : null,
    description: definition.description,
    locationId: context.locationId,
    triggeredAt: context.timestamp,
    status: "CREATED",
    decisions: definition.decisions,
    selectedDecisionId: null,
    resolvedAt: null,
    resolution: null,
  };
}

export function activateMissionChallenge(challenge) {
  if (!challenge || challenge.status !== "CREATED") {
    throw new Error("Only a created challenge can be activated.");
  }
  return { ...challenge, status: "ACTIVE" };
}

export function resolveMissionChallenge(challenge, decisionId, resolution = {}) {
  if (!challenge || challenge.status !== "ACTIVE") {
    throw new Error(`Challenge is not active: ${challenge?.challengeId ?? "unknown"}.`);
  }
  const decision = challenge.decisions.find(({ id }) => id === decisionId);
  if (!decision) {
    throw new RangeError(`Invalid decision for challenge ${challenge.challengeId}: ${decisionId}`);
  }
  if (!Number.isFinite(Date.parse(resolution.resolvedAt))) {
    throw new TypeError("A valid resolution timestamp is required.");
  }
  return {
    ...challenge,
    status: "RESOLVED",
    selectedDecisionId: decisionId,
    resolvedAt: resolution.resolvedAt,
    resolution: {
      decisionId,
      title: decision.title,
      effects: decision.effects,
      resourceCosts: resolution.resourceCosts ?? {
        timeHours: 0,
        batteryWh: 0,
        budgetCredits: 0,
      },
    },
  };
}

export function findTriggerableMissionChallenges(history, context) {
  const encountered = new Set(history.map(({ typeId }) => typeId));
  return challengeDefinitions
    .filter(({ id }) => !encountered.has(id) && matchesTrigger({ ...getDefinition(id) }, context))
    .map(({ id }) => id);
}

export function getActiveMissionChallenges(history) {
  return history.filter(({ status }) => status === "ACTIVE");
}

export function getMissionChallengeHistory(history) {
  return [...history];
}

export function calculateMissionChallengeEvaluation(history) {
  const resolved = history.filter(({ status }) => status === "RESOLVED");
  const equipmentFailures = history.filter(({ category }) => category === "equipment").length;
  const successfulRecoveries = resolved.filter(({ category }) => category === "equipment").length;
  const resourceCosts = resolved.reduce((total, challenge) => ({
    timeHours: total.timeHours + challenge.resolution.resourceCosts.timeHours,
    batteryWh: total.batteryWh + challenge.resolution.resourceCosts.batteryWh,
    budgetCredits: total.budgetCredits + challenge.resolution.resourceCosts.budgetCredits,
  }), { timeHours: 0, batteryWh: 0, budgetCredits: 0 });
  const evaluation = MISSION_CHALLENGE_CONFIG.evaluation;
  const performanceScore = Math.max(0, Math.min(100, Math.round(
    evaluation.startingScore
    - resourceCosts.timeHours * evaluation.timePenaltyPerHour
    - resourceCosts.budgetCredits / 100 * evaluation.budgetPenaltyPer100Credits
    - equipmentFailures * evaluation.equipmentFailurePenalty
    + successfulRecoveries * evaluation.recoveryBonus
    + resolved.length * evaluation.resolutionBonus,
  )));
  return {
    challengesEncountered: history.length,
    challengesResolved: resolved.length,
    resourceCosts,
    equipmentFailures,
    successfulRecoveries,
    performanceScore,
  };
}
