# MARSBOUND: Mission to Settlement

MARSBOUND is an educational Mars mission-design simulator. The browser app provides mission setup, rover design, and deterministic resource-managed mission operations for up to four local player slots. Engineering and resource parameters are illustrative gameplay values; rover movement, environmental forecasting, mission outcomes, and scoring are not simulated.

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
- **Mission control:** Resource dashboard, configurable power environment, instrument operations, data transmission, idle time, maintenance expenses, event history, and surface-map/objective previews.
- **Field scenario:** Reusable challenge presentation, selectable discussion prompt, severity, and consequence-preview panel.
- **Scientist interaction:** Dr. Chen profile, fixed educational dialogue, and science note.
- **Mission results:** Outcome, objectives, resources, engineering, and evaluation summary placeholders.
- Supporting archive, how-to, settings, and credits screens.

Selection controls update local in-memory state. Mission plan and validation snapshots refresh whenever relevant mission inputs, landing site, or rover components change. Rover mass, cost, power, payload, reliability index, terrain-fit indicator, science coverage, and engineering validation update immediately from the selected component catalog. Mission control applies deterministic power, budget, data, time, and mass accounting to instrument operations, transmissions, idle intervals, and maintenance. Challenge responses remain discussion prompts; rover movement, scientific outcomes, map marks, and scoring remain presentation previews.

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
| Power | Generation/load in W, energy/battery in Wh, operation time in h | Solar available power = nominal rover output × daylight fraction × (1 − dust accumulation) × solar efficiency. The radioisotope option uses its nominal output without solar daylight/dust/efficiency multipliers. Each timed operation consumes `(rover + instrument + communication + standby load in W) × duration in h` Wh. Net generation charges the battery up to capacity; a configurable 5% reserve is preserved. |
| Budget | Credits | A 15,000-credit mission budget is charged for rover construction using `calculateRoverCost()` plus 1,800 launch credits at mission initialization. Operations cost 4 credits/hour; communications are separately tracked at 2 additional credits/hour; maintenance costs 180 credits and takes 2 hours. A transaction that cannot be funded is rejected without partial resource changes. |
| Data | MB | Instrument MB generated per operation = its existing `dataUnitsPerOperation` × configurable 1 MB/data-unit conversion. The 512 MB storage limit is enforced before consuming time, energy, or credits. Transmission moves all stored data into the transmitted total at the selected communication system's catalog capacity converted to MB/sol. A failed transmission increments a counter and records an event while retaining stored data. |
| Time | Mission hours; 24 gameplay hours/sol | The fixed illustrative mission epoch is `2040-01-01T00:00:00.000Z`. The 24-hour sol is a gameplay simplification; a Martian sol is about 24 h 39 min. Instrument operations default to 1 h; transmission duration is data MB divided by link MB/hour; idle and maintenance actions have explicit durations. Operations beyond the selected mission's total duration are rejected. |
| Mass | kg | Rover dry mass, installed-instrument mass, and payload capacity come from `calculateRoverMetrics()`; total construction cost comes from `calculateRoverCost()`. Additional sample mass is currently 0 kg because this phase does not model sample acquisition. |

`MISSION_RESOURCE_CONFIG` and `POWER_ENVIRONMENTS` in `js/data.js` define the budget, launch/operation/communication/maintenance expenses, battery, reserve, storage, data conversion, standby load, mission clock, and solar conditions. The environment selector updates solar generation for subsequent actions. Radioisotope generation is unaffected by solar environment settings. The resource state tracks cumulative category-specific expenditure, data generated/stored/transmitted/failures, mission elapsed/remaining hours and activity durations, mass breakdown, battery/generation/consumption, status levels, and a deterministic event history. Events contain sequential IDs, success/failure status, an ISO timestamp derived from mission epoch and elapsed simulation hours, a mission-clock label, and resource deltas. Mission Control displays power margin, remaining storage, separate communications expenditure, and event outcome/change details.

