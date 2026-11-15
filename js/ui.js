import {
  acceptMission,
  assignRole,
  completeLoading,
  getState,
  goBack,
  navigateTo,
  advanceMissionIdleTime,
  operateInstrument,
  recordEmergencyDelay,
  recordMaintenance,
  resetRoverConfiguration,
  resetMission,
  returnToMenu,
  selectLandingSite,
  selectMission,
  selectMissionStrategy,
  selectPlanningMissionProfile,
  setMissionObjectivePriority,
  selectPowerEnvironment,
  selectPlayerSlot,
  selectRoverOption,
  toggleMissionObjective,
  updateMissionPlanField,
  setPreference,
  subscribe,
  transmitMissionDataToControl,
} from "./state.js";
import {
  HOW_TO_STEPS,
  LANDING_SITES,
  MISSION_CATALOG,
  MISSION_CONSTRAINTS,
  MISSION_PHASES,
  PLAYER_ROLES,
  PLAYER_SLOTS,
  SCIENCE_OBJECTIVES,
  SCIENTIST_PROFILE,
  ROVER_CATEGORIES,
  ENGINEERING_LIMITS,
  MISSION_RESOURCE_CONFIG,
  MISSION_PLANNING_LIMITS,
  MISSION_STRATEGIES,
  SCIENCE_CAPABILITY_REQUIREMENTS,
  MISSION_EXECUTION_CONFIG,
} from "./data.js";
import {
  calculateRoverMetrics,
  getScientificCapabilities,
  recommendRoverConfiguration,
  validateRoverConfiguration,
} from "./rover.js";
import {
  getResourceSummary,
} from "./resources.js";
import {
  getMissionAvailableWaypoints,
  getMissionExecutionProgress,
  getMissionWaypoint,
} from "./mission.js";
import {
  abortMission,
  collectSample,
  completeMission,
  getAvailableScientificOperations,
  moveRoverToDestination,
  pauseMission,
  resolveChallenge,
  resumeMission,
  selectMissionDestination,
  advanceScientistDialogue,
  getAvailableScientistDialogues,
  getCurrentScientistDialogue,
  getScientistDialogueHistory,
} from "./state.js";
import { validatePlanningInputs } from "./planning.js";
import { SCIENTIST_CHANNEL_EMPTY_MESSAGE } from "./scientist.js";

const SCREEN_TITLES = Object.freeze({
  home: "Main menu",
  briefing: "Mission briefing",
  roles: "Team roles",
  planning: "Mission planning",
  rover: "Rover design studio",
  control: "Mission control",
  challenge: "Field scenario",
  scientist: "Scientist interaction",
  results: "Mission results",
  archive: "Mission archive",
  "how-to": "How to play",
  settings: "Settings",
  credits: "Credits",
});

const STAGE_SCREENS = Object.freeze([
  "briefing",
  "roles",
  "planning",
  "rover",
  "control",
  "challenge",
  "scientist",
  "results",
]);

let loadingExitStarted = false;
let skipLoadingSequence = completeLoading;
let lastRenderedScreen = null;
let resourceActionError = "";
let executionActionError = "";
let roverRecommendation = null;
let roverRecommendationContext = null;

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function findRoverOption(categoryId, optionId) {
  return ROVER_CATEGORIES.find(({ id }) => id === categoryId)?.options.find(({ id }) => id === optionId);
}

function appendTextElement(parent, tagName, className, text) {
  const element = makeElement(tagName, className, text);
  parent.append(element);
  return element;
}

function createMissionCard(mission) {
  const card = makeElement("article", "mission-card");
  const meta = makeElement("div", "mission-card__meta");
  meta.append(
    makeElement("span", "mission-card__code", mission.id),
    makeElement("span", "mission-card__difficulty", mission.difficulty),
  );
  card.append(meta, makeElement("h2", "", mission.title));
  card.append(makeElement("p", "mission-card__region", mission.region));
  card.append(makeElement("p", "mission-card__summary", mission.summary));
  const footer = makeElement("div", "mission-card__footer");
  footer.append(makeElement("span", "mission-card__duration", `MISSION WINDOW · ${mission.duration}`));
  const button = makeElement("button", "mission-card__button", "Review profile →");
  button.type = "button";
  button.dataset.missionId = mission.id;
  button.setAttribute("aria-label", `Review ${mission.title} mission profile`);
  footer.append(button);
  card.append(footer);
  return card;
}

function renderMissionCards() {
  const archive = document.querySelector("#archive-missions");
  archive.replaceChildren(...MISSION_CATALOG.map(createMissionCard));
}

function renderScienceObjectives() {
  const list = document.querySelector("#science-objectives");
  list.replaceChildren(
    ...SCIENCE_OBJECTIVES.map((objective) => {
      const item = makeElement("li", "science-objective");
      item.append(makeElement("span", "science-objective__number", objective.number));
      const content = makeElement("span", "science-objective__content");
      content.append(makeElement("strong", "", objective.name));
      content.append(makeElement("small", "", objective.detail));
      item.append(content);
      return item;
    }),
  );

  const constraints = document.querySelector("#mission-constraints");
  constraints.replaceChildren(
    ...MISSION_CONSTRAINTS.map(({ label, value }) => {
      const item = makeElement("div", "constraint-item");
      item.append(makeElement("span", "", label));
      item.append(makeElement("strong", "", value));
      return item;
    }),
  );
}

function renderBriefing(state) {
  const mission = MISSION_CATALOG.find(({ id }) => id === state.selectedMissionId);
  if (!mission) {
    throw new RangeError(`Selected mission profile is unavailable: ${state.selectedMissionId}`);
  }

  document.querySelector("#briefing-code").textContent = mission.id;
  document.querySelector("#briefing-region").textContent = mission.region.toUpperCase();
  document.querySelector("#briefing-mission-title").textContent = mission.title;
  document.querySelector("#briefing-summary").textContent = mission.summary;
  document.querySelector("#briefing-duration").textContent = mission.duration;
  document.querySelector("#briefing-risk").textContent = mission.risk;
  document.querySelector("#briefing-objective").textContent = mission.objective;
}

function renderRoleSlots(state) {
  const container = document.querySelector("#player-slots");
  container.replaceChildren(
    ...PLAYER_SLOTS.map((slot) => {
      const assignment = state.playerAssignments.find(({ slotId }) => slotId === slot.id);
      const role = PLAYER_ROLES.find(({ id }) => id === assignment?.roleId);
      const button = makeElement("button", "player-slot");
      button.type = "button";
      button.dataset.playerSlot = slot.id;
      button.setAttribute("aria-pressed", String(state.activePlayerSlotId === slot.id));
      if (state.activePlayerSlotId === slot.id) {
        button.classList.add("player-slot--active");
      }
      button.append(makeElement("span", "player-slot__label", slot.label));
      button.append(makeElement("strong", "player-slot__role", role?.name ?? "Unassigned"));
      button.append(makeElement("small", "", role ? "ROLE ASSIGNED" : "SELECT A SPECIALTY"));
      return button;
    }),
  );
  const activeSlot = PLAYER_SLOTS.find(({ id }) => id === state.activePlayerSlotId);
  document.querySelector("#active-slot-label").textContent = activeSlot?.label ?? "PLAYER 01";
  document.querySelector("#role-grid").replaceChildren(
    ...PLAYER_ROLES.map((role) => {
      const assignment = state.playerAssignments.find(({ slotId }) => slotId === state.activePlayerSlotId);
      const selected = assignment?.roleId === role.id;
      const card = makeElement("article", `role-card${selected ? " role-card--selected" : ""}`);
      const select = makeElement("button", "role-card__select");
      select.type = "button";
      select.dataset.roleId = role.id;
      select.setAttribute("aria-pressed", String(selected));
      select.append(makeElement("span", "role-card__designation", role.designation));
      select.append(makeElement("strong", "role-card__name", role.name));
      select.append(makeElement("span", "role-card__responsibility", role.responsibility));
      select.append(makeElement("span", "role-card__action", selected ? "Assigned to active slot" : "Assign to active slot →"));
      card.append(select);
      const details = makeElement("div", "role-card__details");
      details.append(makeElement("span", "eyebrow", "DECISIONS"));
      const list = makeElement("ul");
      role.decisions.forEach((decision) => list.append(makeElement("li", "", decision)));
      details.append(list);
      details.append(makeElement("p", "role-card__contribution", role.contribution));
      card.append(details);
      return card;
    }),
  );
  const assignedCount = state.playerAssignments.filter(({ roleId }) => roleId).length;
  document.querySelector("#continue-to-planning").disabled = assignedCount === 0;
  document.querySelector("#roles-status").textContent =
    assignedCount === 0
      ? "Assign at least one role to continue. Slots may remain unassigned."
      : `${assignedCount} of 4 local player slots assigned. Continue when your team is ready.`;
}

