# MARSBOUND: Mission to Settlement

MARSBOUND is an educational Mars mission-design simulator. The browser app provides mission setup, rover design, deterministic resource-managed surface operations, and dynamic challenge responses for up to four local player slots. Engineering, movement, environmental, and resource parameters are illustrative gameplay values; real rover physics, environmental forecasting, and scientific outcomes are not simulated. Challenge performance uses a configured gameplay evaluation, not a real mission-success score.

## Run locally

From the project root, start a static web server:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000/html/](http://localhost:8000/html/) in a modern browser. Stop the server with `Ctrl+C`. Serving over HTTP is recommended for consistent ES module support. No package installation, build step, backend, or external asset is required.

## Implemented screens

- **Main menu:** Start Mission, Mission Archive, How to Play, Settings, and Credits.
- **Mission briefing:** Existing mission profiles, scientific objectives, settlement rationale, constraints, and Continue.
- **Player role selection:** Four role profiles and four assignable slots in the same browser session.
- **Mission planning:** Editable mission name/profile/duration, conceptual landing-site selection, four selectable and ranked science objectives, resource estimates, operational strategy guidance, deterministic risks, mandatory validation, recommendations, and readiness status.
- **Rover design studio:** CSS/SVG rover schematic and interactive chassis, mobility, power, instrument, communication, and landing-system configuration.
- **Mission control:** Mission lifecycle controls; illustrative waypoint navigation; sample inventory; capability-specific science observations; data transmission; idle and maintenance operations; objective progress; resource monitors; active challenge decisions; equipment condition/recovery; and challenge evaluation/history.
- **Challenge center:** Mission-linked view of the same active challenges and resolution controls available in Mission Control.
- **Scientist interaction:** Dr. Chen profile, fixed educational dialogue, and science note.
- **Mission results:** Outcome, objectives, resources, engineering, and evaluation summary placeholders.
- Supporting archive, how-to, settings, and credits screens.

Selection controls update local in-memory state. Mission plan and validation snapshots refresh whenever relevant mission inputs, landing site, or rover components change. Rover mass, cost, power, payload, reliability index, terrain-fit indicator, science coverage, and engineering validation update immediately from the selected component catalog. Mission control applies deterministic resource accounting to movement, sample collection, capability-specific observations, transmissions, idle intervals, maintenance, and challenge responses. Challenge consequences update mission time, battery, available solar generation, budget, and equipment condition atomically with the execution snapshot. Scientific results and mission-success scoring are not simulated.

## Rover engineering model

`js/data.js` contains the component catalog, scientific capability mapping, and configurable mission limits. Catalogs include three chassis, three mobility systems, three power sources, seven scientific instruments, three communication systems, and three landing systems. Each instrument specifies its purpose, mass, cost, operating power, objectives/capabilities, reliability rating, and illustrative data generated per operation. Power-source entries state their illustrative limitations.

`js/rover.js` is the pure calculation and validation layer. Its current formulas are:

- **Mass / cost / operating power:** Sum the corresponding values for every selected component.
- **Power generation:** Nominal output of the selected power system.
- **Power margin:** Nominal generation minus combined operating demand.
- **Payload remaining:** The lower of chassis payload and mission payload limits, minus installed instrument mass.
- **Reliability index:** Arithmetic mean of installed component reliability ratings. This is a relative design indicator, not a probability of mission success.
- **Environmental suitability:** A conceptual score combining the share of selected-site terrain tags supported by the mobility system (70% weight) and the landing-system protection rating (30% weight). It is not a site safety assessment.
- **Data load:** Sum of instrument data units per operation. Link capacity is reported per sol; a warning flags when data load exceeds that capacity, but operation scheduling is not modeled.

Current configurable mission limits are 300 kg rover mass, 6,000 credits, 65 kg instrument payload, five instrument slots, 260 W power-generation interface, minimum communication level 1, 12 data-capacity units/sol, and a non-negative power margin. Chassis equipment-slot limits are also validated. Exceeding a mandatory limit, missing required systems, or lacking full coverage of any of the four science objectives prevents mission-control navigation. Low reserve, near-limit mass/budget, limited link capacity, low illustrative reliability, or a limited terrain fit appear as optimization warnings.

Scientific coverage maps instruments to mineral composition, regolith properties, agricultural assessment, and atmospheric conditions/wind speed. Agricultural assessment requires instrument indicators for regolith chemistry, nutrient-related factors, potential water, and environmental conditions. Instrument coverage does **not** establish that Martian soil is suitable for agriculture; further analysis is required.

All component, cost, power, reliability, data, and terrain-fit numbers are illustrative gameplay values, not verified NASA engineering specifications. The model does not simulate changing real solar/weather conditions, actual battery chemistry, rover dynamics, communications windows, or autonomous operation scheduling.

## Mission planning and validation

`js/planning.js` is the pure mission planning and validation layer. It consumes the existing mission, site, objective, rover-component, engineering-limit, and resource catalogs; it does not duplicate rover mass/cost/power functions or the resource engine's power and expense formulas.

- **Configuration:** Central state stores mission name and profile, landing-site ID, integer duration in configured 1–30 gameplay sols, selected objectives with priority ranks, and an operational strategy. Profiles come from `MISSION_CATALOG`; selecting another profile in the planning screen updates the active mission. Landing sites reuse `LANDING_SITES`, with explicitly illustrative environment, science-context, communication, and operational-risk annotations.
- **Science plan:** Every objective links to `SCIENCE_CAPABILITY_REQUIREMENTS`. Instrument coverage is validated against the installed rover using `getScientificCapabilities()`; selected objectives remain planned, not completed. Agricultural viability still requires multiple evidence types and the model does not claim Mars soil is agriculture-ready.
- **Resource estimates:** Construction cost, component mass, payload, and power use `calculateRoverMetrics()` / `calculateRoverCost()`. Site-adjusted nominal power and planned operation loads use `resources.js`; the battery estimate uses its deterministic interval simulator. Data generation uses the installed catalog instruments' existing data-unit values. Communication time uses selected link capacity; budget categories use the resource module's expense-estimate helper. The plan estimates one illustrative 1-hour operation for each distinct instrument needed to cover selected objectives, one transmission of the estimated data, the configured maintenance allowance, and a 10% mission-time emergency reserve. These are planning estimates, not an execution schedule.
- **Strategies:** Science First, Power Conservative, Data Efficient, and Balanced are guidance-only. Their trade-offs are explained in the UI; they do not adjust equipment, cost, data, power, or guarantee success.
- **Risks:** The deterministic report evaluates power and battery reserve, mass, budget, data storage, link capacity, mission duration, selected-objective instrument coverage, conceptual site fit, and maintenance/contingency allowance. Each risk has a low/medium/high severity, reason, mitigation, and blocking flag. Site suitability is an illustrative compatibility indicator, never a landing-safety assessment. High risks block only when tied to a mandatory constraint; advisory risks remain visible.
- **Validation and readiness:** The report records passed and failed mandatory checks, warnings, risk summary, recommendations, an explicit deterministic evaluation marker, and a source signature. `READY` requires all mandatory checks and no blocking high-severity risks; nonblocking advisory risks yield `NEEDS ATTENTION`; failed requirements yield `NOT READY`. Planning setup checks allow progression to Rover Design so the player can build missing hardware; Mission Control remains guarded by fresh full-plan and rover validation.
- **State freshness:** `state.js` owns the plan configuration and rebuilt estimates/risks/report. State publication regenerates the report from the current rover, mission profile, and site, so rover reset or changes cannot leave a stale ready result. Mission planning locks when Mission Control resource operations have started.

## Mission resource model

`js/resources.js` is the pure resource domain module. `js/state.js` creates resource state when a validated rover enters mission control and exposes immutable actions; no operation mutates the frozen game state.

| Resource | Model and units | Current illustrative behavior |
|---|---|---|
| Power | Generation/load in W, energy/battery in Wh, operation time in h | Solar available power = nominal rover output × daylight fraction × (1 − dust accumulation) × solar efficiency. The radioisotope option uses its nominal output without solar daylight/dust/efficiency multipliers. Timed operation loads include applicable rover, instrument, communication, movement, maintenance, and standby loads. Net generation charges the battery up to capacity; a configurable 5% reserve is preserved. |
| Budget | Credits | A 15,000-credit mission budget is charged for rover construction using `calculateRoverCost()` plus 1,800 launch credits at mission initialization. Time-based operations cost 4 credits/hour; communications are separately tracked at 2 additional credits/hour; maintenance costs 180 credits and takes 2 hours; sample collection uses its configured fixed cost. A transaction that cannot be funded is rejected without partial resource changes. |
| Data | MB | Instrument MB generated per operation = its existing `dataUnitsPerOperation` × configurable 1 MB/data-unit conversion. The 512 MB storage limit is enforced before consuming time, energy, or credits. Transmission moves all stored data into the transmitted total at the selected communication system's catalog capacity converted to MB/sol. A failed transmission increments a counter and records an event while retaining stored data. |
| Time | Mission hours; 24 gameplay hours/sol | The fixed illustrative mission epoch is `2040-01-01T00:00:00.000Z`. The 24-hour sol is a gameplay simplification; a Martian sol is about 24 h 39 min. Instrument operations default to 1 h; transmission duration is data MB divided by link MB/hour; movement duration derives from illustrative distance/speed; sample, idle, and maintenance actions have configured durations. Operations beyond the selected mission's total duration are rejected. |
| Mass | kg | Rover dry mass, installed-instrument mass, and available payload come from `calculateRoverMetrics()`; sample mass adds to the mission payload inventory and reduces the remaining capacity. Total construction cost comes from `calculateRoverCost()`. |

`MISSION_RESOURCE_CONFIG` and `POWER_ENVIRONMENTS` in `js/data.js` define the budget, launch/operation/communication/maintenance/sample expenses, battery, reserve, storage, data conversion, standby load, mission clock, and solar conditions. Movement adds an illustrative movement power load to the chassis/mobility load. Sample collection consumes the configured time, energy, cost, and payload mass. The environment selector updates solar generation for subsequent actions. Radioisotope generation is unaffected by solar environment settings. The resource state tracks cumulative category-specific expenditure, data generated/stored/transmitted/failures, mission elapsed/remaining hours and activity durations, rover/sample mass, battery/generation/consumption, status levels, and a deterministic event history.

## Mission execution model

`js/mission.js` coordinates the validated plan with the existing rover and resource modules. Entering Mission Control re-builds and checks the latest plan and rover validation, initializes resources once, selects the landing site's initial waypoint, and activates the mission. `js/state.js` remains the single owner of frozen app state; each operation returns replacement execution/resource snapshots.

- **Navigation:** `MISSION_SURFACE_WAYPOINTS` provides site-specific waypoints, terrain tags, science context, and activity/sample availability. A deterministic straight-line map-distance calculation derives illustrative distance, time, operation cost, and movement power use. Cross-site and current-location destinations are rejected. This is a gameplay route model, not rover physics or actual Mars coordinates.
- **Samples:** Collection requires the installed regolith sampler and a sample type available at the current waypoint. The configured mass is checked against the remaining payload derived from `calculateRoverMetrics()` and the resource inventory. Time, energy, cost, payload mass, collection history, and inventory update atomically. Sample labels do not imply scientific conclusions.
- **Science:** Each operation targets one planned objective capability and requires an installed instrument listed for that capability, an eligible current waypoint, and sufficient resources/storage/time. An observation record is written only after the resource operation succeeds. Multi-capability objectives remain in progress until each requirement has a successful observation.
- **Lifecycle and completion:** Missions can be paused/resumed, aborted, or completed; operations require an active mission. Completion is available only after every selected objective is complete, the configured waypoint exploration count is met, and data has been transmitted. These requirements live in `MISSION_COMPLETION_REQUIREMENTS`.
- **Logs and resources:** Execution history records lifecycle changes, movement, samples, observations, and transmission outcomes; the resource module retains its own detailed accounting/event history. All successful actions commit resources and mission progress together; rejected actions leave both unchanged. Failed transmission attempts follow the existing resource module's explicit failure-recording behavior.

`MISSION_EXECUTION_CONFIG` centralizes gameplay movement, sample, and collection parameters. Map coordinates/distances, movement speed/power, sample mass/cost, battery behavior, and mission duration are illustrative only. There is no physical route planning, terrain simulation, sample laboratory analysis, instrument calibration model, environmental forecast, autonomous event generation, or scientific measurement/result interpretation.

The interface offers installed-instrument operation (1 h), stored-data transmission, a 1 h idle interval, and fixed-cost maintenance. There is no emergency spending bypass. All environmental factors, rates, costs, capacities, conversion factors, and the mission epoch are invented gameplay parameters, not measured mission forecasts or NASA specifications. Power and data calculations do not model changing weather, actual battery chemistry, communication windows, compression, transmission loss, sample mass, or instrument science results.

## Dynamic challenges

`js/challenges.js` owns pure challenge creation, activation, deterministic trigger evaluation, decision validation, one-time resolution, history selection, and challenge-performance calculation. Challenge definitions, triggers, decisions, recovery costs, and evaluation weights are configured in `MISSION_CHALLENGE_CONFIG` in `js/data.js`. `mission.js` runs the trigger checks after mission operations; `state.js` publishes challenge, equipment-condition, resource, and event updates together as a frozen snapshot. Both the Mission Control panel and Challenge Center call the same state actions.

- **Environmental events:** A dust storm is eligible after one mission hour for solar-powered rovers. Enter safe mode adds 0.5 h, a 20 Wh direct battery draw, a 20-credit response cost, and sets solar availability to 80% of the current environment's base output. Continuing adds 0.25 h and a 90 Wh draw, costs no response credits, and sets the factor to 55%. Waiting adds 2 h and a 10 Wh draw, costs 10 credits, and sets the factor to 95%. Normal resource accounting also applies to elapsed response time. Reduced solar generation and extreme temperature use deterministic location/time/resource thresholds and expose configured responses with measurable costs.
- **Equipment events:** Wheel, instrument, communication, and solar-generation failures are triggered by configured movement, observation, transmission, elapsed-time, location, or battery thresholds. Failure state is stored in the separate `operationalCondition` model; rover design selections are never changed. The relevant subsystem is blocked or degraded until a recovery decision charges its configured time, energy, and credits.
- **Atomicity and lifecycle:** Invalid decisions, duplicate resolutions, insufficient resources/time, paused missions, and terminal missions reject without publishing partial state. Failed/active equipment condition persists until a valid recovery. Challenge events are also recorded in the mission and resource histories.
- **Evaluation:** Encountered/resolved events, equipment failures/recoveries, and cumulative challenge time, net battery draw, and total budget cost feed the configured 0–100 deterministic challenge-performance indicator. It is an educational game metric only.

Challenge triggers and effects are deterministic gameplay conditions, not predictions of Martian weather or equipment reliability. Solar factors, battery penalties, budgets, recovery procedures, and the evaluation formula are illustrative and do not represent real Mars engineering.

Run the automated calculation and state tests from the project root:

```sh
node --experimental-default-type=module --test tests/*.test.js
```

Current verification: **80 Node.js built-in tests passed, 0 failed** using the command above. Coverage includes rover engineering, resource accounting, planning readiness, mission initialization, movement and resource costs, sample payload checks, capability-specific observations, challenge triggers/decisions/recovery, mission completion, and immutable state integration. All values and formulas are illustrative gameplay inputs; this is not NASA mission-planning software.

## Navigation

The primary sequence is:

```text
Main menu → Mission briefing → Player roles → Mission planning
→ Rover design → Mission control → Challenge center
→ Dr. Chen interaction → Mission results
```

In-screen Back buttons and `Escape` return to the preceding screen. The persistent Main Menu control is available throughout the app. The archive opens a selected profile's briefing. State transitions are validated in `js/state.js`; invalid transitions are rejected rather than silently changing screens.

## Project map

- `html/index.html` — semantic app shell, loading screen, navigation, and screen templates.
- `css/main.css` — shared tokens, controls, loading screen, focus treatment, and motion preferences.
- `css/game.css` — mission sequence, screen layouts, schematics, and responsive breakpoints.
- `js/main.js` — browser startup and loading transition.
- `js/data.js` — mission and component catalogs, science capability mapping, engineering limits, execution waypoints/parameters, completion requirements, challenge content, and initial state.
- `js/state.js` — centralized immutable state, guarded transitions, mission lifecycle/actions, rover component selection/reset, local selections, and subscriptions.
- `js/rover.js` — pure rover metrics, science coverage, environmental-fit indicator, and engineering validation.
- `js/planning.js` — pure plan estimates, objective coverage validation, deterministic risk assessment, readiness report, and configuration signature.
- `js/resources.js` — pure power, budget, data, time, and rover/sample mass accounting plus deterministic operation/event recording.
- `js/mission.js` — mission initialization, waypoint routes, sample and observation records, objective progress, lifecycle controls, and completion checks.
- `js/challenges.js` — deterministic trigger rules, challenge lifecycle validation, history helpers, and performance evaluation.
- `js/ui.js` — reusable DOM renderers, delegated events, and screen navigation.
- `tests/challenges.test.js` and the other `tests/*.test.js` files — Node.js built-in tests for challenges, mission execution, engineering, resources, planning, immutable state, and navigation guards.
- `PROJECT_CONTEXT.md` — architecture, decisions, current scope, and phase boundaries.

`scientist.js` and `evalauation.js` remain outside this phase. The evaluation filename appears misspelled; resolve it only when that later module is implemented.

## Current limitations and next phase

- No rover physics, thermal model, weather forecast, actual flight engineering analysis, or scientific measurement outcomes. Waypoint movement and sample types are deterministic illustrative gameplay abstractions.
- Mission resource operations and challenges are deterministic and local; the challenge indicator is a configured educational metric, not mission-success scoring.
- No dynamic scientist dialogue, result scoring, or mission persistence.
- Role slots and setup choices are local to the current page session; they are not online multiplayer or saved profiles.
- Results remain a presentation preview; mission control simulates waypoint/resource operations and challenge consequences, but not science outcomes or mission success.

Progressive scientist dialogue and full mission-results evaluation are not included. Preserve the separation between catalogs, centralized state transitions, pure domain calculations, and rendering when extending the simulator.
