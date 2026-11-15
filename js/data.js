export const MISSION_CATALOG = Object.freeze([
  Object.freeze({
    id: "MARS-01",
    title: "First Light",
    region: "Jezero Crater",
    duration: "12 sols",
    risk: "Moderate",
    difficulty: "LEVEL 01 · SURVEY",
    objective: "Locate water-bearing minerals",
    summary: "Survey the ancient river delta for hydrated minerals and identify a viable site for the first surface science outpost.",
    priorities: Object.freeze([
      "Map the delta terrain and identify safe rover routes.",
      "Collect and analyze samples from high-priority mineral deposits.",
      "Transmit a recommended outpost location to mission control.",
    ]),
  }),
  Object.freeze({
    id: "MARS-02",
    title: "Horizon Scan",
    region: "Elysium Planitia",
    duration: "16 sols",
    risk: "Elevated",
    difficulty: "LEVEL 02 · GEOLOGY",
    objective: "Characterize subsurface ice",
    summary: "Investigate accessible ice deposits and assess their potential to support a future crewed settlement.",
    priorities: Object.freeze([
      "Survey candidate ice deposits from stable terrain.",
      "Record environmental and geological observations.",
      "Rank candidate sites for a future resource assessment.",
    ]),
  }),
  Object.freeze({
    id: "MARS-03",
    title: "Habitat Zero",
    region: "Arcadia Planitia",
    duration: "20 sols",
    risk: "High",
    difficulty: "LEVEL 03 · SETTLEMENT",
    objective: "Assess a settlement site",
    summary: "Evaluate terrain, environmental exposure, and resource access for a long-duration human presence on Mars.",
    priorities: Object.freeze([
      "Identify a level, defensible habitat placement zone.",
      "Assess local conditions and nearby resource prospects.",
      "Prepare a preliminary site recommendation for the crew.",
    ]),
  }),
]);

export const MISSION_PHASES = Object.freeze([
  Object.freeze({ id: "survey", title: "Surface survey", description: "Assess terrain and hazards." }),
  Object.freeze({ id: "rover", title: "Rover deployment", description: "Configure mobility and instruments." }),
  Object.freeze({ id: "science", title: "Science operations", description: "Investigate the mission objective." }),
  Object.freeze({ id: "resources", title: "Resource assessment", description: "Track supplies and discoveries." }),
  Object.freeze({ id: "report", title: "Mission evaluation", description: "Review findings and outcomes." }),
]);

export const MISSION_CHALLENGES = Object.freeze([
  Object.freeze({ id: "terrain", title: "Terrain navigation", trigger: "During surface route planning", status: "locked" }),
  Object.freeze({ id: "energy", title: "Power management", trigger: "During rover operations", status: "locked" }),
  Object.freeze({ id: "science", title: "Scientific discovery", trigger: "When investigating a site", status: "locked" }),
  Object.freeze({ id: "communications", title: "Communications window", trigger: "During a transmission opportunity", status: "locked" }),
  Object.freeze({ id: "crew", title: "Settlement readiness", trigger: "At mission evaluation", status: "locked" }),
]);

export const SCIENTIST_PROFILE = Object.freeze({
  id: "dr-chen",
  name: "Dr. Chen",
  role: "Planetary Geologist",
  affiliation: "Mars Surface Science Team",
});

