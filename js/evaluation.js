import {
  MISSION_CATALOG,
  MISSION_COMPLETION_REQUIREMENTS,
  MISSION_SURFACE_WAYPOINTS,
  SCIENCE_OBJECTIVES,
  SCIENTIST_PROFILE,
} from "./data.js";
import { getResourceSummary } from "./resources.js";

const CATEGORY_DEFINITIONS = Object.freeze([
  { id: "scientificAchievement", label: "Scientific Achievement", maxScore: 25 },
  { id: "missionEfficiency", label: "Mission Efficiency", maxScore: 15 },
  { id: "resourceManagement", label: "Resource Management", maxScore: 15 },
  { id: "roverPerformance", label: "Rover Performance", maxScore: 10 },
  { id: "riskManagement", label: "Risk Management", maxScore: 15 },
  { id: "exploration", label: "Exploration", maxScore: 10 },
  { id: "missionCompletion", label: "Mission Completion", maxScore: 10 },
]);

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const rounded = (value) => Math.round(value * 10) / 10;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function fraction(numerator, denominator) {
  return denominator > 0 ? clamp(numerator / denominator) : 0;
}

function executionFrom(input) {
  return input?.missionExecution ?? input?.execution ?? null;
}

function resourcesFrom(input) {
  return input?.resources ?? null;
}

function terminalEvent(execution) {
  const events = list(execution?.events);
  const eventType = {
    COMPLETED: "mission-completed",
    ABORTED: "mission-status",
    FAILED: "mission-status",
  }[execution?.status];
  return [...events].reverse().find((event) =>
    event.type === eventType
    && (execution.status === "COMPLETED" || /FAILED|ABORTED/i.test(event.message ?? "")))
    ?? [...events].reverse().find(({ type }) => type === eventType)
    ?? null;
}

function selectedObjectives(execution) {
  return list(execution?.objectiveProgress).filter(({ selected }) => selected);
}

function operationalSystems(execution) {
  const condition = execution?.operationalCondition;
  if (!condition || typeof condition !== "object") return [];
  const systems = [];
  if (typeof condition.wheels === "string") systems.push(condition.wheels === "operational" ? 1 : 0);
  if (typeof condition.communications === "string") {
    systems.push(condition.communications === "operational" ? 1 : 0);
  }
  for (const status of Object.values(condition.instruments ?? {})) {
    if (typeof status === "string") systems.push(status === "operational" ? 1 : 0);
  }
  if (Number.isFinite(condition.powerGenerationFactor)) {
    systems.push(clamp(condition.powerGenerationFactor));
  }
  return systems;
}

function challengeDecisionQuality(challenge) {
  if (challenge.status !== "RESOLVED") return 0;
  if (challenge.category === "equipment") return 1;
  const selected = challenge.decisions?.find(
    ({ id }) => id === challenge.selectedDecisionId,
  );
  const draws = list(challenge.decisions)
    .map(({ effects }) => Math.max(0, -finite(effects?.batteryDeltaWh)))
    .filter((draw) => draw > 0);
  if (!selected || draws.length === 0) return 1;
  const worstDraw = Math.max(...draws);
  const bestDraw = Math.min(...draws);
  const selectedDraw = Math.max(0, -finite(selected.effects?.batteryDeltaWh));
  return worstDraw === bestDraw
    ? 1
    : clamp((worstDraw - selectedDraw) / (worstDraw - bestDraw));
}