function renderPlanning(state) {
  const mission = MISSION_CATALOG.find(({ id }) => id === state.currentMissionId);
  const plan = state.missionPlan;
  if (!mission || !plan?.configuration) {
    throw new RangeError("Mission planning requires an accepted mission profile.");
  }
  const { configuration, estimates, risks, validation } = plan;
  const profile = MISSION_CATALOG.find(({ id }) => id === configuration.missionProfileId);
  const durationInput = document.querySelector("#planning-duration-input");
  const selectedIds = new Set(configuration.objectivePriorities.map(({ objectiveId }) => objectiveId));
  const priorityByObjective = new Map(
    configuration.objectivePriorities.map(({ objectiveId, priority }) => [objectiveId, priority]),
  );
  const scienceCapabilities = new Map(
    getScientificCapabilities(state.rover)
      .map((item) => [item.objectiveId, item]),
  );
  const credits = (value) => `${Math.round(value).toLocaleString()} cr`;
  const mass = (value) => value === null ? "—" : `${value.toFixed(1)} kg`;
  const power = (value) => `${value.toFixed(1)} W`;
  const hours = (value) => `${value.toFixed(1)} h`;

  document.querySelector("#planning-code").textContent = `OPERATION ${mission.id}`;
  document.querySelector("#planning-profile").replaceChildren(
    ...MISSION_CATALOG.map((item) => {
      const option = makeElement("option", "", `${item.id} · ${item.title}`);
      option.value = item.id;
      option.selected = item.id === configuration.missionProfileId;
      return option;
    }),
  );
  document.querySelector("#planning-name").value = configuration.missionName;
  durationInput.min = String(MISSION_PLANNING_LIMITS.minimumDurationSols);
  durationInput.max = String(MISSION_PLANNING_LIMITS.maximumDurationSols);
  durationInput.value =
    Number.isFinite(configuration.durationSols) ? configuration.durationSols : "";
  document.querySelector("#planning-profile-summary").textContent =
    profile ? `${profile.region} · ${profile.summary}` : "Choose an available mission profile.";

  const siteContainer = document.querySelector("#landing-sites");
  siteContainer.replaceChildren(
    ...LANDING_SITES.map((site) => {
      const selected = state.selectedLandingSiteId === site.id;
      const button = makeElement("button", `site-card${selected ? " site-card--selected" : ""}`);
      button.type = "button";
      button.dataset.siteId = site.id;
      button.setAttribute("aria-pressed", String(selected));
      button.append(makeElement("span", "site-card__coordinates", site.coordinates));
      button.append(makeElement("strong", "site-card__name", site.name));
      button.append(makeElement("span", "site-card__terrain", site.terrain));
      button.append(makeElement("span", "site-card__note", site.note));
      button.append(makeElement("small", "site-card__science", `Science context · ${site.scientificImportance}`));
      button.append(makeElement("small", "site-card__conditions", site.environmentalConditions));
      button.append(makeElement("small", "site-card__risk", `Operational consideration · ${site.operationalRisks}`));
      button.append(makeElement("small", "site-card__communications", `Communications · ${site.communicationConsiderations}`));
      return button;
    }),
  );

  const objectives = document.querySelector("#planning-objectives");
  objectives.replaceChildren(
    ...SCIENCE_OBJECTIVES.map((objective) => {
      const selected = selectedIds.has(objective.id);
      const capability = scienceCapabilities.get(objective.id);
      const requirements = SCIENCE_CAPABILITY_REQUIREMENTS.find(
        ({ objectiveId }) => objectiveId === objective.id,
      );
      const card = makeElement("article", `planning-objective${selected ? " planning-objective--selected" : ""}`);
      const header = makeElement("div", "planning-objective__header");
      const label = makeElement("label", "planning-objective__select");
      const checkbox = makeElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected;
      checkbox.dataset.objectiveId = objective.id;
      checkbox.setAttribute("aria-label", `Plan objective: ${objective.name}`);
      label.append(checkbox, makeElement("strong", "", objective.name));
      header.append(label);
      const priority = makeElement("label", "planning-objective__priority");
      priority.append(makeElement("span", "", "PRIORITY"));
      const prioritySelect = makeElement("select");
      prioritySelect.dataset.objectivePriority = objective.id;
      prioritySelect.disabled = !selected;
      prioritySelect.setAttribute("aria-label", `${objective.name} priority`);
      prioritySelect.replaceChildren(
        ...SCIENCE_OBJECTIVES.map((_, index) => {
          const option = makeElement("option", "", `P${index + 1}`);
          option.value = String(index + 1);
          option.selected = priorityByObjective.get(objective.id) === index + 1;
          return option;
        }),
      );
      priority.append(prioritySelect);
      header.append(priority);
      card.append(header);
      card.append(makeElement("p", "planning-objective__detail", objective.detail));
      card.append(makeElement(
        "p",
        "planning-objective__importance",
        objective.id === "agriculture"
          ? "Settlement relevance: combines regolith chemistry, nutrient-related indicators, potential water indicators, and environmental conditions. These measures do not establish that Martian soil is agriculture-ready."
          : `Settlement relevance: ${objective.detail}`,
      ));
      const required = makeElement("ul", "planning-objective__capabilities");
      (requirements?.requiredCapabilities ?? []).forEach((item) => {
        const installed = item.instrumentIds
          .filter((id) => state.rover.instruments.includes(id))
          .map((id) => findRoverOption("instruments", id)?.name)
          .filter(Boolean);
        const instruments = item.instrumentIds
          .map((id) => findRoverOption("instruments", id)?.name)
          .filter(Boolean);
        const line = makeElement("li", installed.length ? "is-covered" : "");
        line.append(
          makeElement("strong", "", item.label),
          makeElement(
            "small",
            "",
            `Required: ${instruments.join(" or ") || "catalog instrument"} · Installed: ${installed.join(", ") || "none"}`,
          ),
        );
        required.append(line);
      });
      card.append(required);
      const coverage = capability?.coverageStatus === "ready"
        ? "CAPABILITY COVERED"
        : capability?.coverageStatus === "partial"
          ? "PARTIAL CAPABILITY"
          : "CAPABILITY MISSING";
      card.append(makeElement(
        "span",
        `planning-objective__coverage planning-objective__coverage--${capability?.coverageStatus ?? "not-covered"}`,
        coverage,
      ));
      return card;
    }),
  );

  const estimatesContainer = document.querySelector("#planning-resource-estimates");
  const estimateCard = (title, items) => {
    const card = makeElement("article", "planning-estimate");
    card.append(makeElement("h3", "", title));
    const list = makeElement("dl", "planning-estimate__list");
    items.forEach(([labelText, value]) => {
      list.append(makeElement("dt", "", labelText), makeElement("dd", "", value));
    });
    card.append(list);
    return card;
  };
  estimatesContainer.replaceChildren(
    estimateCard("BUDGET · CREDITS", [
      ["Available", credits(estimates.budget.availableCredits)],
      ["Rover construction", credits(estimates.budget.constructionCredits)],
      ["Launch expenditure", credits(estimates.budget.launchCredits)],
      ["Planned operations", credits(estimates.budget.plannedOperationsCredits)],
      ["Communications", credits(estimates.budget.plannedCommunicationsCredits)],
      ["Maintenance allowance", credits(estimates.budget.maintenanceCredits)],
      ["Estimated remaining", credits(estimates.budget.remainingCredits)],
    ]),
    estimateCard("POWER · W / Wh", [
      ["Selected system", estimates.power.systemName],
      ["Nominal generation", power(estimates.power.nominalGenerationW)],
      ["Estimated at site", power(estimates.power.estimatedAvailablePowerW)],
      ["Estimated peak load", power(estimates.power.estimatedPeakLoadW)],
      ["Estimated power margin", power(estimates.power.estimatedPowerMarginW)],
      ["Battery capacity", `${estimates.power.batteryCapacityWh.toFixed(1)} Wh`],
      ["Estimated reserve", `${estimates.power.estimatedBatteryReserveWh.toFixed(1)} Wh (${estimates.power.estimatedBatteryReservePercentage.toFixed(1)}%)`],
    ]),
    estimateCard("DATA · MB", [
      ["Expected science data", `${estimates.data.expectedScienceDataMB.toFixed(1)} MB`],
      ["Onboard storage", `${estimates.data.storageCapacityMB.toFixed(1)} MB`],
      ["Communication capacity", `${estimates.data.communicationCapacityMBPerSol.toFixed(1)} MB/sol`],
      ["Estimated transmission time", hours(estimates.data.estimatedTransmissionHours)],
      ["Planned instrument set", estimates.data.plannedInstrumentIds
        .map((id) => findRoverOption("instruments", id)?.name ?? id)
        .join(", ") || "No objective instrument selected"],
    ]),
    estimateCard("TIME · GAMEPLAY HOURS", [
      ["Mission duration", `${estimates.time.durationSols} sols · ${hours(estimates.time.durationHours)}`],
      ["Instrument operations", hours(estimates.time.instrumentOperationHours)],
      ["Communications", hours(estimates.time.communicationHours)],
      ["Maintenance allowance", hours(estimates.time.maintenanceAllowanceHours)],
      ["Emergency reserve", hours(estimates.time.emergencyReserveHours)],
      ["Estimated unallocated time", hours(estimates.time.planningHoursRemaining)],
    ]),
    estimateCard("MASS · KG", [
      ["Rover mass", mass(estimates.mass.roverMassKg)],
      ["Instrument payload mass", mass(estimates.mass.instrumentPayloadMassKg)],
      ["Payload capacity remaining", mass(estimates.mass.remainingPayloadCapacityKg)],
    ]),
  );

  const strategies = document.querySelector("#planning-strategies");
  strategies.replaceChildren(
    ...MISSION_STRATEGIES.map((strategy) => {
      const selected = strategy.id === configuration.strategyId;
      const button = makeElement(
        "button",
        `planning-strategy${selected ? " planning-strategy--selected" : ""}`,
      );
      button.type = "button";
      button.dataset.strategyId = strategy.id;
      button.setAttribute("aria-pressed", String(selected));
      button.append(makeElement("span", "planning-strategy__tag", selected ? "SELECTED APPROACH" : "PLANNING GUIDANCE"));
      button.append(makeElement("strong", "", strategy.name));
      button.append(makeElement("span", "", strategy.description));
      button.append(makeElement("small", "", `Trade-off · ${strategy.tradeoff}`));
      button.append(makeElement("small", "", strategy.effect));
      return button;
    }),
  );

  const riskList = document.querySelector("#planning-risk-list");
  riskList.replaceChildren(...risks.map((item) => {
    const card = makeElement("article", "planning-risk");
    card.dataset.severity = item.severity;
    const meta = makeElement("div", "planning-risk__meta");
    meta.append(
      makeElement("span", "planning-risk__category", item.category),
      makeElement("span", "planning-risk__severity", item.severity.toUpperCase()),
      makeElement("span", "planning-risk__blocking", item.blocksValidation ? "BLOCKING" : "ADVISORY"),
    );
    card.append(meta, makeElement("h3", "", item.description));
    card.append(makeElement("p", "", item.reason));
    card.append(makeElement("small", "", `Mitigation · ${item.mitigation}`));
    return card;
  }));

  const report = document.querySelector("#planning-validation-report");
  report.replaceChildren(...validation.checks.map((check) => {
    const row = makeElement("article", `planning-check${check.passed ? " planning-check--pass" : " planning-check--fail"}`);
    row.dataset.passed = String(check.passed);
    row.append(makeElement("span", "planning-check__result", check.passed ? "PASS" : "FAIL"));
    const content = makeElement("div", "planning-check__content");
    content.append(makeElement("strong", "", check.label));
    content.append(makeElement("small", "", check.message));
    row.append(content);
    return row;
  }));
  const recommendations = document.querySelector("#planning-recommendations");
  recommendations.replaceChildren(
    ...(validation.recommendations.length
      ? validation.recommendations.map((item) => makeElement("li", "", item))
      : [makeElement("li", "", "No corrective action is required by the current validation report.")]),
  );
  document.querySelector("#planning-validation-marker").textContent = validation.validatedAt.toUpperCase();
  const readiness = validation.overallStatus;
  const readinessDataset = readiness === "READY"
    ? "normal"
    : readiness === "NEEDS ATTENTION"
      ? "warning"
      : "critical";
  const setReadiness = (element) => {
    element.dataset.status = readinessDataset;
    element.replaceChildren(
      makeElement("span", `status-dot ${readiness === "READY" ? "status-dot--live" : "status-dot--warning"}`),
      document.createTextNode(` ${readiness}`),
    );
  };
  setReadiness(document.querySelector("#planning-readiness"));
  setReadiness(document.querySelector("#planning-readiness-status"));
  document.querySelector("#planning-readiness-explanation").textContent =
    readiness === "READY"
      ? "All mandatory planning and rover checks pass. The plan is ready to enter mission control."
      : readiness === "NEEDS ATTENTION"
        ? "Mandatory requirements pass, but advisory risks remain. Review the risk list before proceeding."
        : `${validation.failedChecks.length} mandatory check${validation.failedChecks.length === 1 ? "" : "s"} still require attention. Configure the rover next, then return here to correct any remaining blockers.`;
  const setupValidation = validatePlanningInputs(configuration);
  const continueButton = document.querySelector("#continue-to-rover");
  continueButton.disabled = !setupValidation.isValid;
  continueButton.setAttribute("aria-describedby", "planning-readiness-explanation");
}