export const PLAYER_ROLES = Object.freeze([
  Object.freeze({
    id: "aerospace-engineer",
    name: "Aerospace Engineer",
    designation: "SYSTEMS · 01",
    responsibility: "Keep the vehicle and its critical systems fit for the surface.",
    decisions: Object.freeze(["Compare chassis and mobility trade-offs.", "Review rover mass and power needs.", "Coordinate engineering constraints."]),
    contribution: "Turns mission requirements into a buildable vehicle plan.",
    roverGuidance: "Review chassis payload, equipment slots, terrain capability, power margin, and mandatory limits.",
  }),
  Object.freeze({
    id: "satellite-controller",
    name: "Mars Satellite Controller",
    designation: "ORBITAL · 02",
    responsibility: "Plan the information relay between the rover and Earth.",
    decisions: Object.freeze(["Choose communication architecture.", "Consider relay windows and terrain.", "Prioritize data for transmission."]),
    contribution: "Connects surface operations with mission control.",
    roverGuidance: "Compare link capability and data capacity against the selected instrument data load.",
  }),
  Object.freeze({
    id: "finance-administrator",
    name: "Finance Administrator",
    designation: "RESOURCES · 03",
    responsibility: "Keep the mission plan within its declared resource limits.",
    decisions: Object.freeze(["Compare equipment cost tiers.", "Review mass and supply allocations.", "Flag trade-offs before the design is finalized."]),
    contribution: "Makes engineering ambition accountable to a finite budget.",
    roverGuidance: "Track component cost and remaining budget; optimization notes never change component values.",
  }),
  Object.freeze({
    id: "mission-designer",
    name: "Mission Designer",
    designation: "OPERATIONS · 04",
    responsibility: "Shape a coherent sequence of exploration and science goals.",
    decisions: Object.freeze(["Set exploration priorities.", "Choose a landing area.", "Connect field observations to settlement needs."]),
    contribution: "Keeps the crew focused on a useful, achievable objective.",
    roverGuidance: "Check objective coverage and remember that agricultural viability needs several independent lines of evidence.",
  }),
]);

export const PLAYER_SLOTS = Object.freeze(
  [1, 2, 3, 4].map((number) =>
    Object.freeze({ id: `player-${number}`, label: `PLAYER ${String(number).padStart(2, "0")}` }),
  ),
);

export const LANDING_SITES = Object.freeze([
  Object.freeze({
    id: "jezero",
    name: "Jezero Crater",
    coordinates: "18.4° N · 77.5° E",
    terrain: "Ancient delta · layered sediment",
    terrainTags: Object.freeze(["delta", "loose-regolith", "rocky"]),
    note: "A preserved river-delta setting for examining mineral deposits and past water activity.",
  }),
  Object.freeze({
    id: "elysium",
    name: "Elysium Planitia",
    coordinates: "3.0° N · 154.7° E",
    terrain: "Broad plain · subsurface ice prospects",
    terrainTags: Object.freeze(["plain", "dust", "ice-prospects"]),
    note: "A relatively level plain selected here for a conceptual survey of accessible ice indicators.",
  }),
  Object.freeze({
    id: "arcadia",
    name: "Arcadia Planitia",
    coordinates: "46.7° N · 192.0° E",
    terrain: "Northern plain · ice-rich terrain",
    terrainTags: Object.freeze(["plain", "dust", "ice-rich"]),
    note: "A northern setting for considering water access and long-duration settlement constraints.",
  }),
]);