export function calculateCategoryScores(input = {}) {
  const execution = executionFrom(input);
  const resources = resourcesFrom(input);
  const objectives = selectedObjectives(execution);
  const completedObjectives = objectives.filter(({ completed }) => completed);
  const challenges = list(execution?.challengeHistory);
  const resolvedChallenges = challenges.filter(({ status }) => status === "RESOLVED");
  const equipmentChallenges = challenges.filter(({ category }) => category === "equipment");
  const recoveredEquipment = equipmentChallenges.filter(({ status }) => status === "RESOLVED");
  const systems = operationalSystems(execution);
  const siteWaypoints = MISSION_SURFACE_WAYPOINTS.filter(
    ({ siteId }) => siteId === execution?.landingSiteId,
  );
  const exploredIds = new Set(list(execution?.exploredWaypointIds));
  const exploredCount = siteWaypoints.filter(({ id }) => exploredIds.has(id)).length;
  const completedEvent = list(execution?.events).some(
    ({ type }) => type === "mission-completed",
  );
  const requirements = {
    exploration: exploredCount >= finite(MISSION_COMPLETION_REQUIREMENTS.minimumExploredWaypoints),
    transmittedData: !MISSION_COMPLETION_REQUIREMENTS.requireTransmittedData
      || finite(resources?.data?.transmittedMB) > 0,
  };
  const successfulOperations = list(execution?.events).filter(({ type, status }) =>
    status !== "failed" && [
      "rover-moved",
      "sample-collected",
      "scientific-observation",
      "data-transmitted",
      "mission-idle",
      "maintenance",
      "emergency-delay",
    ].includes(type),
  ).length;
  const time = resources?.time;
  const budget = resources?.budget;
  const power = resources?.power;

  const scienceFraction = fraction(completedObjectives.length, objectives.length);
  const timeEfficiency = successfulOperations > 0
    && Number.isFinite(time?.elapsedHours)
    && finite(time?.missionDurationHours) > 0
    ? clamp(1 - time.elapsedHours / time.missionDurationHours)
    : 0;
  const budgetEfficiency = successfulOperations > 0
    && Number.isFinite(budget?.remainingCredits)
    && finite(budget?.initialBudgetCredits) > 0
    ? clamp(budget.remainingCredits / budget.initialBudgetCredits)
    : 0;
  const batteryRemaining = finite(power?.batteryCapacityWh) > 0
    ? fraction(finite(power.batteryEnergyWh), power.batteryCapacityWh)
    : 0;
  const currentLoad = finite(power?.lastLoadW);
  const hasPowerData = Number.isFinite(power?.batteryCapacityWh)
    && power.batteryCapacityWh > 0
    && Number.isFinite(power.availablePowerW)
    && Number.isFinite(power.lastLoadW);
  const powerBalance = !hasPowerData
    ? 0
    : currentLoad <= 0
      ? 1
      : fraction(power.availablePowerW, currentLoad);
  const equipmentCondition = fraction(
    systems.reduce((total, status) => total + status, 0),
    systems.length,
  );
  const challengeResolution = fraction(resolvedChallenges.length, challenges.length);
  const decisionQuality = challenges.length > 0
    ? challenges.reduce((total, challenge) => total + challengeDecisionQuality(challenge), 0)
      / challenges.length
    : 0;
  const terminalCompletion = execution?.status === "COMPLETED" && completedEvent ? 1 : 0;
  const objectiveCompletion = objectives.length > 0 ? scienceFraction : 0;
  const completionRequirements = [
    requirements.exploration,
    requirements.transmittedData,
  ];
  const completionRequirementFraction = fraction(
    completionRequirements.filter(Boolean).length,
    completionRequirements.length,
  );

  const scores = {
    scientificAchievement: {
      label: "Scientific Achievement",
      maxScore: 25,
      score: 25 * scienceFraction,
      basis: "Completed selected objectives ÷ selected objectives × 25.",
      details: { completedObjectives: completedObjectives.length, selectedObjectives: objectives.length },
    },
    missionEfficiency: {
      label: "Mission Efficiency",
      maxScore: 15,
      score: 7.5 * timeEfficiency + 7.5 * budgetEfficiency,
      basis: "Remaining mission-time fraction × 7.5 + remaining budget fraction × 7.5; requires a successful operation.",
      details: { timeEfficiency, budgetEfficiency, successfulOperations },
    },
    resourceManagement: {
      label: "Resource Management",
      maxScore: 15,
      score: 10 * batteryRemaining + 5 * powerBalance,
      basis: "Remaining battery fraction × 10 + available-power/load ratio × 5.",
      details: { batteryRemaining, powerBalance },
    },
    roverPerformance: {
      label: "Rover Performance",
      maxScore: 10,
      score: 10 * equipmentCondition,
      basis: "Operational condition fraction across tracked rover subsystems × 10.",
      details: {
        operationalSystems: systems.reduce((total, status) => total + status, 0),
        trackedSystems: systems.length,
        recoveredEquipment: recoveredEquipment.length,
        equipmentFailures: equipmentChallenges.length,
      },
    },
    riskManagement: {
      label: "Risk Management",
      maxScore: 15,
      score: 10 * challengeResolution + 5 * decisionQuality,
      basis: "Resolved challenges ÷ encountered challenges × 10 + average response stewardship × 5; environmental stewardship compares direct battery draw with the configured worst option, and equipment recovery counts as handled.",
      details: {
        challengesResolved: resolvedChallenges.length,
        challengesEncountered: challenges.length,
        decisionQuality,
      },
    },
    exploration: {
      label: "Exploration",
      maxScore: 10,
      score: 10 * fraction(exploredCount, siteWaypoints.length),
      basis: "Unique configured site waypoints reached ÷ configured site waypoints × 10.",
      details: { waypointsReached: exploredCount, availableWaypoints: siteWaypoints.length },
    },
    missionCompletion: {
      label: "Mission Completion",
      maxScore: 10,
      score: 5 * objectiveCompletion
        + 3 * completionRequirementFraction
        + 2 * terminalCompletion,
      basis: "Objective completion fraction × 5 + met exploration/transmission requirements fraction × 3 + completed terminal state × 2.",
      details: {
        objectiveCompletion,
        completionRequirementFraction,
        terminalCompletion: Boolean(terminalCompletion),
        requirements,
      },
    },
  };

  return Object.fromEntries(Object.entries(scores).map(([id, category]) => [
    id,
    {
      ...category,
      score: rounded(Math.min(category.maxScore, Math.max(0, finite(category.score)))),
    },
  ]));
}