function renderRover(state) {
  const container = document.querySelector("#rover-categories");
  const objectiveIds = state.missionPlan?.configuration.objectivePriorities
    .map(({ objectiveId }) => objectiveId) ?? [];
  const recommendationContext = JSON.stringify({
    objectiveIds,
    landingSiteId: state.selectedLandingSiteId,
  });
  if (roverRecommendationContext && roverRecommendationContext !== recommendationContext) {
    roverRecommendation = null;
    roverRecommendationContext = null;
  }
  const metrics = calculateRoverMetrics(state.rover, {
    selectedLandingSiteId: state.selectedLandingSiteId,
  });
  const validation = validateRoverConfiguration(state.rover, ENGINEERING_LIMITS, {
    selectedLandingSiteId: state.selectedLandingSiteId,
    objectiveIds,
  });
  const missionValidation = state.missionPlan?.validation;
  const recommendationStatus = document.querySelector("#rover-recommendation-status");
  const recommendationButton = document.querySelector("#build-recommended-rover");
  recommendationButton.disabled = Boolean(state.resources);
  recommendationButton.setAttribute("aria-describedby", "rover-recommendation-status");
  recommendationButton.title = state.resources
    ? "Rover configuration is locked after mission operations begin."
    : "Select the least expensive valid catalog rover for the selected science objectives.";
  document.querySelector('[data-action="reset-rover"]').disabled = Boolean(state.resources);
  recommendationStatus.textContent = roverRecommendation?.reason
    ?? "Select objectives in mission planning, then build a recommended configuration or choose components manually.";
  recommendationStatus.dataset.status = roverRecommendation
    ? roverRecommendation.isValid ? "normal" : "critical"
    : "info";
  const formatCredits = (value) => `${Math.round(value).toLocaleString()} cr`;
  const formatMass = (value) => `${value.toFixed(1)} kg`;
  const formatPower = (value) => `${value.toFixed(1)} W`;
  document.querySelector("#rover-mass").textContent = formatMass(metrics.totalMassKg);
  document.querySelector("#rover-cost").textContent = formatCredits(metrics.totalCostCredits);
  document.querySelector("#rover-generation").textContent = formatPower(metrics.powerGenerationW);
  document.querySelector("#rover-consumption").textContent = formatPower(metrics.powerConsumptionW);
  const margin = document.querySelector("#rover-margin");
  margin.textContent = `${metrics.powerMarginW >= 0 ? "+" : ""}${formatPower(metrics.powerMarginW)}`;
  margin.classList.toggle("metric-value--negative", metrics.powerMarginW < 0);
  document.querySelector("#rover-payload").textContent = metrics.payloadRemainingKg === null
    ? "Select chassis"
    : `${formatMass(metrics.payloadRemainingKg)} of ${formatMass(metrics.payloadCapacityKg)}`;
  document.querySelector("#rover-reliability").textContent = metrics.reliability === null
    ? "No components"
    : `${(metrics.reliability * 100).toFixed(1)}% average`;
  document.querySelector("#rover-equipment-slots").textContent =
    `${metrics.equipmentSlotsUsed} / ${metrics.equipmentSlotsAvailable ?? "—"}`;
  document.querySelector("#rover-instrument-slots").textContent =
    `${metrics.instrumentSlotsUsed} / ${metrics.instrumentSlotsAvailable}`;
  document.querySelector("#rover-data-generation").textContent =
    `${metrics.instrumentDataUnitsPerOperation} units`;
  document.querySelector("#rover-data-capacity").textContent =
    `${metrics.dataCapacityUnitsPerSol} units/sol`;
  document.querySelector("#rover-communication").textContent = metrics.communicationCapability === null
    ? "Not installed"
    : `Level ${metrics.communicationCapability}`;
  const environment = metrics.environmentalSuitability;
  document.querySelector("#rover-environment").textContent = environment
    ? `${environment.score}/100 · ${environment.status.replaceAll("-", " ")}`
    : "Select mobility & landing";
  document.querySelector("#rover-mass-headroom").textContent =
    `${(ENGINEERING_LIMITS.maxRoverMassKg - metrics.totalMassKg).toFixed(1)} kg`;
  document.querySelector("#rover-budget-remaining").textContent =
    formatCredits(ENGINEERING_LIMITS.maxConstructionBudgetCredits - metrics.totalCostCredits);
  const badge = document.querySelector("#rover-validity-badge");
  badge.replaceChildren(
    makeElement("span", `status-dot ${validation.isValid ? "status-dot--live" : "status-dot--warning"}`),
    makeElement("span", "", validation.isValid ? "ENGINEERING LIMITS MET" : "CONFIGURATION INCOMPLETE"),
  );
  document.querySelector("#continue-to-control").disabled =
    !validation.isValid || !missionValidation?.isReady;
  const readinessSummary = document.querySelector("#rover-readiness-summary");
  readinessSummary.dataset.status = missionValidation?.isReady ? "normal" : "critical";
  readinessSummary.textContent = missionValidation?.isReady
    ? `Mission validation: ${missionValidation.overallStatus}. You can proceed to Mission Control.`
    : `Mission validation: ${missionValidation?.overallStatus ?? "NOT READY"}. ${
      missionValidation?.failedChecks.slice(0, 3).map(({ message }) => message).join(" ")
      ?? "Return to mission planning and complete the plan."
    }`;

  const errors = document.querySelector("#rover-errors");
  errors.replaceChildren(...validation.errors.map(({ message }) => {
    const item = makeElement("li", "validation-message validation-message--error", message);
    return item;
  }));
  if (validation.errors.length === 0) {
    errors.append(makeElement("li", "validation-message validation-message--success", "All mandatory rover constraints are met."));
  }
  const warnings = document.querySelector("#rover-warnings");
  warnings.replaceChildren(...validation.warnings.map(({ message }) =>
    makeElement("li", "validation-message validation-message--warning", message),
  ));
  if (validation.warnings.length === 0) {
    warnings.append(makeElement("li", "validation-message validation-message--success", "No optimization warnings for this configuration."));
  }

  const capabilityList = document.querySelector("#rover-capabilities");
  capabilityList.replaceChildren(...metrics.scientificCapabilities.map((capability) => {
    const card = makeElement("article", `capability-card capability-card--${capability.coverageStatus}`);
    const header = makeElement("div", "capability-card__header");
    header.append(makeElement("strong", "", capability.objectiveName));
    header.append(makeElement("span", "", capability.coverageStatus.replaceAll("-", " ")));
    card.append(header);
    const required = makeElement("p", "capability-card__required");
    required.append(makeElement("strong", "", "Required instruments: "));
    required.append(document.createTextNode(
      capability.requiredCapabilities
        .map(({ label, requiredInstruments }) => `${label}: ${requiredInstruments.join(" or ")}`)
        .join("; "),
    ));
    card.append(required);
    const available = makeElement("p", "capability-card__available");
    available.append(makeElement("strong", "", "Available instruments: "));
    available.append(document.createTextNode(
      capability.availableInstruments.length ? capability.availableInstruments.join(", ") : "None installed",
    ));
    card.append(available);
    if (capability.missingCapabilities.length) {
      const missing = makeElement("p", "capability-card__missing");
      missing.append(makeElement("strong", "", "Missing: "));
      missing.append(document.createTextNode(capability.missingCapabilities.join(", ")));
      card.append(missing);
    }
    return card;
  }));

  const assignedRoles = state.playerAssignments
    .map((assignment) => ({
      assignment,
      role: PLAYER_ROLES.find(({ id }) => id === assignment.roleId),
      slot: PLAYER_SLOTS.find(({ id }) => id === assignment.slotId),
    }))
    .filter(({ role }) => role);
  const guidance = document.querySelector("#rover-role-guidance");
  guidance.replaceChildren(...(assignedRoles.length
    ? assignedRoles.map(({ assignment, role, slot }) => {
      const item = makeElement("article", "role-guidance-card");
      item.append(makeElement("span", "role-guidance-card__slot", slot?.label ?? assignment.slotId));
      item.append(makeElement("strong", "", role.name));
      item.append(makeElement("p", "", role.roverGuidance));
      return item;
    })
    : [makeElement("p", "inline-status", "No role assignments found. Role guidance does not affect the calculations.")]));

  container.replaceChildren(
    ...ROVER_CATEGORIES.map((category, index) => {
      const section = makeElement("section", "rover-category");
      section.setAttribute("aria-labelledby", `rover-category-${category.id}`);
      const heading = makeElement("div", "rover-category__heading");
      heading.append(makeElement("span", "rover-category__index", String(index + 1).padStart(2, "0")));
      const headingText = makeElement("div");
      headingText.append(makeElement("h3", "", category.title));
      headingText.append(makeElement("p", "", category.description));
      heading.append(headingText);
      heading.querySelector("h3").id = `rover-category-${category.id}`;
      section.append(heading);
      const options = makeElement("div", "rover-options");
      options.setAttribute("role", "group");
      options.setAttribute("aria-label", `${category.title} concepts`);
      category.options.forEach((option) => {
        const selected = category.id === "instruments"
          ? state.rover.instruments.includes(option.id)
          : state.rover[category.id] === option.id;
        const button = makeElement("button", `rover-option${selected ? " rover-option--selected" : ""}`);
        button.type = "button";
        button.dataset.roverCategory = category.id;
        button.dataset.roverOption = option.id;
        button.setAttribute("aria-pressed", String(selected));
        button.setAttribute(
          "aria-label",
          category.id === "instruments"
            ? `${selected ? "Remove" : "Install"} ${option.name}`
            : `Select ${option.name}`,
        );
        button.disabled = Boolean(state.resources);
        button.append(makeElement("strong", "", `${selected && category.id === "instruments" ? "✓ " : ""}${option.name}`));
        button.append(makeElement("small", "", option.detail));
        if (option.purpose) {
          button.append(makeElement("span", "rover-option__purpose", option.purpose));
        }
        const specs = [];
        if (option.massKg !== undefined) specs.push(`${option.massKg} kg`);
        if (option.costCredits !== undefined) specs.push(`${option.costCredits.toLocaleString()} cr`);
        if (option.generationW !== undefined) specs.push(`+${option.generationW} W`);
        if (option.operatingPowerW) specs.push(`${option.operatingPowerW} W draw`);
        if (option.payloadCapacityKg !== undefined) specs.push(`${option.payloadCapacityKg} kg payload`);
        if (option.instrumentSlots !== undefined) specs.push(`${option.instrumentSlots} instrument slots`);
        if (option.equipmentSlots !== undefined) specs.push(`${option.equipmentSlots} equipment slots`);
        if (option.mobilityCapability !== undefined) specs.push(`mobility ${option.mobilityCapability}/100`);
        if (option.terrainCapabilities?.length) specs.push(`terrain: ${option.terrainCapabilities.join(", ")}`);
        if (option.communicationCapability !== undefined) specs.push(`link level ${option.communicationCapability}`);
        if (option.dataCapacityUnitsPerSol !== undefined) specs.push(`${option.dataCapacityUnitsPerSol} units/sol`);
        if (option.environmentalProtection !== undefined) specs.push(`protection ${option.environmentalProtection}/100`);
        if (option.reliability !== undefined) specs.push(`reliability ${(option.reliability * 100).toFixed(0)}%`);
        if (option.dataUnitsPerOperation !== undefined) specs.push(`${option.dataUnitsPerOperation} data units/operation`);
        if (specs.length) {
          button.append(makeElement("span", "rover-option__specs", specs.join(" · ")));
        }
        if (option.capabilities?.length) {
          button.append(makeElement("span", "rover-option__capabilities", `Capabilities: ${option.capabilities.join(", ")}`));
        }
        if (option.limitation) {
          button.append(makeElement("span", "rover-option__limitation", option.limitation));
        }
        if (option.supportedObjectives?.length) {
          const objectiveLabels = (option.supportedObjectives ?? [])
            .map((objectiveId) => SCIENCE_OBJECTIVES.find(({ id }) => id === objectiveId)?.name)
            .filter(Boolean);
          if (objectiveLabels.length) {
            button.append(makeElement("span", "rover-option__capabilities", `Supports objectives: ${objectiveLabels.join(", ")}`));
          }
        }
        const explanation = roverRecommendation?.explanations.find(
          ({ categoryId: recommendedCategory, id }) =>
            recommendedCategory === category.id && id === option.id,
        );
        if (explanation) {
          const reason = makeElement(
            "span",
            "rover-option__recommendation",
            `Recommended · Why is this component needed? ${explanation.explanation}`,
          );
          reason.id = `rover-recommendation-${category.id}-${option.id}`;
          button.setAttribute("aria-describedby", reason.id);
          button.append(reason);
        }
        options.append(button);
      });
      section.append(options);
      return section;
    }),
  );
}

