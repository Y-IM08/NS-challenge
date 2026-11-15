`# MARSBOUND: Mission to Settlement

## Purpose and current phase

MARSBOUND is an educational Mars mission-design simulator. The app provides a complete visual screen architecture and a single-device navigation foundation for up to four local player slots. Mission Planning stores and validates a structured mission plan and estimates selected resource use. The Rover Design Studio calculates and validates an illustrative engineering configuration; Mission Control runs deterministic power, budget, data, time, and mass accounting for selected rover operations. It does not simulate rover physics, mission outcomes, scoring, or online play.

## Technology and runtime

- HTML5, CSS3, and native JavaScript ES modules.
- No framework, bundler, dependency, backend, remote font, or remote image.
- Serve the project root over HTTP during development. The browser entry is `html/index.html`.
- CSS-rendered planetary/map artwork and inline SVG rover/scientist illustrations are local to the app.

## Structure and responsibilities

```text
M/
├── html/
│   └── index.html       # App shell, loading screen, navigation, screen templates
├── css/
│   ├── main.css         # Shared design tokens, controls, accessibility, motion
│   └── game.css         # Screen layouts, navigation, diagrams, responsive rules
├── js/
│   ├── main.js          # Startup and loading transition
│   ├── data.js          # Catalogs, engineering limits, capability mappings, initial state
│   ├── state.js         # Immutable centralized state and guarded transitions
│   ├── rover.js         # Pure rover calculations, science coverage, and validation
│   ├── planning.js      # Pure plan estimates, risk assessment, and readiness validation
│   ├── resources.js     # Pure resource accounting, operations, validation, and events
│   └── ui.js            # DOM rendering, event delegation, view navigation
├── tests/
│   ├── rover.test.js    # Rover calculation and validation tests
│   ├── resources.test.js # Resource calculations and operation tests
│   ├── state-rover.test.js # Rover/resource state and navigation guard tests
│   ├── planning.test.js # Mission plan estimate and validation tests
│   └── planning-state.test.js # Plan state freshness and navigation guard tests
├── README.md
└── PROJECT_CONTEXT.md
```

The historical `mission.js`, `scientist.js`, and `evalauation.js` files remain unused. The evaluation filename appears misspelled and should be corrected when that module is implemented. `rover.js` is active and imported by state and UI modules. No framework or third-party dependency is used.

## Implemented screens

1. Main menu and loading transition.
2. Mission briefing with mission profile, settlement rationale, four scientific objectives, and constraints.
3. Four local player slots and Aerospace Engineer, Mars Satellite Controller, Finance Administrator, and Mission Designer role cards.
4. Mission planning with editable profile/name/duration, landing-site context, ranked objectives, resource estimates, strategy guidance, deterministic risks, validation, recommendations, and readiness.
5. Rover design studio with CSS/SVG schematic, live mass/cost/power/payload/reliability indicators, chassis/mobility/power/instrument/communication/landing selection, reset, validation, science coverage, terrain-fit indicator, and role guidance.
6. Mission control dashboard with live modeled resource state, instrument/communication/idle/maintenance actions, power environment selector, event history, and surface map/science objective previews.
7. Reusable field-challenge layout with severity, discussion responses, and an explicitly non-simulated consequence area.
8. Dr. Chen profile, fixed educational dialogue, and regolith science note.
9. Mission results layout with objective, resource, engineering, and evaluation placeholders.
10. Mission archive, How to Play, Settings, and Credits.

## Navigation and state

The primary path is `home → briefing → roles → planning → rover → control → challenge → scientist → results`. Buttons advance only along defined transitions. Back buttons and Escape use the state history; a persistent Main Menu action returns to the home screen. Mission profiles opened from the archive use the same briefing workflow.

`state.js` owns the frozen state snapshots and transition guards. It tracks selected profile, local player-role assignments, structured mission-plan configuration and current estimates/risks/validation, landing-site and rover component selections, mission resource state, challenge discussion selection, and display preference. State publication rebuilds the planning report from the current plan, site, mission profile, and rover, preventing stale readiness after configuration changes or rover reset. Mission setup must pass before continuing from planning to rover design. Mission Control requires current full mission and rover validation; resource state initializes once with the plan's mission profile and duration. Rover and mission-plan configuration are locked after resource initialization. Resource operations are only allowed from Mission Control and publish new frozen snapshots. These selections are not persisted. At least one role assignment is required to continue to planning; unused slots are permitted.

`data.js` owns the preserved three mission profiles plus role, site, rover component, science objective/capability, challenge, initial-state data, rover limits, planning strategies/limits, power environments, and resource-model parameters. `rover.js` contains pure calculation and validation functions; it does not read or mutate app state or render DOM. `planning.js` derives estimates, risks, and a structured validation/readiness report from existing catalogs and rover/resource APIs. `resources.js` reuses rover metrics/cost and implements pure resource-state creation, calculations, deterministic operations, and event history. `ui.js` renders all views with reusable element and catalog rendering functions and delegates events from the document. `main.js` initializes the UI and loading transition.

## Mission planning and validation

The plan configuration stores a mission name and profile, landing-site ID, integer duration in gameplay sols, selected objectives with priority ranks, and an operational strategy. Mission profiles reuse `MISSION_CATALOG`; site terrain and scientific context reuse `LANDING_SITES`, with explicitly illustrative environment, science-context, communication, and operational-risk annotations. The supported duration range, estimate operation duration, and contingency fraction are defined in `MISSION_PLANNING_LIMITS`.

The four objectives reuse `SCIENCE_OBJECTIVES` and `SCIENCE_CAPABILITY_REQUIREMENTS`. Planning reports the mapped instruments required by each objective and whether the current rover covers them. Objectives are planned, not completed. Agricultural assessment requires chemistry/nutrient indicators, potential-water indicators, and environmental conditions; it does not establish that Martian soil is agriculture-ready.

Planning estimates derive construction cost, mass, instrument payload, and power from `rover.js`; site-adjusted available power, power intervals, and cost rates use exported helpers from `resources.js`. Expected data uses each distinct selected-objective instrument once, using its catalog data-generation value. Estimated downlink time assumes catalog link capacity is continuously available. The operation schedule estimates one configured one-hour instrument operation per distinct required instrument, one data transmission, the configured maintenance allowance, and a 10% emergency time reserve. These are deterministic planning estimates, not autonomous scheduling or mission forecasts.

Strategies (Science First, Power Conservative, Data Efficient, and Balanced) only describe trade-offs. They do not secretly alter resources, change equipment, or promise success. Risk assessment covers power/battery, rover mass, total and construction budget, data storage, communications, time, selected-objective instrument coverage, conceptual site fit, and maintenance/contingency allowance. Risks carry stable IDs, category, low/medium/high severity, reason, mitigation, and blocking status. Site compatibility and all underlying component/resource parameters are illustrative; no risk is a real-world landing safety assessment.

The validation report includes each mandatory check, passed/failed groups, advisory warnings, recommendations, a deterministic evaluation marker, and a configuration signature. `READY` requires all mandatory checks and no blocking high-severity risks. `NEEDS ATTENTION` means mandatory checks pass with advisory risks; `NOT READY` means a mandatory check or blocking risk remains. Setup validation permits progression to Rover Design so missing equipment can be selected; Mission Control separately requires full current validation. State publication recomputes the plan whenever the mission profile/name/duration/objectives/strategy, site, or rover changes. Mission setup edits are locked after Mission Control initializes resource operations.

## Rover engineering model

The component catalog includes three chassis, three wheel/suspension systems, three power sources, seven instruments, three communication systems, and three landing systems. Component specifications are illustrative gameplay inputs, not verified NASA specifications.

- Mass, cost, and operating power are sums across selected components.
- Power generation is the selected source's nominal illustrative output; power margin is generation minus operating demand.
- Remaining instrument payload is the lesser of chassis payload and mission payload limits minus installed instrument mass.
- Reliability is the arithmetic mean of installed component ratings. It is not a mission-success probability.
- Environmental suitability is an indicator using site terrain-tag matches (70%) and landing protection (30%); it is not a real site safety or landing assessment.
- Data load is the sum of instrument data generated per operation. A planning warning compares it with link capacity per sol; operation rate and scheduling are not modeled.

`ENGINEERING_LIMITS` currently sets 300 kg maximum rover mass, 6,000 credits maximum construction cost, 65 kg maximum payload, five mission instrument slots, 260 W maximum generation, minimum communication level 1, minimum 12 data-capacity units/sol, and minimum 0 W power margin. Chassis-specific equipment slots are enforced. Missing required component categories, exceeded limits, and incomplete coverage of any science objective are mandatory failures; near-limit mass/budget, low reserve, link capacity, reliability, and terrain fit are advisory warnings.

Science mappings cover mineral identification, regolith characterization, atmospheric conditions/wind speed, and agricultural assessment. The agricultural mapping checks regolith chemistry, nutrient-related indicators, potential water indicators, and environmental conditions. It does not claim that Mars soil is agriculture-ready; suitability requires further investigation.

## Mission resource simulation

The resource module tracks five categories. Units are explicit and operations are deterministic:

- **Power:** Watts are instantaneous generation/demand; watt-hours are energy; hours are operation duration. For solar power, available W = nominal W × daylight fraction × (1 − dust accumulation) × solar efficiency. Radioisotope generation uses nominal output without solar factors. Timed energy demand = total operation load W × duration hours. Net power charges or depletes a finite battery, bounded by configured capacity and a 5% reserve.
- **Budget:** Initial budget is 15,000 illustrative credits. Initial deductions use rover construction cost from `calculateRoverCost()` plus 1,800 launch credits. Operations cost 4 credits/hour; communications are separately tracked at 2 additional credits/hour; maintenance costs 180 credits for 2 hours. Insufficient funds reject an operation without partial cost/time/power changes.
- **Data:** Existing instrument `dataUnitsPerOperation` values convert to MB using the configured 1 MB/unit gameplay factor. A 512 MB store is enforced before instrument operation. Successful transmission moves stored MB to transmitted MB at the selected communication capacity in MB/sol. Failed transmissions increment a counter and append an event while preserving stored data.
- **Time:** Mission elapsed/remaining time and activity buckets are in hours, with 24 gameplay hours per sol. This is explicitly a gameplay simplification; a Martian sol is about 24 h 39 min. The illustrative fixed epoch is `2040-01-01T00:00:00.000Z`. Instrument actions default to 1 hour; transmission time derives from volume/link capacity; idle and maintenance durations are explicit. The engine rejects operations that extend beyond the selected mission duration.
- **Mass:** `calculateRoverMetrics()` supplies total/dry/instrument/payload capacities and `calculateRoverCost()` supplies construction expense; no mass formula is duplicated. Sample payload is tracked at 0 kg because sample collection mass is not yet modeled.

`MISSION_RESOURCE_CONFIG` and `POWER_ENVIRONMENTS` centralize all invented settings, including budget, category-specific expense rates, battery capacity/reserve, storage limit, data conversion, standby power, time epoch, daylight, dust, and solar efficiency. The event log records deterministic sequence IDs, success/failure status, event type and description, ISO timestamps derived from mission epoch and elapsed simulation hours, mission-clock time, and resource deltas. Status categories are normal, warning, or critical. The Mission Control UI provides instrument-operation buttons, transmit, idle, maintenance, and an environment selector; it displays power margin, free storage, separate communications spending, and event status/deltas. Failed operation messages are surfaced; failed transmissions preserve stored data.

These settings are illustrative gameplay parameters, not verified NASA specifications, measurements, or mission forecasts. No real power-system degradation, changing weather, actual battery chemistry, downlink windows, compression, transmission loss, sample mass, emergency spending, rover movement, or science-result generation is modeled.

## Verification

Run the built-in Node test suite from the project root:

```sh
node --experimental-default-type=module --test tests/*.test.js
```

Tests exercise initial/incomplete and valid rover builds, component sums, removal/toggle/reset behavior, rover limits and science coverage, resource solar/radioisotope behavior, power/energy/battery reserve/capacity and atomic failure, budget charges/insufficiency, data collection/storage/transmission/failure retention, time boundaries, maintenance/emergency delay, mass reuse, event history, immutable state transitions, and mission-control navigation.

Current verification: **64 Node.js tests passed, 0 failed**. Static UI checks found **171 unique HTML IDs and 114 queried IDs**, with no missing selector targets. Browser smoke testing confirmed the loading transition and main menu → briefing → roles → planning → rover workflow. Mission profile, site, objective selection, priority, strategy, and duration changes updated and persisted in the planning view; the incomplete rover kept Mission Control disabled with validation guidance. Escape returned to planning and keyboard focus had a visible 2px outline. Responsive checks at approximately 250, 400, and 850 CSS pixels found no horizontal overflow. Reload/startup produced no browser console or page errors.

## Visual and accessibility direction

The interface uses deep-space/navy surfaces, Mars-orange accents, technical labels, restrained grid overlays, native system fonts, responsive layouts, semantic sections and navigation, native buttons, visible keyboard focus, ARIA labels/states, keyboard Escape navigation, and reduced-motion support. No third-party assets are loaded.

## Explicit limitations

- Rover calculations and resource parameters are illustrative; no rover physics, thermal model, actual aerospace qualification, or mission outcome simulation is modeled.
- Mission resource dashboard values are derived from centralized game state; the surface map is illustrative and has no navigation data.
- Science objectives are planned and capability-checked but not scientifically assessed; no measurements or discoveries are generated.
- The field scenario response is only a discussion prompt; it does not change mission state or create consequences.
- Dr. Chen content is fixed, not a branching dialogue system.
- Results do not claim success or failure and do not award a score.
- Four player slots share one in-memory browser session. There is no network multiplayer, authentication, or persistence.

## Scope boundary

Phase 5 implements mission configuration and validation only. It does not implement Phase 6 mission-execution behavior, sample acquisition, rover movement, authored challenge outcomes, progressive scientist dialogue, mission scoring, or results evaluation.
`