export function calculateMissionScore(categoryScores) {
  if (!categoryScores || typeof categoryScores !== "object") return 0;
  const maximum = CATEGORY_DEFINITIONS.reduce((sum, { maxScore }) => sum + maxScore, 0);
  const total = CATEGORY_DEFINITIONS.reduce((sum, { id, maxScore }) => {
    const category = categoryScores[id];
    return sum + clamp(finite(category?.score), 0, maxScore);
  }, 0);
  return Math.round(clamp(total, 0, maximum));
}

export function calculateMissionGrade(score) {
  const value = clamp(finite(score), 0, 100);
  if (value >= 95) return "S";
  if (value >= 85) return "A";
  if (value >= 70) return "B";
  if (value >= 50) return "C";
  return "D";
}

export function generateMissionRecommendations(input = {}) {
  const report = input.categoryScores
    ? input
    : { categoryScores: calculateCategoryScores(input), ...input };
  const scores = report.categoryScores ?? {};
  const recommendations = [];
  const remaining = report.resourcesRemaining ?? {};
  const consumed = report.resourcesConsumed ?? {};
  const objectivesIncomplete = list(report.objectivesIncomplete);
  const challenges = list(report.challengesEncountered);
  const unresolvedFailures = list(report.equipmentFailures).filter(
    ({ status }) => status !== "RESOLVED",
  );
  const initialBudget = finite(report.resourcesConsumed?.initialBudgetCredits);
  const spentBudget = finite(consumed.budgetCredits);

  if (finite(remaining.batteryFraction, 1) <= 0.2) {
    recommendations.push({
      id: "conserve-battery",
      priority: "high",
      title: "Use a more conservative power plan",
      detail: `Battery ended at ${Math.round(remaining.batteryFraction * 100)}% of capacity. Reduce simultaneous instrument loads and defer nonessential operations when charge is low.`,
    });
  }
  if (unresolvedFailures.length > 0) {
    const systems = [...new Set(unresolvedFailures.map(({ subsystem, title }) => subsystem ?? title))];
    recommendations.push({
      id: "plan-equipment-recovery",
      priority: "high",
      title: "Plan maintenance for unresolved equipment failures",
      detail: `The mission ended with unresolved ${systems.join(", ")} failure(s). Reserve time and budget for recovery before relying on those systems.`,
    });
  }
  if (objectivesIncomplete.length > 0) {
    recommendations.push({
      id: "review-instrument-coverage",
      priority: "high",
      title: "Review science coverage and operation priorities",
      detail: `Incomplete objectives: ${objectivesIncomplete.map(({ name }) => name).join(", ")}. Confirm the rover carries the required instruments and schedule each remaining capability at an eligible waypoint.`,
    });
  }
  if (initialBudget > 0 && spentBudget / initialBudget >= 0.8) {
    recommendations.push({
      id: "reduce-budget-consumption",
      priority: "medium",
      title: "Reduce budget consumption",
      detail: `${Math.round(spentBudget / initialBudget * 100)}% of the initial budget was spent. Review repeated operations, route choices, and challenge-response costs when planning the next mission.`,
    });
  }
  if (challenges.length > 0 && finite(scores.riskManagement?.score) < 9) {
    recommendations.push({
      id: "improve-risk-response",
      priority: "medium",
      title: "Review environmental risk responses",
      detail: `${finite(report.challengesResolved?.length)}/${challenges.length} challenges were resolved and the risk-management score was ${finite(scores.riskManagement?.score)}/15. Review response trade-offs and address active equipment faults before continuing.`,
    });
  }
  if (finite(scores.missionEfficiency?.score) < 7.5 && finite(consumed.timeHours) > 0) {
    recommendations.push({
      id: "improve-operation-efficiency",
      priority: "medium",
      title: "Consolidate operations",
      detail: `${finite(consumed.timeHours).toFixed(1)} mission hours were used. Prioritize high-value objectives and combine route and instrument planning to reduce avoidable elapsed time.`,
    });
  }
  if (recommendations.length === 0 && finite(report.finalScore) >= 70) {
    recommendations.push({
      id: "continue-evidence-based-planning",
      priority: "low",
      title: "Continue evidence-based planning",
      detail: "The recorded results show no major scored weakness. Keep distinguishing simulator records from measured scientific evidence in future plans.",
    });
  }
  return recommendations;
}