function buildRecommendedRover(state) {
  const objectiveIds = state.missionPlan?.configuration.objectivePriorities
    .map(({ objectiveId }) => objectiveId) ?? [];
  roverRecommendationContext = JSON.stringify({
    objectiveIds,
    landingSiteId: state.selectedLandingSiteId,
  });
  roverRecommendation = recommendRoverConfiguration(
    objectiveIds,
    state.selectedLandingSiteId,
    ENGINEERING_LIMITS,
  );
  if (!roverRecommendation.isValid) return roverRecommendation;
  resetRoverConfiguration();
  for (const categoryId of ["chassis", "mobility", "power", "communications", "landing"]) {
    selectRoverOption(categoryId, roverRecommendation.configuration[categoryId]);
  }
  for (const instrumentId of roverRecommendation.configuration.instruments) {
    selectRoverOption("instruments", instrumentId);
  }
  return roverRecommendation;
}

function renderControl(state) {
  if (!state.resources) {
    throw new Error("Mission control requires initialized mission resources.");
  }
  if (!state.missionExecution) {
    throw new Error("Mission control requires initialized mission execution state.");
  }
  const execution = state.missionExecution;
  const scientistDialogue = getCurrentScientistDialogue();
  document.querySelector("#control-scientist-copy").textContent = scientistDialogue
    ? `${scientistDialogue.category.replaceAll("_", " ")} · ${scientistDialogue.text}`
    : "Dr. Chen is monitoring the mission record. No new science message is available yet.";
  document.querySelector("#control-scientist-unread").textContent =
    `${getAvailableScientistDialogues().length} NEW`;
  const site = LANDING_SITES.find(({ id }) => id === state.selectedLandingSiteId);
  document.querySelector("#control-site-name").textContent = site?.name.toUpperCase() ?? "SITE PREVIEW";
  document.querySelector("#control-site-coordinates").textContent = site?.coordinates ?? "COORDINATES UNAVAILABLE";
  document.querySelector("#control-site-terrain").textContent =
    `${site?.terrain ?? "No site selected"}. Waypoint distances and terrain are illustrative gameplay data, not actual topography.`;

  const progress = getMissionExecutionProgress(execution, state.resources);
  const statusElement = document.querySelector("#execution-status");
  statusElement.textContent = execution.status;
  statusElement.dataset.status = execution.status === "ACTIVE"
    ? "normal"
    : execution.status === "PAUSED"
      ? "warning"
      : execution.status === "COMPLETED"
        ? "normal"
        : "critical";
  document.querySelector("#execution-summary").textContent =
    `${progress.completedObjectives} / ${progress.totalObjectives} selected objectives complete · ${progress.locationsExplored} locations explored · ${progress.samplesCollected} samples collected · ${progress.observationsRecorded} observations`;
  document.querySelector("#execution-action-status").textContent =
    executionActionError || (progress.canComplete
      ? "All configured completion requirements are met. You may complete the mission."
      : "Completion requires all selected objectives, the configured exploration count, and transmitted data.");
  executionActionError = "";
  document.querySelectorAll("[data-execution-action]").forEach((button) => {
    const action = button.dataset.executionAction;
    button.disabled = execution.status !== "ACTIVE"
      && !(action === "resume" && execution.status === "PAUSED");
    if (action === "resume") button.disabled = execution.status !== "PAUSED";
    if (action === "pause") button.disabled = execution.status !== "ACTIVE";
    if (action === "complete") button.disabled = execution.status !== "ACTIVE" || !progress.canComplete;
    if (action === "move") button.disabled = execution.status !== "ACTIVE" || !execution.selectedDestinationId;
  });

  const waypoints = getMissionAvailableWaypoints(execution);
  const currentWaypoint = getMissionWaypoint(execution.currentWaypointId);
  document.querySelector("#rover-current-location").textContent = currentWaypoint?.name ?? "Unavailable";
  document.querySelector("#rover-operational-status").textContent = execution.operationalStatus.toUpperCase();
  document.querySelector("#rover-current-activity").textContent = execution.currentActivity;
  document.querySelector("#rover-distance-traveled").textContent = `${execution.distanceTraveledKm.toFixed(2)} km`;

  document.querySelector("#surface-waypoints").replaceChildren(
    ...waypoints.map((waypoint) => {
      const marker = makeElement(
        "button",
        `surface-map__waypoint${waypoint.id === execution.currentWaypointId ? " surface-map__waypoint--current" : ""}${waypoint.id === execution.selectedDestinationId ? " surface-map__waypoint--selected" : ""}`,
        waypoint.name,
      );
      marker.type = "button";
      marker.disabled = execution.status !== "ACTIVE" || waypoint.id === execution.currentWaypointId;
      marker.dataset.waypointId = waypoint.id;
      marker.style.left = `${waypoint.coordinates.x}%`;
      marker.style.top = `${waypoint.coordinates.y}%`;
      marker.setAttribute("aria-label", `${waypoint.name}, ${waypoint.terrain}${waypoint.id === execution.currentWaypointId ? ", current location" : ""}`);
      marker.title = `${waypoint.name} · ${waypoint.terrain} · ${waypoint.scientificImportance}`;
      return marker;
    }),
  );
  const routeLine = document.querySelector("#surface-route-line");
  const selectedWaypoint = execution.selectedDestinationId
    ? getMissionWaypoint(execution.selectedDestinationId)
    : null;
  if (currentWaypoint && selectedWaypoint) {
    routeLine.setAttribute("x1", String(currentWaypoint.coordinates.x));
    routeLine.setAttribute("y1", String(currentWaypoint.coordinates.y));
    routeLine.setAttribute("x2", String(selectedWaypoint.coordinates.x));
    routeLine.setAttribute("y2", String(selectedWaypoint.coordinates.y));
    routeLine.hidden = false;
  } else {
    routeLine.hidden = true;
  }
  const destinationSelect = document.querySelector("#surface-destination");
  destinationSelect.disabled = execution.status !== "ACTIVE";
  destinationSelect.replaceChildren(
    makeElement("option", "", "Select a waypoint"),
    ...waypoints
      .filter(({ id }) => id !== execution.currentWaypointId)
      .map((waypoint) => {
        const option = makeElement("option", "", `${waypoint.name} · ${waypoint.terrain}`);
        option.value = waypoint.id;
        option.selected = waypoint.id === execution.selectedDestinationId;
        return option;
      }),
  );
  destinationSelect.value = execution.selectedDestinationId ?? "";
  const routeSummary = document.querySelector("#surface-route-summary");
  if (execution.routePreview) {
    routeSummary.textContent =
      `Route ${execution.routePreview.distanceKm.toFixed(2)} illustrative km · ${execution.routePreview.durationHours.toFixed(2)} h · ${execution.routePreview.movementPowerW} W movement draw · ~${execution.routePreview.estimatedCostCredits.toFixed(2)} cr`;
  } else {
    routeSummary.textContent = "Select a waypoint to preview route distance, estimated time, power, and cost.";
  }

  const resources = getResourceSummary(state.resources);
  const formatCredits = (amount) => `${Math.round(amount).toLocaleString()} cr`;
  const formatHours = (hours) => `${hours.toFixed(1)} h`;
  const statusLabel = (status) => status.toUpperCase();
  document.querySelector("#mission-clock-value").textContent = resources.missionClock;
  document.querySelector("#mission-time-remaining").textContent =
    `${formatHours(resources.time.remainingHours)} remaining · ${resources.time.missionDurationHours / resources.time.hoursPerSol} sols total · ${MISSION_RESOURCE_CONFIG.solDefinitionLabel}`;
  document.querySelector("#control-power-value").textContent =
    `${resources.power.availablePowerW.toFixed(1)} W`;
  document.querySelector("#control-power-detail").textContent =
    `${resources.power.nominalGenerationW.toFixed(1)} W nominal · ${state.resources.power.environment.label}`;
  document.querySelector("#control-battery-value").textContent =
    `${resources.power.batteryPercentage.toFixed(1)}%`;
  document.querySelector("#control-battery-detail").textContent =
    `${resources.power.batteryEnergyWh.toFixed(1)} / ${resources.power.batteryCapacityWh.toFixed(1)} Wh`;
  document.querySelector("#control-link-value").textContent =
    `${resources.data.communicationCapacityMBPerSol.toFixed(1)} MB/sol`;
  document.querySelector("#control-link-detail").textContent =
    `${resources.data.transmissionFailures} transmission failures`;

  const setStatus = (name, status) => {
    const element = document.querySelector(`#resource-${name}-status`);
    element.textContent = statusLabel(status);
    element.dataset.status = status;
    document.querySelector(`[data-resource-card="${name}"]`).dataset.status = status;
  };
  for (const resource of ["power", "budget", "data", "time", "mass"]) {
    setStatus(resource, resources.status[resource]);
  }
  document.querySelector("#resource-power-generation").textContent =
    `${resources.power.availablePowerW.toFixed(1)} W`;
  document.querySelector("#resource-power-demand").textContent =
    `${resources.power.currentLoadW.toFixed(1)} W`;
  document.querySelector("#resource-power-margin").textContent =
    `${resources.power.powerMarginW >= 0 ? "+" : ""}${resources.power.powerMarginW.toFixed(1)} W`;
  document.querySelector("#resource-battery-energy").textContent =
    `${resources.power.batteryEnergyWh.toFixed(1)} / ${resources.power.batteryCapacityWh.toFixed(1)} Wh`;
  document.querySelector("#resource-battery-progress").value = resources.power.batteryPercentage;
  const loadBreakdown = state.resources.power.lastLoadBreakdownW;
  document.querySelector("#resource-power-breakdown").textContent =
    `Standby ${loadBreakdown.standbyPowerW.toFixed(1)} W · Rover ${loadBreakdown.roverOperatingPowerW.toFixed(1)} W · Instrument ${loadBreakdown.instrumentPowerW.toFixed(1)} W · Communications ${loadBreakdown.communicationPowerW.toFixed(1)} W · Movement ${loadBreakdown.movementPowerW.toFixed(1)} W · Maintenance ${loadBreakdown.maintenancePowerW.toFixed(1)} W`;
  document.querySelector("#resource-battery-caption").textContent =
    `${resources.power.energyConsumedWh.toFixed(1)} Wh cumulative energy demand`;
  document.querySelector("#resource-budget-total").textContent =
    formatCredits(resources.budget.initialBudgetCredits);
  document.querySelector("#resource-budget-spent").textContent =
    formatCredits(resources.budget.spentCredits);
  document.querySelector("#resource-budget-remaining").textContent =
    formatCredits(resources.budget.remainingCredits);
  document.querySelector("#resource-budget-breakdown").textContent =
    `Construction ${formatCredits(resources.budget.constructionCredits)} · Launch ${formatCredits(resources.budget.launchCredits)} · Operations ${formatCredits(resources.budget.operationsCredits)} · Communications ${formatCredits(resources.budget.communicationCredits)} · Maintenance ${formatCredits(resources.budget.maintenanceCredits)} · Samples ${formatCredits(resources.budget.sampleCredits)} · Challenges ${formatCredits(resources.budget.challengeCredits)}`;
  document.querySelector("#resource-data-generated").textContent =
    `${resources.data.generatedMB.toFixed(1)} MB`;
  document.querySelector("#resource-data-stored").textContent =
    `${resources.data.storedMB.toFixed(1)} MB`;
  document.querySelector("#resource-data-transmitted").textContent =
    `${resources.data.transmittedMB.toFixed(1)} MB`;
  document.querySelector("#resource-storage-progress").value =
    resources.data.storageUtilizationPercentage;
  document.querySelector("#resource-data-remaining").textContent =
    `${resources.data.remainingStorageMB.toFixed(1)} MB remaining`;
  document.querySelector("#resource-data-caption").textContent =
    `${resources.data.storageUtilizationPercentage.toFixed(1)}% of ${resources.data.storageCapacityMB.toFixed(1)} MB storage · ${resources.data.transmissionFailures} failed transmissions`;
  document.querySelector("#resource-time-elapsed").textContent =
    formatHours(resources.time.elapsedHours);
  document.querySelector("#resource-time-remaining").textContent =
    formatHours(resources.time.remainingHours);
  document.querySelector("#resource-time-breakdown").textContent =
    `Instrument ${formatHours(resources.time.instrumentOperationHours)} · Movement ${formatHours(resources.time.movementHours)} · Samples ${formatHours(resources.time.sampleCollectionHours)} · Communication ${formatHours(resources.time.communicationHours)} · Idle ${formatHours(resources.time.idleHours)} · Maintenance ${formatHours(resources.time.maintenanceHours)}`;
  document.querySelector("#resource-rover-mass").textContent =
    `${resources.mass.totalDeployedMassKg.toFixed(1)} kg`;
  document.querySelector("#resource-instrument-mass").textContent =
    `${resources.mass.installedInstrumentMassKg.toFixed(1)} kg`;
  document.querySelector("#resource-payload-mass").textContent =
    `${resources.mass.payloadMassKg.toFixed(1)} kg`;
  document.querySelector("#resource-payload-remaining").textContent =
    `${resources.mass.remainingPayloadCapacityKg.toFixed(1)} kg of ${resources.mass.payloadCapacityKg.toFixed(1)} kg`;

  const environmentSelect = document.querySelector("#power-environment");
  environmentSelect.disabled = execution.status !== "ACTIVE";
  environmentSelect.replaceChildren(
    ...MISSION_RESOURCE_CONFIG.environmentProfiles.map((environment) => {
      const option = makeElement("option", "", environment.label);
      option.value = environment.id;
      option.selected = environment.id === state.resources.power.environmentId;
      return option;
    }),
  );
  const instrumentOptions = state.rover.instruments
    .map((id) => findRoverOption("instruments", id))
    .filter(Boolean);
  document.querySelector("#resource-instrument-controls").replaceChildren(
    ...(instrumentOptions.length
      ? instrumentOptions.flatMap((instrument) => {
        const options = getAvailableScientificOperations(instrument.id);
        if (!options.length) {
          return [];
        }
        return options.map((operation) => {
          const button = makeElement(
            "button",
            "button button--secondary resource-instrument-button",
            `${instrument.name} · ${operation.objectiveName}: ${operation.capabilityName}`,
          );
          button.type = "button";
          button.dataset.resourceAction = "instrument";
          button.dataset.instrumentId = instrument.id;
          button.dataset.objectiveId = operation.objectiveId;
          button.dataset.capabilityId = operation.capabilityId;
          button.disabled = execution.status !== "ACTIVE";
          return button;
        });
      })
      : [makeElement("p", "inline-status", "No instruments are installed.")]),
  );
  const sampleAvailability = document.querySelector("#sample-availability");
  const availableSampleTypes = currentWaypoint?.sampleTypes ?? [];
  sampleAvailability.textContent = currentWaypoint
    ? `At ${currentWaypoint.name}, available sample types are listed below. Collection requires a regolith sampling system.`
    : "Current waypoint is unavailable.";
  document.querySelector("#sample-controls").replaceChildren(
    ...(state.rover.instruments.includes("regolith-sampler")
      ? MISSION_EXECUTION_CONFIG.sampleTypes
        .filter(({ id }) => availableSampleTypes.includes(id))
        .map((sample) => {
          const button = makeElement("button", "button button--secondary", `Collect ${sample.name} · ${sample.massKg} kg`);
          button.type = "button";
          button.dataset.sampleType = sample.id;
          button.disabled = execution.status !== "ACTIVE";
          return button;
        })
      : [makeElement("p", "inline-status", "Install a regolith sampling system to collect samples.")]),
  );
  document.querySelectorAll("[data-resource-action]").forEach((button) => {
    if (button.dataset.resourceAction !== "instrument") {
      button.disabled = execution.status !== "ACTIVE";
    }
  });
  document.querySelector("#resource-operation-status").textContent =
    resourceActionError || state.resources.lastNotice || "Choose an operation. Unsuccessful transmissions retain stored data and are recorded.";
  resourceActionError = "";

  document.querySelector("#resource-event-history").replaceChildren(
    ...[...state.resources.events].reverse().slice(0, 10).map((event) => {
      const entry = makeElement("article", "event-entry");
      entry.dataset.status = event.status;
      const meta = makeElement("div", "resource-event__meta");
      meta.append(
        makeElement("span", "event-entry__time", event.simulationTime),
        makeElement("span", `resource-event__status resource-event__status--${event.status}`, event.status.toUpperCase()),
      );
      entry.append(meta);
      entry.append(makeElement("p", "", event.description));
      const changes = Object.entries(event.resourceChanges)
        .filter(([, value]) => Number.isFinite(value) && value !== 0)
        .map(([key, value]) => `${key.replaceAll(/([A-Z])/g, " $1")}: ${value > 0 ? "+" : ""}${value}`)
        .join(" · ");
      if (changes) {
        entry.append(makeElement("small", "resource-event__changes", changes));
      }
      const timestamp = makeElement("time", "resource-event__timestamp", event.timestamp);
      timestamp.dateTime = event.timestamp;
      entry.append(timestamp);
      return entry;
    }),
  );

  const objectives = document.querySelector("#control-objectives");
  objectives.replaceChildren(
    ...execution.objectiveProgress.map((objective) => {
      const item = makeElement("div", "objective-status");
      const top = makeElement("div", "objective-status__top");
      top.append(makeElement("strong", "", objective.name));
      top.append(makeElement("span", "", objective.status.replaceAll("-", " ").toUpperCase()));
      item.append(top);
      const track = makeElement("div", "objective-status__track");
      const fill = makeElement("span", "objective-status__fill");
      fill.style.width = `${objective.progress}%`;
      track.append(fill);
      item.append(track);
      item.append(makeElement("small", "objective-status__detail", `${objective.completedCapabilities} / ${objective.requiredCapabilities.length} capabilities investigated`));
      return item;
    }),
  );

  document.querySelector("#mission-progress-count").textContent =
    `${progress.observationsRecorded} observations · ${progress.locationsExplored} explored`;
  document.querySelector("#mission-sample-inventory").replaceChildren(
    ...(execution.samples.length
      ? [...execution.samples].reverse().map((sample) => {
        const item = makeElement("article", "science-log-entry");
        item.append(makeElement("strong", "", `${sample.name} · ${sample.massKg.toFixed(1)} kg`));
        item.append(makeElement("small", "", `${sample.locationName} · ${sample.collectionTime}`));
        item.append(makeElement("p", "", sample.scientificRelevance));
        return item;
      })
      : [makeElement("p", "inline-status", "No samples collected.")]),
  );
  document.querySelector("#mission-observation-log").replaceChildren(
    ...(execution.observations.length
      ? [...execution.observations].reverse().map((observation) => {
        const item = makeElement("article", "science-log-entry");
        item.append(makeElement("strong", "", `${observation.objectiveId} · ${observation.capabilityId}`));
        item.append(makeElement("small", "", `${observation.instrumentId} at ${observation.locationName} · ${observation.durationHours.toFixed(2)} h · ${observation.generatedDataMB.toFixed(1)} MB · ${observation.timestamp}`));
        item.append(makeElement("p", "", observation.note));
        return item;
      })
      : [makeElement("p", "inline-status", "No scientific observations recorded.")]),
  );
  document.querySelector("#mission-event-history").replaceChildren(
    ...[...execution.events].reverse().slice(0, 12).map((event) => {
      const entry = makeElement("article", "resource-event");
      entry.dataset.status = event.status;
      const meta = makeElement("div", "resource-event__meta");
      meta.append(
        makeElement("span", "event-entry__time", `T+${event.simulationTimeHours.toFixed(2)} h`),
        makeElement("span", `resource-event__status resource-event__status--${event.status}`, event.status.toUpperCase()),
      );
      entry.append(meta, makeElement("p", "", event.message));
      const timestamp = makeElement("time", "resource-event__timestamp", event.timestamp);
      timestamp.dateTime = event.timestamp;
      entry.append(timestamp);
      return entry;
    }),
  );

  const timeline = document.querySelector("#mission-timeline");
  timeline.replaceChildren(
    ...MISSION_PHASES.map((phase, index) => {
      const item = makeElement("div", "timeline-step");
      item.append(makeElement("span", "timeline-step__index", `0${index + 1}`));
      item.append(makeElement("strong", "", phase.title));
      item.append(makeElement("small", "", "Not scheduled"));
      return item;
    }),
  );
  renderChallengeCenter(state, "control");
}