export const ROVER_CATEGORIES = Object.freeze([
  Object.freeze({
    id: "chassis",
    title: "Chassis",
    description: "Vehicle frame, structural reliability, payload, and equipment envelope.",
    options: Object.freeze([
      Object.freeze({ id: "scout", name: "Scout frame", detail: "Compact · agile profile", massKg: 118, costCredits: 1150, payloadCapacityKg: 42, equipmentSlots: 8, instrumentSlots: 4, reliability: 0.91, operatingPowerW: 24 }),
      Object.freeze({ id: "expedition", name: "Expedition frame", detail: "Extended · modular profile", massKg: 154, costCredits: 1580, payloadCapacityKg: 62, equipmentSlots: 9, instrumentSlots: 5, reliability: 0.93, operatingPowerW: 29 }),
      Object.freeze({ id: "hauler", name: "Utility frame", detail: "Cargo-focused · reinforced profile", massKg: 192, costCredits: 1840, payloadCapacityKg: 84, equipmentSlots: 10, instrumentSlots: 5, reliability: 0.95, operatingPowerW: 34 }),
    ]),
  }),
  Object.freeze({
    id: "mobility",
    title: "Wheels & suspension",
    description: "Mass, mobility characteristics, terrain compatibility, and reliability.",
    options: Object.freeze([
      Object.freeze({ id: "standard", name: "Standard wheel system", detail: "General-purpose · lower complexity", massKg: 27, costCredits: 390, operatingPowerW: 18, mobilityCapability: 62, terrainCapabilities: Object.freeze(["plain", "loose-regolith"]), reliability: 0.91 }),
      Object.freeze({ id: "heavy-duty", name: "Heavy-duty wheel system", detail: "Robust contact · higher mass", massKg: 41, costCredits: 610, operatingPowerW: 26, mobilityCapability: 82, terrainCapabilities: Object.freeze(["plain", "loose-regolith", "rocky", "dust", "ice-rich"]), reliability: 0.93 }),
      Object.freeze({ id: "advanced-suspension", name: "Advanced suspension system", detail: "Adaptive articulation · highest complexity", massKg: 36, costCredits: 780, operatingPowerW: 31, mobilityCapability: 91, terrainCapabilities: Object.freeze(["plain", "loose-regolith", "rocky", "dust", "ice-rich", "delta", "ice-prospects"]), reliability: 0.89 }),
    ]),
  }),
  Object.freeze({
    id: "power",
    title: "Power source",
    description: "Illustrative nominal generation, mass, cost, reliability, and operating limits.",
    options: Object.freeze([
      Object.freeze({ id: "solar", name: "Solar power system", detail: "Sunlight-dependent · surface area required", massKg: 18, costCredits: 430, generationW: 165, operatingPowerW: 0, reliability: 0.88, limitation: "Illustrative output assumes a nominal sunlight condition. Dust, season, orientation, and shadow effects are not simulated." }),
      Object.freeze({ id: "advanced-solar", name: "Advanced solar system", detail: "Higher nominal output · sunlight-dependent", massKg: 26, costCredits: 720, generationW: 245, operatingPowerW: 0, reliability: 0.89, limitation: "Higher illustrative nominal output does not remove dependence on sunlight; dust, season, and shadow effects are not simulated." }),
      Object.freeze({ id: "radioisotope", name: "Radioisotope power system", detail: "Steady illustrative supply · high cost", massKg: 34, costCredits: 1180, generationW: 205, operatingPowerW: 0, reliability: 0.94, limitation: "Illustrative steady-output concept with high cost and mass. No isotope inventory, heat rejection, licensing, or actual flight design is modeled." }),
    ]),
  }),
  Object.freeze({
    id: "instruments",
    title: "Scientific instruments",
    description: "Install multiple payloads up to the chassis and mission instrument-slot limits.",
    options: Object.freeze([
      Object.freeze({ id: "panoramic-camera", name: "Panoramic camera", detail: "Surface context and route imaging", purpose: "Document surface context and terrain features for visual review.", massKg: 5, costCredits: 190, operatingPowerW: 8, supportedObjectives: Object.freeze([]), capabilities: Object.freeze(["surface-imaging", "terrain-context"]), reliability: 0.95, dataUnitsPerOperation: 8 }),
      Object.freeze({ id: "spectrometer", name: "Spectrometer", detail: "Mineral and material spectral observations", purpose: "Collect spectral observations that can support mineral-composition investigation.", massKg: 9, costCredits: 560, operatingPowerW: 17, supportedObjectives: Object.freeze(["minerals"]), capabilities: Object.freeze(["mineral-identification"]), reliability: 0.91, dataUnitsPerOperation: 12 }),
      Object.freeze({ id: "soil-analyzer", name: "Soil composition analyzer", detail: "Regolith chemistry and nutrient indicators", purpose: "Analyze selected regolith samples for compositional and nutrient-related indicators.", massKg: 11, costCredits: 640, operatingPowerW: 21, supportedObjectives: Object.freeze(["minerals", "regolith", "agriculture"]), capabilities: Object.freeze(["regolith-chemistry", "nutrient-indicators", "soil-characterization"]), reliability: 0.89, dataUnitsPerOperation: 10 }),
      Object.freeze({ id: "regolith-sampler", name: "Regolith sampling system", detail: "Surface and shallow sample acquisition", purpose: "Acquire regolith samples for further analysis; collection alone does not determine suitability.", massKg: 13, costCredits: 510, operatingPowerW: 16, supportedObjectives: Object.freeze(["regolith"]), capabilities: Object.freeze(["sample-acquisition", "soil-characterization"]), reliability: 0.9, dataUnitsPerOperation: 6 }),
      Object.freeze({ id: "weather-station", name: "Weather station", detail: "Atmospheric conditions and wind speed", purpose: "Record local atmospheric observations, including wind-speed measurements.", massKg: 7, costCredits: 360, operatingPowerW: 11, supportedObjectives: Object.freeze(["atmosphere", "agriculture"]), capabilities: Object.freeze(["atmospheric-conditions", "wind-speed", "environmental-conditions"]), reliability: 0.92, dataUnitsPerOperation: 5 }),
      Object.freeze({ id: "ground-penetrating-radar", name: "Ground-penetrating radar", detail: "Subsurface structure and potential water indicators", purpose: "Investigate subsurface structure and potential water-related indicators; does not confirm usable water.", massKg: 16, costCredits: 780, operatingPowerW: 28, supportedObjectives: Object.freeze(["agriculture"]), capabilities: Object.freeze(["subsurface-structure", "potential-water-indicators"]), reliability: 0.87, dataUnitsPerOperation: 14 }),
      Object.freeze({ id: "environmental-sensor", name: "Environmental sensor", detail: "Local environmental condition observations", purpose: "Record selected local environmental conditions for mission and settlement context.", massKg: 4, costCredits: 230, operatingPowerW: 6, supportedObjectives: Object.freeze(["agriculture", "atmosphere"]), capabilities: Object.freeze(["environmental-conditions"]), reliability: 0.94, dataUnitsPerOperation: 4 }),
    ]),
  }),
  Object.freeze({
    id: "communications",
    title: "Communication system",
    description: "Link capability, data capacity, power demand, and reliability.",
    options: Object.freeze([
      Object.freeze({ id: "basic", name: "Basic communication system", detail: "Low-capacity link · lower mass", massKg: 7, costCredits: 260, operatingPowerW: 9, communicationCapability: 1, dataCapacityUnitsPerSol: 16, reliability: 0.88 }),
      Object.freeze({ id: "advanced", name: "Advanced communication system", detail: "Balanced relay capability", massKg: 11, costCredits: 470, operatingPowerW: 15, communicationCapability: 2, dataCapacityUnitsPerSol: 48, reliability: 0.92 }),
      Object.freeze({ id: "high-gain", name: "High-gain antenna system", detail: "High-capacity link · greater mass and demand", massKg: 16, costCredits: 690, operatingPowerW: 23, communicationCapability: 3, dataCapacityUnitsPerSol: 96, reliability: 0.9 }),
    ]),
  }),
  Object.freeze({
    id: "landing",
    title: "Landing system",
    description: "Illustrative delivery mass, cost, and environmental protection.",
    options: Object.freeze([
      Object.freeze({ id: "basic", name: "Basic landing system", detail: "Baseline entry and delivery protection", massKg: 38, costCredits: 430, environmentalProtection: 60, reliability: 0.88 }),
      Object.freeze({ id: "precision", name: "Precision landing system", detail: "Enhanced targeting concept · higher cost", massKg: 46, costCredits: 690, environmentalProtection: 76, reliability: 0.91 }),
      Object.freeze({ id: "advanced-protection", name: "Advanced landing protection", detail: "Enhanced protection concept · highest mass", massKg: 54, costCredits: 820, environmentalProtection: 90, reliability: 0.93 }),
    ]),
  }),
]);