function resourcesReport(resources) {
  if (!resources?.time
    || !resources?.power
    || !resources?.budget
    || !resources?.data
    || !resources?.status
    || !Number.isFinite(resources.time.elapsedHours)
    || !Number.isFinite(resources.power.batteryCapacityWh)
    || !Number.isFinite(resources.budget.remainingCredits)) {
    return {
      resourcesConsumed: {
        timeHours: 0,
        energyWh: 0,
        budgetCredits: 0,
        dataGeneratedMB: 0,
        dataTransmittedMB: 0,
        initialBudgetCredits: 0,
      },
      resourcesRemaining: {
        timeHours: 0,
        batteryWh: 0,
        batteryCapacityWh: 0,
        batteryFraction: 0,
        budgetCredits: 0,
        dataStoredMB: 0,
        availablePowerW: 0,
      },
    };
  }
  const summary = getResourceSummary(resources);
  return {
    resourcesConsumed: {
      timeHours: finite(resources.time?.elapsedHours),
      energyWh: finite(resources.power?.energyConsumedWh),
      budgetCredits: finite(summary.budget.spentCredits),
      dataGeneratedMB: finite(resources.data?.generatedMB),
      dataTransmittedMB: finite(resources.data?.transmittedMB),
      initialBudgetCredits: finite(resources.budget?.initialBudgetCredits),
    },
    resourcesRemaining: {
      timeHours: finite(resources.time?.remainingHours),
      batteryWh: finite(summary.power.batteryEnergyWh),
      batteryCapacityWh: finite(summary.power.batteryCapacityWh),
      batteryFraction: summary.power.batteryCapacityWh > 0
        ? fraction(summary.power.batteryEnergyWh, summary.power.batteryCapacityWh)
        : 0,
      budgetCredits: finite(summary.budget.remainingCredits),
      dataStoredMB: finite(resources.data?.storedMB),
      availablePowerW: finite(resources.power?.availablePowerW),
    },
  };
}

function finalAssessment(report) {
  const categories = report.categoryScores;
  const majorSuccesses = Object.values(categories)
    .filter(({ score, maxScore }) => score >= maxScore * 0.7)
    .map(({ label }) => label);
  const majorFailures = [
    ...report.objectivesIncomplete.map(({ name }) => `Incomplete objective: ${name}`),
    ...report.equipmentFailures
      .filter(({ status }) => status !== "RESOLVED")
      .map(({ title }) => `Unresolved equipment failure: ${title}`),
  ];
  if (report.missionStatus === "FAILED") majorFailures.unshift("Mission ended in a failed state.");
  if (report.missionStatus === "ABORTED") majorFailures.unshift("Mission was aborted before completion.");
  const scienceScore = categories.scientificAchievement.score;
  const operationalScore = rounded([
    categories.missionEfficiency.score / categories.missionEfficiency.maxScore,
    categories.resourceManagement.score / categories.resourceManagement.maxScore,
    categories.roverPerformance.score / categories.roverPerformance.maxScore,
    categories.riskManagement.score / categories.riskManagement.maxScore,
    categories.exploration.score / categories.exploration.maxScore,
  ].reduce((sum, ratio) => sum + ratio, 0) / 5 * 100);
  const assessment = report.missionStatus === "COMPLETED"
    ? `Mission completed with a score of ${report.finalScore}/100 (Grade ${report.grade}). Scientific achievement was ${scienceScore}/25 and operational performance was ${operationalScore}/100. These scores summarize recorded gameplay only, not real Mars findings.`
    : `Mission ended ${report.missionStatus.toLowerCase()} with a score of ${report.finalScore}/100 (Grade ${report.grade}). Scientific achievement was ${scienceScore}/25 and operational performance was ${operationalScore}/100. Review the recorded outcomes as gameplay, not real Mars findings.`;
  return {
    speaker: SCIENTIST_PROFILE.name,
    text: assessment,
    scientificAchievementScore: scienceScore,
    operationalPerformanceScore: operationalScore,
    majorSuccesses,
    majorFailures,
  };
}