function consequencePreview(challenge, decision, isSolarPowered) {
  const effects = decision.effects;
  const details = [];
  if (effects.durationHours > 0) {
    details.push(`Mission time +${effects.durationHours} h`);
  }
  if (effects.batteryDeltaWh < 0) {
    details.push(`Additional battery draw ${Math.abs(effects.batteryDeltaWh)} Wh`);
  } else if (effects.batteryDeltaWh > 0) {
    details.push(`Battery gain ${effects.batteryDeltaWh} Wh`);
  }
  if (effects.environmentalPowerFactor !== undefined) {
    details.push(isSolarPowered
      ? `Solar availability set to ${Math.round(effects.environmentalPowerFactor * 100)}%`
      : "Solar availability adjustment does not apply to radioisotope power");
  }
  if (effects.budgetCostCredits > 0) {
    details.push(`Budget −${effects.budgetCostCredits} cr`);
  } else if (challenge.category === "equipment") {
    details.push("Equipment condition restored after recovery");
  }
  return details.join(" · ");
}

function renderChallengeCenter(state, prefix) {
  const execution = state.missionExecution;
  const activeContainer = document.querySelector(`#${prefix}-active-challenges`);
  const historyContainer = document.querySelector(`#${prefix}-challenge-history`);
  const status = document.querySelector(`#${prefix}-challenge-status`);
  if (!execution) {
    activeContainer.replaceChildren(makeElement("p", "inline-status", "Mission execution is not initialized."));
    historyContainer.replaceChildren();
    status.textContent = "";
    return;
  }

  const active = execution.challengeHistory.filter(({ status: challengeStatus }) =>
    challengeStatus === "ACTIVE");
  activeContainer.replaceChildren(
    ...(active.length
      ? active.map((challenge) => {
        const card = makeElement("article", "challenge-runtime-card");
        card.dataset.severity = challenge.severity.toLowerCase();
        const heading = makeElement("div", "challenge-runtime-card__heading");
        heading.append(makeElement("span", "eyebrow", `${challenge.category.toUpperCase()} · ${challenge.severity}`));
        heading.append(makeElement("strong", "", challenge.title));
        card.append(heading);
        card.append(makeElement("p", "", challenge.description));
        const location = getMissionWaypoint(challenge.locationId);
        card.append(makeElement(
          "small",
          "challenge-runtime-card__context",
          `${location?.name ?? "Mission area"} · triggered at ${challenge.triggeredAt}`,
        ));
        const decisions = makeElement("div", "challenge-runtime-decisions");
        challenge.decisions.forEach((decision) => {
          const option = makeElement("div", "challenge-runtime-decision");
          option.append(makeElement("strong", "", decision.title));
          option.append(makeElement("small", "", decision.detail));
          option.append(makeElement(
            "small",
            "challenge-runtime-decision__preview",
            consequencePreview(challenge, decision, state.resources?.power.isSolar ?? false),
          ));
          const button = makeElement(
            "button",
            "button button--secondary",
            challenge.category === "equipment" ? "Recover equipment" : "Apply decision",
          );
          button.type = "button";
          button.dataset.challengeId = challenge.challengeId;
          button.dataset.challengeDecision = decision.id;
          button.disabled = execution.status !== "ACTIVE";
          option.append(button);
          decisions.append(option);
        });
        card.append(decisions);
        return card;
      })
      : [makeElement("p", "inline-status", "No active challenges. Deterministic time, location, and resource triggers are being monitored.")]),
  );
  status.textContent = executionActionError
    || `${active.length} active · ${execution.challengeEvaluation.challengesResolved} resolved`;
  status.dataset.status = executionActionError ? "critical" : active.length ? "warning" : "normal";

  const condition = execution.operationalCondition;
  const equipment = [
    ["Wheels", condition.wheels],
    ["Communications", condition.communications],
    ...Object.entries(condition.instruments).map(([instrumentId, instrumentStatus]) => [
      findRoverOption("instruments", instrumentId)?.name ?? instrumentId,
      instrumentStatus,
    ]),
    ["Power generation", `${Math.round(condition.powerGenerationFactor * 100)}% output`],
    ["Operating mode", condition.operatingMode],
  ];
  document.querySelector(`#${prefix}-equipment-condition`).replaceChildren(
    ...equipment.map(([label, value]) => {
      const item = makeElement("div", "equipment-condition");
      item.append(makeElement("span", "", label));
      item.append(makeElement("strong", "", String(value).toUpperCase()));
      return item;
    }),
  );

  const evaluation = execution.challengeEvaluation;
  document.querySelector(`#${prefix}-challenge-performance`).replaceChildren(
    ...[
      ["Performance", `${evaluation.performanceScore} / 100`],
      ["Encountered / resolved", `${evaluation.challengesEncountered} / ${evaluation.challengesResolved}`],
      ["Equipment failures / recoveries", `${evaluation.equipmentFailures} / ${evaluation.successfulRecoveries}`],
      ["Challenge resource cost", `${evaluation.resourceCosts.timeHours.toFixed(1)} h · ${evaluation.resourceCosts.batteryWh.toFixed(0)} Wh · ${evaluation.resourceCosts.budgetCredits.toFixed(0)} cr`],
    ].map(([label, value]) => {
      const item = makeElement("div", "challenge-performance__item");
      item.append(makeElement("span", "", label));
      item.append(makeElement("strong", "", value));
      return item;
    }),
  );
  historyContainer.replaceChildren(
    ...(execution.challengeHistory.length
      ? [...execution.challengeHistory].reverse().map((challenge) => {
        const item = makeElement("article", "challenge-history-entry");
        item.dataset.status = challenge.status.toLowerCase();
        item.append(makeElement("strong", "", challenge.title));
        item.append(makeElement(
          "span",
          "",
          challenge.status === "RESOLVED"
            ? `Resolved: ${challenge.resolution.title}`
            : `${challenge.severity} · awaiting decision`,
        ));
        item.append(makeElement("small", "", challenge.resolvedAt ?? challenge.triggeredAt));
        return item;
      })
      : [makeElement("p", "inline-status", "No challenges encountered yet.")]),
  );
}