The interface offers installed-instrument operation (1 h), stored-data transmission, a 1 h idle interval, and fixed-cost maintenance. There is no emergency spending bypass. All environmental factors, rates, costs, capacities, conversion factors, and the mission epoch are invented gameplay parameters, not measured mission forecasts or NASA specifications. Power and data calculations do not model changing weather, actual battery chemistry, communication windows, compression, transmission loss, sample mass, or instrument science results.

Run the automated calculation and state tests from the project root:

```sh
node --experimental-default-type=module --test tests/*.test.js
```

Current verification: **64 Node.js built-in tests passed, 0 failed** using the command above. Coverage includes rover engineering, resource accounting, planning estimates and validations, risk/readiness states, immutable plan updates, freshness after rover/site changes, and navigation guards. Static UI checks found **171 unique HTML IDs and 114 queried IDs**, with no missing selector targets. Browser smoke tests confirmed startup and the menu-to-rover workflow, planning profile/site/objective/priority/strategy/duration changes, and the Mission Control guard for an incomplete rover. Escape navigation and visible keyboard focus worked; tested responsive widths had no horizontal overflow, and no console/page errors occurred. All values and formulas are illustrative gameplay inputs; this is not NASA mission-planning software.

## Navigation

The primary sequence is:

```text
Main menu → Mission briefing → Player roles → Mission planning
→ Rover design → Mission control → Field scenario
→ Dr. Chen interaction → Mission results
```

In-screen Back buttons and `Escape` return to the preceding screen. The persistent Main Menu control is available throughout the app. The archive opens a selected profile's briefing. State transitions are validated in `js/state.js`; invalid transitions are rejected rather than silently changing screens.

## Project map

- `html/index.html` — semantic app shell, loading screen, navigation, and screen templates.
- `css/main.css` — shared tokens, controls, loading screen, focus treatment, and motion preferences.
- `css/game.css` — mission sequence, screen layouts, schematics, and responsive breakpoints.
- `js/main.js` — browser startup and loading transition.
- `js/data.js` — mission and component catalogs, science capability mapping, engineering limits, challenge content, and initial state.
- `js/state.js` — centralized immutable state, guarded transitions, rover component selection/reset, local selections, and subscriptions.
- `js/rover.js` — pure rover metrics, science coverage, environmental-fit indicator, and engineering validation.
- `js/planning.js` — pure plan estimates, objective coverage validation, deterministic risk assessment, readiness report, and configuration signature.
- `js/resources.js` — pure power, budget, data, time, and mass resource calculations plus deterministic operation/event recording.
- `js/ui.js` — reusable DOM renderers, delegated events, and screen navigation.
- `tests/rover.test.js`, `tests/resources.test.js`, `tests/state-rover.test.js`, `tests/planning.test.js`, and `tests/planning-state.test.js` — Node.js built-in tests for engineering, resource, planning, immutable state, risk, readiness, and navigation guards.
- `PROJECT_CONTEXT.md` — architecture, decisions, current scope, and Phase 5 boundary.

The historical `mission.js`, `scientist.js`, and `evalauation.js` files remain unused. `rover.js` is active. The evaluation filename appears misspelled; resolve the name before adding an evaluation module.

## Current limitations and next phase

- No rover physics, terrain traversal, thermal model, weather forecast, actual flight engineering analysis, or scientific measurement outcomes. Component and resource values/formulas are illustrative.
- Mission resource operations are deterministic and local; no autonomous event generation, challenge consequences, or scoring is active.
- No dynamic scientist dialogue, result scoring, or mission persistence.
- Role slots and setup choices are local to the current page session; they are not online multiplayer or saved profiles.
- The challenge and results screens are presentation previews; mission control simulates resource accounting but not surface movement, science outcomes, or mission scoring.

Next, a separate Phase 6 can connect validated planning and existing resource accounting to authored mission operations, challenge outcomes, scientist dialogue progression, and transparent end-of-mission evaluation. Those behaviors are not included in this planning phase. Preserve the separation between data, state transitions, pure domain calculations, and rendering; add automated tests before connecting additional behavior to the UI.
