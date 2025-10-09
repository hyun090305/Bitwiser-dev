# 제목 없음

# Agents Overview for Bitwiser

This document describes the major **agents** (modules) that make up the Bitwiser

web‑based combinational logic circuit simulator. Each agent encapsulates a

distinct responsibility such as handling authentication, managing the grid and

circuits, orchestrating gameplay levels, rendering on the canvas, or

interacting with external services. By documenting the responsibilities and

interactions of these agents, we improve the maintainability of the codebase

and make it easier for new contributors to understand how the system works.

## Purpose of Agents

Bitwiser is designed as a collection of loosely coupled modules. Each module

exposes a clear API and acts as an **agent** responsible for a specific

functionality within the game. Agents communicate by importing one another’s

functions, listening to callbacks and events, and passing data objects around.

The high‑level architecture splits into two layers:

- **UI and Gameplay layer** — agents in `src/modules` manage user accounts,
    
    levels, hints, tutorials, circuit sharing, navigation, ranking, and
    
    problem editing. They organise the overall flow and state of the game.
    
- **Canvas and Simulation layer** — agents in `src/canvas` implement the
    
    circuit model, physics (signal propagation), rendering and user
    
    interactions on the canvas. They operate on the 6×6 grid where players
    
    build circuits.
    

Below each agent is summarised with its core responsibilities and the key

functions it exposes. For brevity only the most relevant public functions are

mentioned.

## UI and Gameplay Agents (src/modules)

| Agent & file | Responsibility |
| --- | --- |
| **AuthAgent** (`auth.js`) | Handles user authentication. Manages login/logout flows, OAuth tokens and session persistence. Exports `initializeAuth()` and helpers to check login state. |
| **AuthUIAgent** (`authUI.js`) | Provides the user interface for authentication. Renders login dialogs and profile menus and hooks them into AuthAgent. |
| **StorageAgent** (`storage.js`) | Wraps browser storage APIs. Reads and writes user preferences such as username, hint progress, and auto‑save settings. Exports getters/setters like `getUsername()` and `setAutoSaveSetting()`. |
| **GuestbookAgent** (`guestbook.js`) | Manages a simple in‑game guestbook. Handles CRUD operations for player messages. |
| **ToastAgent** (`toast.js`) | Centralises toast notifications. Provides a `createToastManager()` that can show, update and hide messages with actions and progress indicators. |
| **GridAgent** (`grid.js`) | Maintains the current grid dimensions and the active circuits/controllers for *play* and *problem* contexts. Handles resizing, zooming, creation and destruction of circuit contexts, and emits circuit‑modified events via `onCircuitModified()`. |
| **LevelsAgent** (`levels.js`) | Loads level metadata from `levels.json`/`levels_en.json`, stores titles, grid sizes, block sets, answers and hints. Exposes methods to start and return from levels, mark levels cleared, and render chapter/stage lists. |
| **HintsAgent** (`hints.js`) | Controls hint functionality. Tracks which hints have been viewed and opens/closes the hint modal when requested via `openHintModal()`. |
| **TutorialsAgent** (`tutorials.js`) | Implements step‑by‑step tutorials shown at the start of certain levels. Provides `initializeTutorials()` and manages tutorial state. |
| **GradingAgent** (`grading.js`) | Grades player circuits. Compares the output of the EngineAgent against level answers and updates scoring UI. |
| **CircuitShareAgent** (`circuitShare.js`) | Implements circuit saving and sharing. Provides functions to export circuits to GIF, copy/share links, update save progress, and show modals. |
| **NavigationAgent** (`navigation.js`) | Handles page/screen transitions, orientation locking and mobile detection. Exports `setupNavigation()` and helpers like `isMobileDevice()`. |
| **ProblemEditorAgent** (`problemEditor.js`) | Powers the custom problem editor. Manages palettes for custom blocks, validates outputs, saves problems, and renders the list of user‑created problems. |
| **RankAgent** (`rank.js`) | Fetches and stores player progress/score data. Displays overall and per‑problem rankings via UI functions such as `showOverallRanking()`. |
| **LabModeAgent** (`labMode.js`) | Enables “lab mode,” a sandbox for free experimentation. Hooks into the grid to provide an unrestricted canvas. |
| **ConfettiAgent** (`confetti.js`) | Produces celebratory confetti animations upon level completion or achievements. |
| **UIAgent** (`ui.js`) | Placeholder module for future UI initialisation; currently unused. |

