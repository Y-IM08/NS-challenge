# MARSBOUND: Mission to Settlement

## Purpose and current phase

MARSBOUND is an educational Mars mission-design simulator. The app provides a complete visual screen architecture and a single-device navigation foundation for up to four local player slots. Mission Planning stores and validates a structured mission plan and estimates selected resource use. The Rover Design Studio calculates and validates an illustrative engineering configuration. Mission Control runs deterministic waypoint movement, sample collection, capability-specific scientific observations, communications, and resource accounting. It does not simulate rover physics, actual scientific results, scoring, or online play.

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
│   ├── mission.js       # Lifecycle, waypoint operations, samples, observations, and progress
│   └── ui.js            # DOM rendering, event delegation, view navigation
├── tests/
│   ├── rover.test.js    # Rover calculation and validation tests
│   ├── resources.test.js # Resource calculations and operation tests
│   ├── state-rover.test.js # Rover/resource state and navigation guard tests
│   ├── planning.test.js # Mission plan estimate and validation tests
│   ├── planning-state.test.js # Plan state freshness and navigation guard tests
│   └── mission.test.js  # Mission execution and resource integration tests
├── README.md
└── PROJECT_CONTEXT.md
```

`mission.js` is the active pure execution/domain module; it coordinates `planning.js`, `rover.js`, and `resources.js` without owning app state or rendering DOM. `scientist.js` and `evalauation.js` remain outside the current phase. The evaluation filename appears misspelled; resolve it only when that later module is implemented. No framework or third-party dependency is used.

## Implemented screens

1. Main menu and loading transition.
2. Mission briefing with mission profile, settlement rationale, four scientific objectives, and constraints.
3. Four local player slots and Aerospace Engineer, Mars Satellite Controller, Finance Administrator, and Mission Designer role cards.
4. Mission planning with editable profile/name/duration, landing-site context, ranked objectives, resource estimates, strategy guidance, deterministic risks, validation, recommendations, and readiness.
5. Rover design studio with CSS/SVG schematic, live mass/cost/power/payload/reliability indicators, chassis/mobility/power/instrument/communication/landing selection, reset, validation, science coverage, terrain-fit indicator, and role guidance.
6. Mission control with lifecycle controls, waypoint navigation, resource costs, sample inventory, capability-specific observations, objective progress, science logs, and mission events.
7. Reusable field-challenge layout with severity, discussion responses, and an explicitly non-simulated consequence area.
8. Dr. Chen profile, fixed educational dialogue, and regolith science note.
9. Mission results layout with objective, resource, engineering, and evaluation placeholders.
10. Mission archive, How to Play, Settings, and Credits.

## Navigation and state

The primary path is `home → briefing → roles → planning → rover → control → challenge → scientist → results`. Buttons advance only along defined transitions. Back buttons and Escape use the state history; a persistent Main Menu action returns to the home screen. Mission profiles opened from the archive use the same briefing workflow.

`state.js` owns the frozen snapshots and guarded transitions. It tracks the selected profile, local roles, mission-plan configuration and validation, landing site, rover configuration, resources, execution status/location/destination/movement/sample/observation/objective/event history, challenge selection, and display preference. State publication rebuilds the planning report from current inputs. Entering Mission Control requires fresh full-plan and rover validation, initializes resources and execution once, and starts the active field session. Rover and mission-plan configuration lock after resource initialization. Operations publish new frozen snapshots; rejected operations leave mission and resource state unchanged. These selections are not persisted. At least one role assignment is required to continue to planning; unused slots are permitted.

`data.js` owns the mission/component catalogs, science capability requirements, surface waypoints, completion requirements, and gameplay parameters. `rover.js` contains pure calculation/validation functions. `planning.js` derives estimates, risks, and readiness from existing catalogs and rover/resource APIs. `resources.js` owns battery, cost, data, time, and payload accounting. `mission.js` owns pure execution operations and records; it consumes validated plans, rover metrics, and resource functions. `ui.js` renders views and delegates events. `main.js` initializes UI/loading.

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

- **Power:** Watts are instantaneous generation/demand; watt-hours are energy; hours are operation duration. For solar power, available W = nominal W × daylight fraction × (1 − dust accumulation) × solar efficiency. Radioisotope generation uses nominal output without solar factors. Timed energy demand uses the configured rover, instrument, communication, movement, maintenance, and standby loads. Net power charges or depletes a finite battery, bounded by configured capacity and a 5% reserve.
- **Budget:** Initial budget is 15,000 illustrative credits. Initial deductions use rover construction cost from `calculateRoverCost()` plus 1,800 launch credits. Timed operations cost 4 credits/hour; communications are separately tracked at 2 additional credits/hour; maintenance costs 180 credits for 2 hours; sample collection uses its configured fixed cost. Insufficient funds reject an operation without partial cost/time/power changes.
- **Data:** Existing instrument `dataUnitsPerOperation` values convert to MB using the configured 1 MB/unit gameplay factor. A 512 MB store is enforced before instrument operation. Successful transmission moves stored MB to transmitted MB at the selected communication capacity in MB/sol. Failed transmissions increment a counter and append an event while preserving stored data.
- **Time:** Mission elapsed/remaining time and activity buckets are in hours, with 24 gameplay hours per sol. This is explicitly a gameplay simplification; a Martian sol is about 24 h 39 min. The illustrative fixed epoch is `2040-01-01T00:00:00.000Z`. Instrument actions default to 1 hour; movement time uses illustrative distance/speed; transmission time derives from volume/link capacity; sample, idle, and maintenance durations are explicit. The engine rejects operations that extend beyond the selected mission duration.
- **Mass:** `calculateRoverMetrics()` supplies total/dry/instrument/payload capacities and `calculateRoverCost()` supplies construction expense; no rover mass formula is duplicated. Sample mass is added to the resource payload and reduces remaining capacity.

`MISSION_RESOURCE_CONFIG`, `POWER_ENVIRONMENTS`, and `MISSION_EXECUTION_CONFIG` centralize the illustrative settings. Resource events record sequential IDs, success/failure, event type/description, simulation timestamps, and resource deltas. Mission execution records add lifecycle, movement, sample, observation, and transmission activity. The Mission Control UI exposes navigation, samples, capability-level science operations, transmission, idle, maintenance, lifecycle controls, and an environment selector.

These settings are illustrative gameplay parameters, not verified NASA specifications, measurements, or mission forecasts. Waypoint distances, movement times/power, sample types/masses, and completion conditions are gameplay abstractions. No real power-system degradation, changing weather, actual battery chemistry, physical terrain traversal, downlink windows, compression, transmission loss, or scientific-result interpretation is modeled.

## Mission execution

`mission.js` is a pure domain layer with no DOM or separate mutable state owner. `initializeMissionExecution()` rebuilds the plan and verifies the plan signature, readiness, mission profile, landing site, and rover configuration before creating Phase 4 resources and starting execution. `state.js` publishes the resulting resource and execution snapshots together.

- `MISSION_SURFACE_WAYPOINTS` provides a site-specific starting point and exploration destinations. Straight-line map coordinates scaled by `MISSION_EXECUTION_CONFIG.mapDistanceScaleKm` produce deterministic illustrative route distances; configured speed, power, and existing hourly resource rates estimate duration and cost. Route selection cannot cross to another site's map.
- Sample collection requires an installed `regolith-sampler`, a sample type available at the current waypoint, and remaining payload. `calculateRoverMetrics()` supplies rover payload limits; `resources.js` accounts for the collection duration, energy, cost, and sample mass before the mission inventory is updated.
- Scientific operations select an objective and one required capability. The instrument must be installed and mapped to that capability, the objective selected in the plan, and the objective available at the current waypoint. The operation must pass resource/time/storage checks before its illustrative observation is recorded. Each capability requires its own successful observation; agricultural or atmospheric objectives with several requirements remain in progress until all are investigated.
- Mission lifecycle states include active, paused, completed, failed, and aborted. Pause/resume and terminal transitions are guarded. Operations require an active session. Completion requires all selected objectives complete, the configured minimum number of explored waypoints, and transmitted data; these settings are in `MISSION_COMPLETION_REQUIREMENTS`.
- Execution history, resource events, collected samples, observations, explored locations, and objective counts are presented in Mission Control. Failed transmission attempts use the resource module's explicit failure record while retaining data; other rejected operations throw and do not publish partial state.

The map is not based on actual Mars surface data. Movement is not physics, collection types are not confirmed geological findings, and observations are not scientific measurements. The app does not infer a real landing route, sample composition, agricultural viability, or mission success.

## Verification

Run the built-in Node test suite from the project root:

```sh
node --experimental-default-type=module --test tests/*.test.js
```

Tests exercise initial/incomplete and valid rover builds, component sums, removal/toggle/reset behavior, rover limits and science coverage, resource power/energy/battery/budget/data/time behavior, planning/readiness and mission-control guards, mission initialization, movement and atomic resource failures, sample availability/payload, scientific capability progress, completion requirements, and immutable execution state.

Current verification: **73 Node.js tests passed, 0 failed**. Browser verification for the complete new Mission Control workflow remains pending after implementation.

## Visual and accessibility direction

The interface uses deep-space/navy surfaces, Mars-orange accents, technical labels, restrained grid overlays, native system fonts, responsive layouts, semantic sections and navigation, native buttons, visible keyboard focus, ARIA labels/states, keyboard Escape navigation, and reduced-motion support. No third-party assets are loaded.

## Explicit limitations

- Rover calculations, surface routes, sample classifications, and resource parameters are illustrative; no rover physics, thermal model, actual aerospace qualification, or mission outcome scoring is modeled.
- Mission Control runs deterministic waypoint navigation, sample inventory, objective capability progress, and resource transactions, but the surface map is not actual Mars topography and movement does not simulate physical terrain.
- Observations and sample descriptions are illustrative records only; no measurements, discoveries, or scientific conclusions are generated.
- The field scenario response is only a discussion prompt; it does not change mission state or create consequences.
- Dr. Chen content is fixed, not a branching dialogue system.
- Results do not claim success or failure and do not award a score.
- Four player slots share one in-memory browser session. There is no network multiplayer, authentication, or persistence.

## Scope boundary

Phase 6 adds deterministic mission execution, waypoint navigation, sample acquisition, capability-level observations, lifecycle control, objective progress, and resource integration. It does not implement future challenge consequences, progressive scientist dialogue, mission scoring, or results evaluation.
`