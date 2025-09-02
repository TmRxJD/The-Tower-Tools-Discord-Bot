# The Tower Tools Bot

A collection of interactive Discord tools that help you model, calculate, and visualize in-game systems for The Tower.

This README explains how to install, configure, and run the bot locally on Windows (PowerShell), and documents the main user commands.

---

## Commands (expanded)

Below are the main user-facing commands implemented by the bot. Each entry explains what the command does, the typical inputs, and any useful notes about interactivity or persistence.

### Tools Hub — /tools
A quick index embed listing available tools with links and command names. Useful when you need to discover what the bot provides or get links to the online calculators and trackers.

### Lab Calc — /lab
A multi-step calculator for Lab-related planning. Use this command to estimate run times, resource costs, and how lab upgrades affect outputs. The command presents summarized tables and can render a compact PNG table for easy sharing. Interactive selects and modals collect inputs; per-user preferences can be saved for faster repeated runs.

### Stone Calc — /stone
Ultimate Weapon stone cost calculator. Select an Ultimate Weapon, enter your current (starting) levels and desired (target) levels for the stats, and receive a per-level breakdown plus totals. Results are rendered as a table-style PNG attached to an embed for readability. The command supports per-user stat presets so your saved values can be reused later.

### Module Calc — /module
Calculator for module upgrades and shard/coin requirements. Provide the module name and desired ranks/levels, and this command returns costs and resulting stat values. The UI uses modals for multi-field input and returns concise numeric output; some flows can generate simple visual charts.

### Workshop Calc — /workshop
Workshop upgrade planner. Calculates costs and outcomes for workshop upgrades and produces a table image showing level-by-level information. Accepts form-like input and persists per-user workshop settings so you can continue where you left off.

### Bot Upgrades — /bots
Helpers for planning bot upgrades and medals. Presents upgrade tables and accepts per-bot inputs. Dynamic modals are generated from the bot upgrades dataset.

### Thorns Calc — /thorns
Wall Thorns hits-to-kill calculator. Estimates how many wall-thorn hits are needed to kill elites and bosses under different configurations (PC level, PC mastery, BC lab level, Sharp Fortitude). The command offers an initial modal for inputs and an edit/compare flow that toggles Sharp Fortitude and produces a PNG comparison chart.

### Chart Finder — /chart
Browse, preview, and optionally submit charts. Use select menus to navigate categories and items, and view chart images in an embed. The command supports reporting or adding charts via a guided modal + upload flow; uploaded images are attached and embedded so they appear in-message.

### Tournament Tools — /tourney
A suite of tournament utilities: link your Tower Player ID, fetch tournament overviews, battle conditions, live bracket views, and player-specific stats and charts. Several flows rely on web scraping to retrieve the latest data and include helpers to share results to a channel.

### Coins/Hour — /cph
Quick calculator for converting time and resource inputs into coins/cells-per-hour estimates. Intended for fast, single-run calculations without a graphical output.

### Checklist — /checklist
An interactive, per-user checklist useful for planning tournament runs. Edit items via modals and save or reset the checklist; items are persisted per-user so you can pick up where you left off.

---

## Requirements

- Node.js (v16+ recommended)
- npm (included with Node.js)
- Discord Bot Token with application commands permission
- A modern Chrome/Chromium install if you plan to use Puppeteer-backed features (tournament flows)
- Write access to the repository folder (SQLite files are created/updated in the repo root)

Note about native dependencies
- Some image/chart features rely on the `canvas` package which may require native build tools and libraries on Windows (Visual Studio Build Tools and Cairo). If `npm install` fails with canvas-related errors, install the recommended build dependencies for node-canvas on Windows (Visual Studio Build Tools + Cairo) and re-run `npm install`.

---

## Quickstart (Windows / PowerShell)

1. Install Node.js (v16+) and clone the repo:

```powershell
git clone https://github.com/TmRxJD/The-Tower-Tools-Discord-Bot.git
cd "Tower Tools"
npm install
```

2. Copy the example config and edit it:

```powershell
copy .\config.example.json .\config.json
notepad .\config.json
```

3. Register slash commands (local or global as configured):

```powershell
node deploy-commands.js
```

4. Run the bot:

```powershell
node TowerToolBot.js
```

## Main commands (summary)

- `/tools` — Tools hub index.
- `/lab` — Lab calculator.
- `/stone` — Ultimate Weapon stone cost calculator.
- `/module` — Module upgrade planner.
- `/workshop` — Workshop upgrade calculator.
- `/bots` — Bot upgrades and medals helper.
- `/thorns` — Wall Thorns calculations and comparisons.
- `/chart` — Browse and preview chart images.
- `/tourney` — Tournament utilities.
- `/cph` — Coins-per-hour quick calculator.
- `/checklist` — Per-user interactive checklist.

## Requirements

- Node.js v16+ and npm
- Optional: Chrome/Chromium for Puppeteer-backed features
- Native build tools for `canvas` on Windows if required (Visual Studio Build Tools + Cairo)

## Configuration

- Copy `config.example.json` to `config.json` and set `token`, `clientId`, `guildId`, and any feature toggles you need.
- Prefer using environment variables or a secrets manager in production; do not commit `config.json` or `.env`.

## Databases

The bot uses local SQLite files for per-user settings; expected files may include `playerDatabase.db`, `userUWSettings.db`, and other small DB files created at runtime. These are listed in `.gitignore`.

## Troubleshooting

- If `node TowerToolBot.js` fails due to encoding or syntax, check `TowerToolBot.js` is UTF-8 without BOM. I can normalize it if you want.
- If `canvas` install fails on Windows, install Visual Studio Build Tools and the Cairo libs, then retry `npm install`.

## Contribution

Open issues or PRs. If you change command data schemas, document migration steps in PR notes.

## License

See `LICENSE` in the repository root.
pm2 start TowerToolBot.js --name "tower-tools-bot"

```