function renderScientist(state) {
  document.querySelector("#scientist-name").textContent = SCIENTIST_PROFILE.name;
  document.querySelector("#scientist-role").textContent = SCIENTIST_PROFILE.role;
  document.querySelector("#scientist-affiliation").textContent = SCIENTIST_PROFILE.affiliation;
  const dialogue = getCurrentScientistDialogue();
  const history = getScientistDialogueHistory();
  const category = document.querySelector("#dialogue-category");
  const speaker = document.querySelector("#dialogue-speaker");
  const title = document.querySelector("#dialogue-title");
  const text = document.querySelector("#dialogue-text");
  const context = document.querySelector("#dialogue-context");
  const continueButton = document.querySelector("#scientist-continue");
  const status = document.querySelector("#scientist-action-status");
  if (dialogue) {
    category.textContent = dialogue.category.replaceAll("_", " ");
    speaker.textContent = dialogue.speaker.toUpperCase();
    title.textContent = `${dialogue.missionStage.replaceAll("-", " ")} · ${history.length + 1}`;
    text.textContent = dialogue.text;
    context.textContent = dialogue.contextLabel;
    continueButton.disabled = false;
    continueButton.dataset.dialogueId = dialogue.dialogueId;
    status.textContent = "New mission-context message";
  } else {
    category.textContent = "NO NEW MESSAGE";
    speaker.textContent = SCIENTIST_PROFILE.name.toUpperCase();
    title.textContent = "Science channel standing by";
    text.textContent = SCIENTIST_CHANNEL_EMPTY_MESSAGE;
    context.textContent = state.currentMissionId
      ? MISSION_CATALOG.find(({ id }) => id === state.currentMissionId)?.title ?? "Mission science channel"
      : "No mission accepted";
    continueButton.disabled = true;
    delete continueButton.dataset.dialogueId;
    status.textContent = "Dialogue appears when mission facts satisfy configured triggers.";
  }
  const historyContainer = document.querySelector("#dialogue-history");
  historyContainer.replaceChildren(
    ...(history.length
      ? [...history].reverse().map((entry) => {
        const item = makeElement("article", "dialogue-history-entry");
        item.append(makeElement("strong", "", entry.category.replaceAll("_", " ")));
        item.append(makeElement("span", "", entry.contextLabel));
        item.append(makeElement("p", "", entry.text));
        return item;
      })
      : [makeElement("p", "inline-status", "Viewed dialogue will be recorded here.")]),
  );
}