export function generateMissionReport(input = {}) {
  const execution = executionFrom(input);
  if (!["COMPLETED", "ABORTED", "FAILED"].includes(execution?.status)) {
    throw new Error("A final mission report can only be generated for a completed, aborted, or failed mission.");
  }
  const resources = resourcesFrom(input);
  const categoryScores = calculateCategoryScores(input);
  const finalScore = calculateMissionScore(categoryScores);
  const objectives = list(execution.objectiveProgress);
  const challenges = list(execution.challengeHistory);
  const equipmentFailures = challenges.filter(({ category }) => category === "equipment");
  const sampleHistory = list(execution.sampleHistory).length
    ? execution.sampleHistory
    : list(execution.samples);
  const siteWaypoints = MISSION_SURFACE_WAYPOINTS.filter(
    ({ siteId }) => siteId === execution.landingSiteId,
  );
  const exploredIds = new Set(list(execution.exploredWaypointIds));
  const mission = MISSION_CATALOG.find(({ id }) => id === execution.missionId);
  const timestamp = terminalEvent(execution)?.timestamp
    ?? execution.completion?.completedAt
    ?? execution.updatedAt
    ?? execution.createdAt
    ?? null;
  const resourceDetails = resourcesReport(resources);
  const report = {
    reportId: `mission-report:${execution.missionId ?? "unknown"}:${timestamp ?? execution.status}`,
    missionId: execution.missionId ?? null,
    missionName: execution.missionName
      ?? execution.missionPlan?.configuration?.missionName
      ?? mission?.title
      ?? "Mission",
    missionStatus: execution.status,
    finalScore,
    grade: calculateMissionGrade(finalScore),
    categoryScores,
    objectivesCompleted: objectives.filter(({ selected, completed }) => selected && completed)
      .map(({ objectiveId, name }) => ({ objectiveId, name })),
    objectivesIncomplete: objectives.filter(({ selected, completed }) => selected && !completed)
      .map(({ objectiveId, name, status }) => ({ objectiveId, name, status })),
    ...resourceDetails,
    challengesEncountered: challenges,
    challengesResolved: challenges.filter(({ status }) => status === "RESOLVED"),
    equipmentFailures,
    equipmentRecoveries: equipmentFailures.filter(({ status }) => status === "RESOLVED"),
    explorationProgress: {
      waypointsReached: siteWaypoints.filter(({ id }) => exploredIds.has(id))
        .map(({ id, name }) => ({ id, name })),
      totalWaypoints: siteWaypoints.length,
      requiredWaypoints: finite(MISSION_COMPLETION_REQUIREMENTS.minimumExploredWaypoints),
    },
    scientificObservations: list(execution.observations),
    samplesCollected: sampleHistory,
    missionDuration: {
      elapsedHours: finite(resources?.time?.elapsedHours),
      elapsedSols: resources?.time?.hoursPerSol > 0
        ? rounded(finite(resources.time.elapsedHours) / resources.time.hoursPerSol)
        : 0,
      plannedHours: finite(resources?.time?.missionDurationHours),
    },
    evaluationTimestamp: timestamp,
    timestampSource: terminalEvent(execution) ? "terminal mission event" : "mission execution record",
    challengePerformance: execution.challengeEvaluation ?? null,
    roverCondition: execution.operationalCondition ?? null,
    completionRequirements: {
      ...categoryScores.missionCompletion.details.requirements,
      missionCompleted: execution.status === "COMPLETED"
        && list(execution.events).some(({ type }) => type === "mission-completed"),
    },
    finalAssessment: null,
  };
  report.finalAssessment = finalAssessment(report);
  report.recommendations = generateMissionRecommendations(report);
  return report;
}

export function evaluateMission(input = {}) {
  return generateMissionReport(input);
}
