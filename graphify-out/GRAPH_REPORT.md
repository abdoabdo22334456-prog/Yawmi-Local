# Graph Report - Yawmi-Local  (2026-11-11)

## Corpus Check
- Large corpus: 36 files · ~799,085 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 331 nodes · 490 edges · 20 communities (11 shown, 9 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.86)
- Token cost: 1,200 input · 850 output

## Community Hubs (Navigation)
- Localization & Day Time Tests
- Electron Preload & IPC Bridge
- Electron Main Process Lifecycle
- Yawmi Classic Build Config
- Yawmi Local Build Config
- Partner Pairing & Alarms
- Yawmi Classic Package Spec
- Yawmi Local Package Spec
- Encrypted Sharing & Events
- Firebase Admin Sharing Client
- Peer Chat Engine
- NSIS Windows Installer Debug
- Core Privacy & Local Planning
- Application Branding Assets
- Open Activities & Live Totals
- Electron Framework License
- Chromium Runtime Licenses
- Audio Alarm Subsystem
- Companion Chat User Guide

## God Nodes (most connected - your core abstractions)
1. `Couple` - 21 edges
2. `Sharing` - 17 edges
3. `build` - 13 edges
4. `build` - 12 edges
5. `nsis` - 11 edges
6. `nsis` - 11 edges
7. `registerIPC()` - 9 edges
8. `electronFuses` - 7 edges
9. `Chat` - 7 edges
10. `changes()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Local-Only Zero-Network Privacy Model` --semantically_similar_to--> `Electron Sandboxing & Security Boundaries`  [INFERRED] [semantically similar]
  app/README.md → src/yawmi/README.md
- `Yawmi Local Application Icon` --semantically_similar_to--> `Yawmi Classic Icon Asset`  [INFERRED] [semantically similar]
  app/assets/icon.png → src/yawmi/assets/icon.png
- `createWindow()` --calls--> `atomicWrite()`  [EXTRACTED]
  src/yawmi/electron/main.cjs → src/yawmi/electron/state.cjs
- `Real-Time Live Elapsed Totals` --conceptually_related_to--> `Open-Ended Activities System`  [INFERRED]
  src/yawmi/UPDATE-2.1.5.md → src/yawmi/USER-GUIDE.md
- `registerIPC()` --calls--> `atomicWrite()`  [EXTRACTED]
  app/electron/main.cjs → app/electron/state.cjs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Yawmi Core Privacy & Planning Patterns** — app_readme_yawmi_local, app_readme_privacy_model, src_yawmi_readme_security_boundaries [INFERRED 0.85]

## Communities (20 total, 9 thin omitted)

### Community 0 - "Localization & Day Time Tests"
Cohesion: 0.06
Nodes (14): assert, test, assert, test, assert, { test }, assert, test (+6 more)

### Community 1 - "Electron Preload & IPC Bridge"
Cohesion: 0.07
Nodes (28): { contextBridge, ipcRenderer }, loaded, { app, BrowserWindow, Menu, protocol, session, ipcMain, dialog, Notification, powerMonitor, nativeTheme, safeStorage, nativeImage, shell }, createMenu(), createWindow(), ensureTrusted(), fs, path (+20 more)

### Community 2 - "Electron Main Process Lifecycle"
Cohesion: 0.09
Nodes (33): { app, BrowserWindow, Menu, protocol, session, ipcMain, dialog, Notification, powerMonitor, nativeTheme, nativeImage }, backgroundColor(), BG, codeOf(), createMenu(), createWindow(), ensureTrusted(), fs (+25 more)

### Community 3 - "Yawmi Classic Build Config"
Cohesion: 0.06
Nodes (36): build, appId, asar, copyright, directories, electronDist, electronFuses, files (+28 more)

### Community 4 - "Yawmi Local Build Config"
Cohesion: 0.06
Nodes (35): build, appId, asar, copyright, directories, electronFuses, files, npmRebuild (+27 more)

### Community 5 - "Partner Pairing & Alarms"
Cohesion: 0.18
Nodes (7): Couple, LOVES, millis(), MOODS, serial(), text(), validDate()

### Community 6 - "Yawmi Classic Package Spec"
Cohesion: 0.10
Nodes (21): author, dependencies, firebase-admin@14.5.0, description, devDependencies, electron@45.0.0, electron-builder@26.18.0, electron (+13 more)

### Community 7 - "Yawmi Local Package Spec"
Cohesion: 0.11
Nodes (19): author, description, devDependencies, electron@45.0.0, electron-builder@26.18.0, electron, electron-builder, license (+11 more)

### Community 8 - "Encrypted Sharing & Events"
Cohesion: 0.19
Nodes (12): changes(), { createHash, randomInt }, displayCode(), fingerprint(), nudgeEligible(), pairingCode(), planDay(), fs (+4 more)

### Community 12 - "NSIS Windows Installer Debug"
Cohesion: 0.33
Nodes (5): nsis, script, x64, firstOrDefaultFilePatterns, nodeModuleFilePatterns

### Community 13 - "Core Privacy & Local Planning"
Cohesion: 0.40
Nodes (3): JSON Backup & Import Compatibility, Trilingual Engine (Arabic, English, German), Yawmi Local Offline Day Planner

## Knowledge Gaps
- **10 isolated node(s):** `Trilingual Engine (Arabic, English, German)`, `JSON Backup & Import Compatibility`, `Open-Ended Activities System`, `Companion Private Chat`, `Real-Time Live Elapsed Totals` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `firebase-admin` connect `Firebase Admin Sharing Client` to `Yawmi Classic Package Spec`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **What connects `Trilingual Engine (Arabic, English, German)`, `JSON Backup & Import Compatibility`, `Open-Ended Activities System` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Localization & Day Time Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.05853658536585366 - nodes in this community are weakly interconnected._
- **Why does `build` connect `Yawmi Classic Build Config` to `Yawmi Classic Package Spec`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Should `Electron Preload & IPC Bridge` be split into smaller, more focused modules?**
  _Cohesion score 0.07317073170731707 - nodes in this community are weakly interconnected._
- **Why does `Sharing` connect `Firebase Admin Sharing Client` to `Encrypted Sharing & Events`, `Electron Preload & IPC Bridge`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Should `Electron Main Process Lifecycle` be split into smaller, more focused modules?**
  _Cohesion score 0.09103840682788052 - nodes in this community are weakly interconnected._