function renderResults(state) {
  const report = state.missionEvaluation;
  const status = document.querySelector("#results-status");
  const categoryContainer = document.querySelector("#results-category-scores");
  const objectivesContainer = document.querySelector("#results-objectives");
  const resourcesContainer = document.querySelector("#results-resources");
  const operationsContainer = document.querySelector("#results-operations");
  const roverContainer = document.querySelector("#results-rover-condition");
  const recommendationContainer = document.querySelector("#results-recommendations");
  const successContainer = document.querySelector("#results-successes");
  const failureContainer = document.querySelector("#results-failures");
  if (!report) {
    status.textContent = "REPORT UNAVAILABLE";
    document.querySelector("#results-mission-name").textContent =
      state.missionExecution?.missionName ?? "MISSION OUTCOME";
    document.querySelector("#results-score").textContent =
      "A final report is generated after mission termination";
    document.querySelector("#results-assessment-summary").textContent =
      "Active missions are not evaluated as final reports.";
    document.querySelector("#results-grade").textContent = "—";
    document.querySelector("#results-report-reference").textContent = "NOT EVALUATED";
    document.querySelector("#results-final-assessment").textContent = "";
    for (const container of [
      categoryContainer,
      objectivesContainer,
      resourcesContainer,
      operationsContainer,
      roverContainer,
      recommendationContainer,
      successContainer,
      failureContainer,
    ]) {
      container.replaceChildren();
    }
    return;
  }

  const statusLabel = report.missionStatus.toUpperCase();
  status.textContent = `MISSION ${statusLabel}`;
  status.dataset.status = report.missionStatus === "COMPLETED" ? "normal" : "warning";
  document.querySelector("#results-mission-name").textContent = report.missionName;
  document.querySelector("#results-score").textContent =
    `${report.finalScore} / 100 · Grade ${report.grade}`;
  document.querySelector("#results-assessment-summary").textContent =
    `${report.missionStatus} · ${report.missionDuration.elapsedHours.toFixed(1)} h elapsed`;
  document.querySelector("#results-grade").textContent = report.grade;
  document.querySelector("#results-report-reference").textContent =
    report.evaluationTimestamp ?? report.reportId;
  document.querySelector("#results-final-assessment").textContent =
    report.finalAssessment.text;

  categoryContainer.replaceChildren(
    ...Object.entries(report.categoryScores).map(([id, category]) => {
      const item = makeElement("article", "evaluation-category");
      item.dataset.category = id;
      const heading = makeElement("div", "evaluation-category__heading");
      heading.append(makeElement("strong", "", category.label));
      heading.append(makeElement("span", "", `${category.score} / ${category.maxScore}`));
      item.append(heading);
      const progress = makeElement("progress", "evaluation-category__progress");
      progress.max = category.maxScore;
      progress.value = category.score;
      progress.setAttribute("aria-label", `${category.label}: ${category.score} of ${category.maxScore}`);
      item.append(progress);
      item.append(makeElement("small", "", category.basis));
      return item;
    }),
  );
  const objectiveRows = [
    ...report.objectivesCompleted.map((objective) => ({ ...objective, status: "COMPLETED" })),
    ...report.objectivesIncomplete.map((objective) => ({ ...objective, status: objective.status.toUpperCase() })),
  ];
  objectivesContainer.replaceChildren(
    ...(objectiveRows.length
      ? objectiveRows.map((objective) => {
        const row = makeElement("div", "results-objective");
        row.append(makeElement("strong", "", objective.name));
        row.append(makeElement("small", "", objective.status));
        return row;
      })
      : [makeElement("p", "inline-status", "No selected mission objectives were recorded.")]),
  );

  const resourceRows = [
    ["Time consumed", `${report.resourcesConsumed.timeHours.toFixed(1)} h`],
    ["Time remaining", `${report.resourcesRemaining.timeHours.toFixed(1)} h`],
    ["Energy consumed", `${report.resourcesConsumed.energyWh.toFixed(0)} Wh`],
    ["Battery remaining", `${report.resourcesRemaining.batteryWh.toFixed(0)} / ${report.resourcesRemaining.batteryCapacityWh.toFixed(0)} Wh (${Math.round(report.resourcesRemaining.batteryFraction * 100)}%)`],
    ["Budget spent", `${report.resourcesConsumed.budgetCredits.toFixed(0)} credits`],
    ["Budget remaining", `${report.resourcesRemaining.budgetCredits.toFixed(0)} credits`],
    ["Data generated / transmitted", `${report.resourcesConsumed.dataGeneratedMB.toFixed(1)} / ${report.resourcesConsumed.dataTransmittedMB.toFixed(1)} MB`],
    ["Data still stored", `${report.resourcesRemaining.dataStoredMB.toFixed(1)} MB`],
    ["Mission duration", `${report.missionDuration.elapsedSols.toFixed(2)} / ${report.missionDuration.plannedHours.toFixed(1)} h planned`],
    ["Observations / samples", `${report.scientificObservations.length} / ${report.samplesCollected.length}`],
  ];
  resourcesContainer.replaceChildren(...resourceRows.map(([label, value]) => {
    const row = makeElement("div");
    row.append(makeElement("span", "", label));
    row.append(makeElement("strong", "", value));
    return row;
  }));

  const operationRows = [
    ["Challenges encountered / resolved", `${report.challengesEncountered.length} / ${report.challengesResolved.length}`],
    ["Equipment failures / recoveries", `${report.equipmentFailures.length} / ${report.equipmentRecoveries.length}`],
    ["Challenge performance", report.challengePerformance
      ? `${report.challengePerformance.performanceScore} / 100`
      : "No challenge evaluation recorded"],
    ["Waypoints explored", `${report.explorationProgress.waypointsReached.length} / ${report.explorationProgress.totalWaypoints}`],
    ["Locations for completion", `${report.explorationProgress.waypointsReached.length} / ${report.explorationProgress.requiredWaypoints} required`],
    ["Locations", report.explorationProgress.waypointsReached.map(({ name }) => name).join(", ") || "None recorded"],
  ];
  operationsContainer.replaceChildren(...operationRows.map(([label, value]) => {
    const row = makeElement("div");
    row.append(makeElement("span", "", label));
    row.append(makeElement("strong", "", String(value)));
    return row;
  }));

  const condition = report.roverCondition;
  const roverRows = condition
    ? [
      ["Wheels", condition.wheels],
      ["Communications", condition.communications],
      ...Object.entries(condition.instruments ?? {}),
      ["Power generation", `${Math.round(condition.powerGenerationFactor * 100)}%`],
      ["Operating mode", condition.operatingMode],
    ]
    : [];
  roverContainer.replaceChildren(
    ...(roverRows.length
      ? roverRows.map(([name, value]) => {
        const row = makeElement("div");
        row.append(makeElement("span", "", name));
        row.append(makeElement("strong", "", String(value).toUpperCase()));
        return row;
      })
      : [makeElement("p", "inline-status", "No rover-condition record is available.")]),
  );

  successContainer.replaceChildren(
    ...(report.finalAssessment.majorSuccesses.length
      ? report.finalAssessment.majorSuccesses.map((success) => {
        const row = makeElement("div");
        row.append(makeElement("span", "", success));
        return row;
      })
      : [makeElement("p", "inline-status", "No category met the major-success threshold.")]),
  );
  failureContainer.replaceChildren(
    ...(report.finalAssessment.majorFailures.length
      ? report.finalAssessment.majorFailures.map((failure) => {
        const row = makeElement("div");
        row.append(makeElement("span", "", failure));
        return row;
      })
      : [makeElement("p", "inline-status", "No major failure was recorded.")]),
  );
  recommendationContainer.replaceChildren(
    ...(report.recommendations.length
      ? report.recommendations.map((recommendation) => {
        const item = makeElement("article", "evaluation-recommendation");
        item.dataset.priority = recommendation.priority;
        item.append(makeElement("strong", "", recommendation.title));
        item.append(makeElement("p", "", recommendation.detail));
        return item;
      })
      : [makeElement("p", "inline-status", "No recommendations were generated.")]),
  );
}

