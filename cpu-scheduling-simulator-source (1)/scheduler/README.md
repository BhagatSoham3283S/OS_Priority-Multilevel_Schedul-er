# CPU Scheduling Simulator (SLA Stage 02)

Multilevel Queue (Algorithm 1) and Priority Scheduling (Algorithm 2) with a web GUI.

Open `index.html` in a browser (needs internet only for the Google Font; it falls back to system fonts).

- `js/engine.js`   scheduling logic, no DOM (both algorithms + metrics)
- `js/validate.js` input validation and limits
- `js/ui.js`       input table, Gantt chart, playback, comparison
- `css/style.css`  layout and light/dark theme
- `tests.js`       run `node tests.js` to check the engine against the report's sample set
- `build.py`       inlines everything into one HTML file