export const SCIENCE_CAPABILITY_REQUIREMENTS = Object.freeze([
  Object.freeze({
    objectiveId: "minerals",
    requiredCapabilities: Object.freeze([
      Object.freeze({ id: "mineral-identification", label: "Mineral identification", instrumentIds: Object.freeze(["spectrometer"]) }),
    ]),
  }),
  Object.freeze({
    objectiveId: "regolith",
    requiredCapabilities: Object.freeze([
      Object.freeze({ id: "soil-characterization", label: "Soil/regolith characterization", instrumentIds: Object.freeze(["soil-analyzer", "regolith-sampler"]) }),
    ]),
  }),
  Object.freeze({
    objectiveId: "agriculture",
    requiredCapabilities: Object.freeze([
      Object.freeze({ id: "regolith-chemistry", label: "Regolith chemistry indicators", instrumentIds: Object.freeze(["soil-analyzer"]) }),
      Object.freeze({ id: "nutrient-indicators", label: "Nutrient-related indicators", instrumentIds: Object.freeze(["soil-analyzer"]) }),
      Object.freeze({ id: "potential-water-indicators", label: "Potential subsurface water indicators", instrumentIds: Object.freeze(["ground-penetrating-radar"]) }),
      Object.freeze({ id: "environmental-conditions", label: "Environmental conditions", instrumentIds: Object.freeze(["weather-station", "environmental-sensor"]) }),
    ]),
  }),
  Object.freeze({
    objectiveId: "atmosphere",
    requiredCapabilities: Object.freeze([
      Object.freeze({ id: "atmospheric-conditions", label: "Atmospheric conditions", instrumentIds: Object.freeze(["weather-station"]) }),
      Object.freeze({ id: "wind-speed", label: "Wind-speed measurement", instrumentIds: Object.freeze(["weather-station"]) }),
    ]),
  }),
]);