function renderUtilityScreens() {
  document.querySelector("#how-to-steps").replaceChildren(
    ...HOW_TO_STEPS.map((step, index) => {
      const item = makeElement("li", "guide-step");
      item.append(makeElement("span", "guide-step__number", String(index + 1).padStart(2, "0")));
      item.append(makeElement("p", "", step));
      return item;
    }),
  );
}

function renderStageNavigation(screen) {
  const activeIndex = STAGE_SCREENS.indexOf(screen);
  document.querySelectorAll("[data-stage]").forEach((item) => {
    const stageIndex = STAGE_SCREENS.indexOf(item.dataset.stage);
    item.classList.toggle("stage-nav__item--active", item.dataset.stage === screen);
    item.classList.toggle("stage-nav__item--complete", activeIndex > stageIndex && stageIndex >= 0);
    if (item.dataset.stage === screen) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

function render(state) {
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== state.screen;
  });
  document.querySelector("#page-title").textContent = SCREEN_TITLES[state.screen];
  document.querySelector("#reduce-motion").checked = state.preferences.reduceMotion;
  document.querySelector("#app-shell").classList.toggle("app-shell--reduced-motion", state.preferences.reduceMotion);
  renderStageNavigation(state.screen);
  const scientistLink = document.querySelector("#scientist-channel-link");
  const unreadDialogues = state.scientistDialogue?.unlocked.filter(
    ({ displayStatus }) => displayStatus === "AVAILABLE",
  ).length ?? 0;
  scientistLink.hidden = !state.currentMissionId
    || ["briefing", "scientist", "results"].includes(state.screen);
  document.querySelector("#scientist-unread-count").textContent =
    `${unreadDialogues} NEW`;

  if (state.screen === "briefing") renderBriefing(state);
  if (state.screen === "roles") renderRoleSlots(state);
  if (state.screen === "planning") renderPlanning(state);
  if (state.screen === "rover") renderRover(state);
  if (state.screen === "control") renderControl(state);
  if (state.screen === "challenge") renderChallengeCenter(state, "field");
  if (state.screen === "scientist") renderScientist(state);
  if (state.screen === "results") renderResults(state);

  if (state.loadingComplete && !loadingExitStarted) {
    loadingExitStarted = true;
    const loadingScreen = document.querySelector("#loading-screen");
    document.querySelector("#app-shell").hidden = false;
    loadingScreen.classList.add("is-exiting");
    window.setTimeout(() => {
      loadingScreen.hidden = true;
      document.querySelector("#main-content").focus({ preventScroll: true });
    }, state.preferences.reduceMotion ? 0 : 320);
  } else if (lastRenderedScreen !== null && lastRenderedScreen !== state.screen) {
    document.querySelector("#main-content").focus({ preventScroll: true });
  }

  lastRenderedScreen = state.screen;
}

function handleClick(event) {
  const target = event.target instanceof Element ? event.target.closest("button, a") : null;
  if (!target) {
    return;
  }
  if (target instanceof HTMLAnchorElement) {
    event.preventDefault();
  }

  if (target.dataset.challengeId) {
    try {
      executionActionError = "";
      resolveChallenge(target.dataset.challengeId, target.dataset.challengeDecision);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      executionActionError = error.message;
      for (const prefix of ["control", "field"]) {
        const status = document.querySelector(`#${prefix}-challenge-status`);
        if (status) {
          status.textContent = error.message;
          status.dataset.status = "critical";
        }
      }
    }
    return;
  }

  if (target.dataset.action === "scientist-continue") {
    try {
      advanceScientistDialogue(target.dataset.dialogueId);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      document.querySelector("#scientist-action-status").textContent = error.message;
    }
    return;
  }

  if (target.dataset.resourceAction) {
    try {
      resourceActionError = "";
      if (target.dataset.resourceAction === "instrument") {
        operateInstrument(
          target.dataset.instrumentId,
          target.dataset.objectiveId,
          target.dataset.capabilityId,
        );
      } else if (target.dataset.resourceAction === "transmit") {
        transmitMissionDataToControl();
      } else if (target.dataset.resourceAction === "idle") {
        advanceMissionIdleTime(1);
      } else if (target.dataset.resourceAction === "maintenance") {
        recordMaintenance();
      } else if (target.dataset.resourceAction === "emergency-delay") {
        recordEmergencyDelay(1);
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      resourceActionError = error.message;
      const status = document.querySelector("#resource-operation-status");
      status.textContent = error.message;
      status.dataset.status = "critical";
    }
    return;
  }

  if (target.dataset.executionAction) {
    try {
      executionActionError = "";
      if (target.dataset.executionAction === "pause") {
        pauseMission();
      } else if (target.dataset.executionAction === "resume") {
        resumeMission();
      } else if (target.dataset.executionAction === "abort") {
        abortMission("Mission aborted by the mission team.");
      } else if (target.dataset.executionAction === "complete") {
        completeMission();
      } else if (target.dataset.executionAction === "move") {
        moveRoverToDestination();
      }
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      executionActionError = error.message;
      const status = document.querySelector("#execution-action-status");
      status.textContent = error.message;
      status.dataset.status = "critical";
    }
    return;
  }

  if (target.dataset.waypointId) {
    try {
      selectMissionDestination(target.dataset.waypointId);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      executionActionError = error.message;
      document.querySelector("#execution-action-status").textContent = error.message;
    }
  } else if (target.dataset.sampleType) {
    try {
      resourceActionError = "";
      collectSample(target.dataset.sampleType);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      resourceActionError = error.message;
      const status = document.querySelector("#resource-operation-status");
      status.textContent = error.message;
      status.dataset.status = "critical";
    }
  } else if (target.dataset.action === "skip-loading") {
    skipLoadingSequence();
  } else if (target.dataset.action === "accept-mission") {
    acceptMission();
  } else if (target.dataset.action === "back") {
    goBack();
  } else if (target.dataset.action === "return-menu") {
    returnToMenu();
  } else if (target.dataset.action === "restart") {
    resetMission();
  } else if (target.dataset.action === "build-recommended-rover") {
    try {
      const recommendation = buildRecommendedRover(getState());
      if (!recommendation.isValid) renderRover(getState());
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      roverRecommendation = {
        isValid: false,
        reason: error.message,
        explanations: [],
      };
      renderRover(getState());
    }
  } else if (target.dataset.action === "reset-rover") {
    roverRecommendation = null;
    roverRecommendationContext = null;
    resetRoverConfiguration();
  } else if (target.dataset.missionId) {
    selectMission(target.dataset.missionId);
  } else if (target.dataset.playerSlot) {
    selectPlayerSlot(target.dataset.playerSlot);
  } else if (target.dataset.roleId) {
    assignRole(target.dataset.roleId);
  } else if (target.dataset.siteId) {
    selectLandingSite(target.dataset.siteId);
    document.querySelector(`[data-site-id="${target.dataset.siteId}"]`)?.focus();
  } else if (target.dataset.strategyId) {
    selectMissionStrategy(target.dataset.strategyId);
    document.querySelector(`[data-strategy-id="${target.dataset.strategyId}"]`)?.focus();
  } else if (target.dataset.roverCategory && target.dataset.roverOption) {
    roverRecommendation = null;
    roverRecommendationContext = null;
    selectRoverOption(target.dataset.roverCategory, target.dataset.roverOption);
  } else if (target.dataset.route) {
    navigateTo(target.dataset.route);
  }
}

function handleChange(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.preference === "reduceMotion") {
    setPreference("reduceMotion", target.checked);
  } else if (target instanceof HTMLInputElement && target.dataset.objectiveId) {
    const objectiveId = target.dataset.objectiveId;
    toggleMissionObjective(objectiveId);
    document.querySelector(`[data-objective-id="${objectiveId}"]`)?.focus();
  } else if (target instanceof HTMLInputElement && target.id === "planning-name") {
    updateMissionPlanField("missionName", target.value);
  } else if (target instanceof HTMLInputElement && target.id === "planning-duration-input") {
    updateMissionPlanField("durationSols", target.value);
  } else if (target instanceof HTMLSelectElement && target.id === "planning-profile") {
    selectPlanningMissionProfile(target.value);
    document.querySelector("#planning-profile")?.focus();
  } else if (target instanceof HTMLSelectElement && target.dataset.objectivePriority) {
    const objectiveId = target.dataset.objectivePriority;
    setMissionObjectivePriority(objectiveId, Number(target.value));
    document.querySelector(`[data-objective-priority="${objectiveId}"]`)?.focus();
  } else if (target instanceof HTMLSelectElement && target.id === "power-environment") {
    selectPowerEnvironment(target.value);
  } else if (target instanceof HTMLSelectElement && target.id === "surface-destination" && target.value) {
    selectMissionDestination(target.value);
  }
}

function handleKeydown(event) {
  if (event.key === "Escape" && getState().screen !== "home") {
    goBack();
  }
}

export function initializeUI({ onSkipLoading = completeLoading } = {}) {
  skipLoadingSequence = onSkipLoading;
  renderMissionCards();
  renderScienceObjectives();
  renderUtilityScreens();
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeydown);
  const unsubscribe = subscribe(render);
  render(getState());
  return () => {
    unsubscribe();
    document.removeEventListener("click", handleClick);
    document.removeEventListener("change", handleChange);
    document.removeEventListener("keydown", handleKeydown);
  };
}