### Interactions within the UI/Gameplay Layer

- **AuthAgent** emits login state that other agents (e.g. RankAgent and
    
    CircuitShareAgent) use to decide whether saving/ranking is permitted.
    
- **StorageAgent** persists user preferences; many agents call it to fetch
    
    initial state on load.
    
- **GridAgent** maintains the active `play` and `problem` controllers. When a
    
    circuit is modified, it notifies listeners (e.g. GradingAgent and
    
    ProblemEditorAgent) via `onCircuitModified()` so they can update results or
    
    invalidate cached outputs.
    
- **LevelsAgent** calls `setupGrid()` (from GridAgent) when starting a level,
    
    sets grid dimensions, and uses **TutorialsAgent**, **HintsAgent** and
    
    **GradingAgent** to prepare the play environment.
    
- **CircuitShareAgent** depends on **GridAgent** to retrieve the active
    
    circuit for exporting; it also uses **ToastAgent** to show status updates.
    
- **RankAgent** and **LevelsAgent** coordinate via level events: when a level
    
    is cleared, **RankAgent** stores the result and updates leaderboards.
    
- **ProblemEditorAgent** uses **GridAgent** to build and preview custom
    
    problems; it uses **CircuitShareAgent** for saving and sharing.
    

## Canvas and Simulation Agents (src/canvas)

| Agent & file | Responsibility |
| --- | --- |
| **ModelAgent** (`model.js`) | Defines the internal data structures for the circuit. Represents blocks (inputs, outputs, gates), wires and their connections, and exposes helper functions to add/remove items. |
| **EngineAgent** (`engine.js`) | Simulates signal propagation through the circuit. Uses a breadth‑first search to evaluate combinational logic and update output values when inputs or connections change. |
| **CameraAgent** (`camera.js`) | Maintains the camera transform for the canvas. Handles zooming, panning and converting between screen and world coordinates. |
| **RendererAgent** (`renderer.js`) | Renders the grid, blocks, wires and animations onto an HTML canvas. Reads circuit state from ModelAgent and uses CameraAgent for coordinate transforms. |
| **ControllerAgent** (`controller.js`) | Orchestrates user interactions on the canvas. Handles dragging and dropping of blocks, drawing and deleting wires, moving the camera, and bridging between UI events and updates to ModelAgent and EngineAgent. |

### Data Flow on the Canvas

1. **ControllerAgent** listens to mouse/touch events on the canvas and updates
    
    the **ModelAgent** when a block is added, moved or removed or when wires
    
    are drawn. It also triggers a simulation via **EngineAgent** after each
    
    change.
    
2. **EngineAgent** traverses the graph defined by the ModelAgent and
    
    computes new output values. It emits updates so that the UI can reflect
    
    changes (e.g. lighting up outputs or highlighting active gates).
    
3. **RendererAgent** redraws the circuit whenever the ModelAgent or CameraAgent
    
    signals that something changed. It draws blocks using symbolic icons,
    
    wires as lines with direction arrows and simple flow animations.
    
4. **CameraAgent** ensures that panning/zooming keeps the canvas centred and
    
    scaled appropriately across different screen sizes. The GridAgent calls
    
    `adjustGridZoom()` to fit the canvas into the available viewport.
    

## Extending the Agents

- When adding new features, consider whether they belong in an existing agent
    
    or warrant a new module. For example, a “collaborative editing” feature
    
    might become a **CollaborationAgent** that handles WebSocket messaging and
    
    integrates with ProblemEditorAgent and GridAgent.
    
- To maintain low coupling, expose small, focused functions rather than
    
    directly manipulating another agent’s internal state. Use events or
    
    callbacks where appropriate.
    

## Summary

Bitwiser’s architecture divides responsibilities among several agents. The

UI/Gameplay agents coordinate authentication, level flow, progress tracking

and sharing, while the Canvas/Simulation agents handle the low‑level

representation and visualisation of circuits. Understanding these agents and

their interactions will help contributors reason about changes and extend the

game without introducing regressions.