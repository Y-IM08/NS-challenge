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
  selectChallengeDecision,
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
  CHALLENGE_PRESENTATION,
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
} from "./data.js";
import {
  calculateRoverMetrics,
  getScientificCapabilities,
  validateRoverConfiguration,
} from "./rover.js";
import {
  getResourceSummary,
} from "./resources.js";
import { validatePlanningInputs } from "./planning.js";

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
  const metrics = calculateRoverMetrics(state.rover, {
    selectedLandingSiteId: state.selectedLandingSiteId,
  });
  const validation = validateRoverConfiguration(state.rover, ENGINEERING_LIMITS, {
    selectedLandingSiteId: state.selectedLandingSiteId,
    objectiveIds,
  });
  const missionValidation = state.missionPlan?.validation;
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
        options.append(button);
      });
      section.append(options);
      return section;
    }),
  );
}

function renderControl(state) {
  if (!state.resources) {
    throw new Error("Mission control requires initialized mission resources.");
  }
  const site = LANDING_SITES.find(({ id }) => id === state.selectedLandingSiteId);
  document.querySelector("#control-site-name").textContent = site?.name.toUpperCase() ?? "SITE PREVIEW";
  document.querySelector("#control-site-coordinates").textContent = site?.coordinates ?? "COORDINATES UNAVAILABLE";
  document.querySelector("#control-site-terrain").textContent =
    `${site?.terrain ?? "No site selected"}. Map is illustrative and does not represent actual surface topography.`;

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
    `Standby ${loadBreakdown.standbyPowerW.toFixed(1)} W · Rover ${loadBreakdown.roverOperatingPowerW.toFixed(1)} W · Instrument ${loadBreakdown.instrumentPowerW.toFixed(1)} W · Communications ${loadBreakdown.communicationPowerW.toFixed(1)} W · Maintenance ${loadBreakdown.maintenancePowerW.toFixed(1)} W`;
  document.querySelector("#resource-battery-caption").textContent =
    `${resources.power.energyConsumedWh.toFixed(1)} Wh cumulative energy demand`;
  document.querySelector("#resource-budget-total").textContent =
    formatCredits(resources.budget.initialBudgetCredits);
  document.querySelector("#resource-budget-spent").textContent =
    formatCredits(resources.budget.spentCredits);
  document.querySelector("#resource-budget-remaining").textContent =
    formatCredits(resources.budget.remainingCredits);
  document.querySelector("#resource-budget-breakdown").textContent =
    `Construction ${formatCredits(resources.budget.constructionCredits)} · Launch ${formatCredits(resources.budget.launchCredits)} · Operations ${formatCredits(resources.budget.operationsCredits)} · Communications ${formatCredits(resources.budget.communicationCredits)} · Maintenance ${formatCredits(resources.budget.maintenanceCredits)}`;
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
    `Start ${new Date(state.resources.missionStartTime).toISOString()} · Instrument ${formatHours(resources.time.instrumentOperationHours)} · Communication ${formatHours(resources.time.communicationHours)} · Idle ${formatHours(resources.time.idleHours)} · Emergency delay ${formatHours(resources.time.emergencyDelayHours)} · Maintenance ${formatHours(resources.time.maintenanceHours)}`;
  document.querySelector("#resource-rover-mass").textContent =
    `${resources.mass.totalDeployedMassKg.toFixed(1)} kg`;
  document.querySelector("#resource-instrument-mass").textContent =
    `${resources.mass.installedInstrumentMassKg.toFixed(1)} kg`;
  document.querySelector("#resource-payload-mass").textContent =
    `${resources.mass.payloadMassKg.toFixed(1)} kg`;
  document.querySelector("#resource-payload-remaining").textContent =
    `${resources.mass.remainingPayloadCapacityKg.toFixed(1)} kg of ${resources.mass.payloadCapacityKg.toFixed(1)} kg`;

  const environmentSelect = document.querySelector("#power-environment");
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
      ? instrumentOptions.map((instrument) => {
        const button = makeElement(
          "button",
          "button button--secondary resource-instrument-button",
          `Operate ${instrument.name} · 1 h`,
        );
        button.type = "button";
        button.dataset.resourceAction = "instrument";
        button.dataset.instrumentId = instrument.id;
        return button;
      })
      : [makeElement("p", "inline-status", "No instruments are installed.")]),
  );
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
    ...SCIENCE_OBJECTIVES.map((objective) => {
      const item = makeElement("div", "objective-status");
      const top = makeElement("div", "objective-status__top");
      top.append(makeElement("strong", "", objective.name));
      top.append(makeElement("span", "", "NOT STARTED"));
      item.append(top);
      item.append(makeElement("div", "objective-status__track", ""));
      return item;
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
}

function renderChallenge(state) {
  document.querySelector("#challenge-code").textContent = CHALLENGE_PRESENTATION.id;
  document.querySelector("#challenge-severity").textContent = CHALLENGE_PRESENTATION.severity;
  document.querySelector("#challenge-title").textContent = CHALLENGE_PRESENTATION.title;
  document.querySelector("#challenge-description").textContent = CHALLENGE_PRESENTATION.description;
  document.querySelector("#consequence-notice").textContent = CHALLENGE_PRESENTATION.consequenceNotice;
  const selected = CHALLENGE_PRESENTATION.decisions.find(
    ({ id }) => id === state.selectedChallengeDecisionId,
  );
  document.querySelector("#consequence-copy").textContent = selected
    ? `Discussion prompt selected: ${selected.title}. The mission state is unchanged.`
    : "Select a response to record it as a discussion prompt.";
  document.querySelector("#challenge-decisions").replaceChildren(
    ...CHALLENGE_PRESENTATION.decisions.map((decision) => {
      const isSelected = state.selectedChallengeDecisionId === decision.id;
      const button = makeElement("button", `decision-card${isSelected ? " decision-card--selected" : ""}`);
      button.type = "button";
      button.dataset.decisionId = decision.id;
      button.setAttribute("aria-pressed", String(isSelected));
      button.append(makeElement("span", "decision-card__index", isSelected ? "SELECTED" : "RESPONSE OPTION"));
      button.append(makeElement("strong", "", decision.title));
      button.append(makeElement("small", "", decision.detail));
      return button;
    }),
  );
}

function renderScientist() {
  document.querySelector("#scientist-name").textContent = SCIENTIST_PROFILE.name;
  document.querySelector("#scientist-role").textContent = SCIENTIST_PROFILE.role;
  document.querySelector("#scientist-affiliation").textContent = SCIENTIST_PROFILE.affiliation;
}

function renderResults(state) {
  const metrics = calculateRoverMetrics(state.rover, {
    selectedLandingSiteId: state.selectedLandingSiteId,
  });
  document.querySelector("#results-objectives").replaceChildren(
    ...SCIENCE_OBJECTIVES.map((objective) => {
      const row = makeElement("div", "results-objective");
      row.append(makeElement("span", "results-objective__number", objective.number));
      row.append(makeElement("strong", "", objective.name));
      row.append(makeElement("small", "", "Not assessed"));
      return row;
    }),
  );

  const rover = ROVER_CATEGORIES.flatMap((category) => {
    const selectedIds = category.id === "instruments"
      ? state.rover.instruments
      : state.rover[category.id] ? [state.rover[category.id]] : [];
    if (selectedIds.length === 0) {
      return [{ title: category.title, option: "No concept selected" }];
    }
    return selectedIds.map((id) => ({
      title: category.title,
      option: findRoverOption(category.id, id)?.name ?? "Unknown component",
    }));
  });
  const engineering = document.querySelector("#engineering-summary");
  engineering.replaceChildren(
    ...[
      { title: "Total rover mass", option: `${metrics.totalMassKg.toFixed(1)} kg` },
      { title: "Construction cost", option: `${metrics.totalCostCredits.toLocaleString()} credits` },
      { title: "Power generation / demand", option: `${metrics.powerGenerationW.toFixed(1)} / ${metrics.powerConsumptionW.toFixed(1)} W` },
      { title: "Power margin", option: `${metrics.powerMarginW.toFixed(1)} W` },
      { title: "Payload remaining", option: metrics.payloadRemainingKg === null ? "No chassis selected" : `${metrics.payloadRemainingKg.toFixed(1)} kg` },
      { title: "Average component reliability index", option: metrics.reliability === null ? "No components" : `${(metrics.reliability * 100).toFixed(1)}%` },
    ].map(({ title, option }) => {
      const item = makeElement("div", "engineering-summary__metric");
      item.append(makeElement("span", "", title));
      item.append(makeElement("strong", "", option));
      return item;
    }),
    ...rover.map(({ title, option }) => {
      const item = makeElement("div");
      item.append(makeElement("span", "", title));
      item.append(makeElement("strong", "", option));
      return item;
    }),
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

  if (state.screen === "briefing") renderBriefing(state);
  if (state.screen === "roles") renderRoleSlots(state);
  if (state.screen === "planning") renderPlanning(state);
  if (state.screen === "rover") renderRover(state);
  if (state.screen === "control") renderControl(state);
  if (state.screen === "challenge") renderChallenge(state);
  if (state.screen === "scientist") renderScientist();
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

  if (target.dataset.resourceAction) {
    try {
      resourceActionError = "";
      if (target.dataset.resourceAction === "instrument") {
        operateInstrument(target.dataset.instrumentId);
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

  if (target.dataset.action === "skip-loading") {
    skipLoadingSequence();
  } else if (target.dataset.action === "accept-mission") {
    acceptMission();
  } else if (target.dataset.action === "back") {
    goBack();
  } else if (target.dataset.action === "return-menu") {
    returnToMenu();
  } else if (target.dataset.action === "restart") {
    resetMission();
  } else if (target.dataset.action === "reset-rover") {
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
    selectRoverOption(target.dataset.roverCategory, target.dataset.roverOption);
  } else if (target.dataset.decisionId) {
    selectChallengeDecision(target.dataset.decisionId);
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