export const ENGINEERING_LIMITS = Object.freeze({
  maxRoverMassKg: 300,
  maxConstructionBudgetCredits: 6000,
  maxPayloadKg: 65,
  maxInstrumentSlots: 5,
  maxPowerGenerationW: 260,
  minCommunicationCapability: 1,
  minDataCapacityUnitsPerSol: 12,
  minPowerMarginW: 0,
  lowPowerMarginRatio: 0.15,
});

export const POWER_ENVIRONMENTS = Object.freeze([
  Object.freeze({ id: "clear-day", label: "Clear daylight", daylightFraction: 0.78, dustAccumulation: 0.05, solarEfficiency: 0.88 }),
  Object.freeze({ id: "typical-day", label: "Typical daylight", daylightFraction: 0.58, dustAccumulation: 0.18, solarEfficiency: 0.82 }),
  Object.freeze({ id: "dusty-day", label: "Dust-reduced daylight", daylightFraction: 0.32, dustAccumulation: 0.48, solarEfficiency: 0.72 }),
  Object.freeze({ id: "night", label: "Night / no daylight", daylightFraction: 0, dustAccumulation: 0.18, solarEfficiency: 0.82 }),
]);

export const MISSION_RESOURCE_CONFIG = Object.freeze({
  hoursPerSol: 24,
  solDefinitionLabel: "24 h/sol gameplay simplification (a Martian sol is about 24 h 39 min)",
  missionStartTime: "2040-01-01T00:00:00.000Z",
  initialBudgetCredits: 15000,
  launchCostCredits: 1800,
  operationCostCreditsPerHour: 4,
  communicationCostCreditsPerHour: 2,
  maintenanceCostCredits: 180,
  maintenanceDurationHours: 2,
  maintenancePowerW: 12,
  batteryCapacityWh: 1800,
  initialBatteryFraction: 0.75,
  minimumBatteryFraction: 0.05,
  solarEfficiency: 0.82,
  initialEnvironmentId: "typical-day",
  standbyPowerW: 8,
  storageCapacityMB: 512,
  megabytesPerDataUnit: 1,
  defaultInstrumentOperationHours: 1,
  environmentProfiles: POWER_ENVIRONMENTS,
});

export const CHALLENGE_PRESENTATION = Object.freeze({
  title: "A dust front approaches",
  id: "FIELD SCENARIO · 01",
  severity: "ELEVATED",
  description: "Mission control reports a regional dust front moving toward the planned traverse area. Visibility and solar conditions may change.",
  decisions: Object.freeze([
    Object.freeze({ id: "pause", title: "Pause field operations", detail: "Wait for a clearer assessment before continuing." }),
    Object.freeze({ id: "shelter", title: "Review a sheltered route", detail: "Reassess the traverse using terrain protection." }),
    Object.freeze({ id: "observe", title: "Request updated observations", detail: "Ask for additional atmospheric context." }),
  ]),
  consequenceNotice: "This presentation is a design preview. Decisions do not alter mission state or simulate consequences.",
});

export const SCIENCE_OBJECTIVES = Object.freeze([
  Object.freeze({ id: "minerals", number: "01", name: "Mineral composition", detail: "Identify the minerals present in surface and subsurface samples." }),
  Object.freeze({ id: "regolith", number: "02", name: "Regolith properties", detail: "Describe soil texture, cohesion, and other properties relevant to mobility and construction." }),
  Object.freeze({ id: "agriculture", number: "03", name: "Agricultural viability", detail: "Assess what local materials and environmental limits mean for future food production." }),
  Object.freeze({ id: "atmosphere", number: "04", name: "Atmosphere & wind", detail: "Record atmospheric conditions and wind speed to inform surface operations and habitat design." }),
]);

export const MISSION_CONSTRAINTS = Object.freeze([
  Object.freeze({ label: "Mission duration", value: "Defined by selected mission profile" }),
  Object.freeze({ label: "Power, mass & budget", value: "Checked against configurable limits in rover design" }),
  Object.freeze({ label: "Communication", value: "Surface operations require a planned relay" }),
  Object.freeze({ label: "Scientific scope", value: "Prioritize observations relevant to settlement" }),
]);

export const HOW_TO_STEPS = Object.freeze([
  "Review the mission briefing and choose a profile.",
  "Assign the available mission roles to up to four local player slots.",
  "Select a landing-site concept and review the planning checklist.",
  "Configure rover components and review live engineering constraints in the design studio.",
  "Run deterministic resource operations in mission control, then review the challenge and scientist previews.",
  "Review the results screen. No mission outcome is simulated yet.",
]);

export const INITIAL_GAME_STATE = Object.freeze({
  loadingComplete: false,
  screen: "home",
  screenHistory: Object.freeze([]),
  selectedMissionId: MISSION_CATALOG[0].id,
  currentMissionId: null,
  selectedChallengeDecisionId: null,
  activePlayerSlotId: PLAYER_SLOTS[0].id,
  playerAssignments: Object.freeze(
    PLAYER_SLOTS.map(({ id }) => Object.freeze({ slotId: id, playerName: "", roleId: null })),
  ),
  selectedLandingSiteId: LANDING_SITES[0].id,
  rover: Object.freeze({
    chassis: null,
    mobility: null,
    power: null,
    instruments: Object.freeze([]),
    communications: null,
    landing: null,
    upgrades: Object.freeze([]),
  }),
  resources: null,
  challengeProgress: Object.freeze(
    MISSION_CHALLENGES.map(({ id, status }) => Object.freeze({ id, status })),
  ),
  preferences: Object.freeze({
    reduceMotion: false,
  }),
});
