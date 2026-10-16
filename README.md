<div align="center">

# ⚡ WORLD WAR B: BUGFRONT ⚡
### *Real-time 3D browser FPS built with TypeScript, Three.js, Rapier WASM physics, and Supabase Realtime*

[![Play Live](https://img.shields.io/badge/PLAY_NOW-GitHub_Pages-FF9A2E?style=for-the-badge&logo=googlechrome&logoColor=white)](https://jeevesh2515.github.io/WWB/)
[![Star Repository](https://img.shields.io/github/stars/jeevesh2515/WWB?style=for-the-badge&label=⭐_Star_Project&color=238636)](https://github.com/jeevesh2515/WWB)
[![Build & Deploy](https://img.shields.io/github/actions/workflow/status/jeevesh2515/WWB/deploy-pages.yml?style=for-the-badge&label=Deployment)](https://github.com/jeevesh2515/WWB/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL_3D-black?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Rapier Physics](https://img.shields.io/badge/Rapier_3D-WASM_Physics-E05D44?style=for-the-badge)](https://rapier.rs/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_%26_Cloud_Sync-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

### [**🎮 ▶ CLICK HERE TO PLAY LIVE IN YOUR BROWSER (ZERO INSTALL) ◀ 🎮**](https://jeevesh2515.github.io/WWB/)

*Zero downloads or plugins: play directly in a modern browser with keyboard/mouse and gamepad support. Performance varies by device and scene.*

<br/>

<a href="https://jeevesh2515.github.io/WWB/">
  <img src="docs/screenshots/gameplay_demo.gif" alt="World War B: Bugfront browser gameplay preview" width="100%" />
</a>

*Actual in-game combat footage: Three.js WebGL rendering with Rapier WASM physics. The build is designed for smooth browser play; measure performance on your target device.*

</div>

## Engineering summary

World War B: Bugfront is a zero-install 3D browser game built to explore real-time simulation, WebAssembly physics, client-side performance, and resilient multiplayer state.

I designed and implemented the TypeScript game loop, fixed-step Rapier physics bridge, combat and wave rules, enemy AI, asset streaming, Supabase profile/save integration, duel lobby, score synchronisation, CPU fallback, and automated verification suite.

**Engineering proof:**

- Three.js WebGL rendering with Rapier 3D WASM physics
- Offline-first gameplay with optional Supabase cloud sync
- Supabase Realtime lobby and score broadcast for synchronized 1v1 bot races
- Fixed-step simulation and pure game-rule modules tested with Vitest
- Playwright multi-window duel verification and headless smoke tests
- GitHub Actions deployment to GitHub Pages

> **Scope note:** Duel mode synchronizes lobby and score state for a 1v1 bot race; it is not authoritative player-versus-player netcode.

---

## 📸 Gameplay & Visual Showcase

<div align="center">

### 🎮 Tactical Landing Page, Operations & Synchronized 1v1 Bot-Race Lobby
*Cinematic browser UI, real-time cloud profile sync, and one-click synchronized 1v1 bot-race lobby staging.*
<img src="docs/screenshots/01_landing_page.png" alt="World War B Tactical Landing Page and Duel Lobby" width="95%" />

<br/><br/>

### 🌧️ Wave 1 Infiltration — Kestrel Terminal Port Deck
*Three.js PBR container yard, wet concrete rain ripples, RTG cranes, and procedural M4 Carbine viewmodel.*
<img src="docs/screenshots/02_wave_start.png" alt="Wave 1 Wolf Pack Patrol Infiltration" width="95%" />

<br/><br/>

### 🔥 High-Stakes Close-Quarters Combat & Low-Health Alarm
*Emergency Armor Broken warning, red battle vignette, and high-intensity firefights against Sentinel combat droids.*
<img src="docs/screenshots/03_intense_combat.png" alt="Close Quarters Combat with Armor Broken" width="95%" />

<br/><br/>

### ⚡ Wave Cleared & Health Shard Harvesting
*Aggression rewards survival: slain bots drop glowing recovery shards, M870 pump shotgun, and style multipliers.*
<img src="docs/screenshots/04_wave_cleared.png" alt="Wave Cleared and Shard Resupply" width="95%" />

<br/><br/>

### 🛡️ Tactical Augment Perks Selection
*Stackable perks between waves powered by our custom high-visibility glowing vector SVG icon system.*
<img src="docs/screenshots/05_choose_augment.png" alt="Choose An Augment Perk Selection" width="95%" />

</div>

---

## Technical challenges solved

1. **Stable simulation:** kept physics and combat rules deterministic with a fixed-step update path.
2. **Fast first interaction:** streamed non-essential assets while keeping the initial playable scene lightweight.
3. **Resilient multiplayer state:** synchronized room membership and score events while repairing missed packets and falling back to a CPU rival on disconnect.
4. **Secure browser integration:** exposed only browser-safe Supabase anonymous credentials and enforced row-level security for user-owned records.
5. **Testable game logic:** isolated wave, style-meter, save-store, and duel-wire rules from rendering code so they can run in automated tests.

## Project status

- **Status:** Public portfolio release / active iteration
- **Live build:** [GitHub Pages](https://jeevesh2515.github.io/WWB/)
- **Primary branch:** `main`
- **Known limitation:** Duel mode synchronizes lobby and score state; it is not authoritative player-versus-player netcode.

## Key architecture decisions

- **Why Rapier WASM:** deterministic, performant 3D collision and character-controller primitives in the browser.
- **Why pure rule modules:** combat, waves, scoring, and duel-wire logic can be tested without a WebGL canvas.
- **Why offline-first:** the core game remains playable without authentication or a network; cloud features enhance progression rather than gate the primary experience.

## 🎯 About The Game

**World War B: Bugfront** is a push-forward first-person shooter running on pure web technologies (**Three.js WebGL + Rapier3D WebAssembly physics**). 

As **Kai**, a frontline spec-ops operator, hold a storm-lit industrial container port (**Kestrel Terminal**) against **8 brutal waves** of masked mercenaries, humanoid combat droids, hunter hounds, and mechanized exoskeletons, culminating in a colossal boss fight against **The Warden**.

### 🌟 Core Gameplay Pillars

- **Aggression Keeps You Alive**: Slain war bots drop Frontline Shards that instantly replenish health, recharging armor, and ammo. Camping is fatal; forward momentum is survival.
- **Dynamic Style Ranking**: Chain kills, headshots, slide kills, weapon swaps, and explosive multikills to climb the Devil May Cry / ULTRAKILL-inspired style ranks:  
  `D (Dull) → C (Chaotic) → B (Brutal) → A (Anarchic) → S (Savage) → SS (Supreme) → FRONTBREAKER`. Rank acts as a direct score multiplier.
- **Tactical Augment Perks**: Between waves, select one of eight stackable enhancements:
  - 🩸 **Vampire Core**: Kills siphon biological repair fluids, healing on every takedown.
  - 🎯 **Choke**: -30% shotgun spread, +15% concentrated kinetic damage.
  - 🛡️ **Plated**: +50 maximum armor pool with instant overshield refill.
  - ⚡ **Overclock**: +25% weapon cycle rate and reduced recoil recovery.
  - 💣 **Demolitions**: +40% explosion radius and bonus grenade capacity.
  - 📦 **Scavenger**: Double ammunition drop yield from fallen bots.
  - 💀 **Hollow Points**: +35% critical headshot damage multiplier.
  - ⚡ **Quick Hands**: +40% reload speed and near-instant weapon draw.
- **Overdrive State**: Fill your kinetic energy meter to activate Overdrive—unleashing maximum fire rate, infinite ammo reserve, and high-contrast night-vision grading.
- **Multiple Game Modes**:
  - 🏆 **Bugfront (Onslaught)**: 8 escalating waves ending in the Warden boss encounter.
  - 💀 **Deathmatch**: High-speed 6-bot arena combat (first to 20 frags).
  - ⚔️ **Duel (1v1 Bot Race)**: You + one rival hunting the same bot pack for 3 minutes — no PvP, most bot kills wins.
    - **Staging Room & 1-Click Sharing**: Clicking `HOST · GET CODE` generates a clean 6-character room code in a dedicated staging lobby. Click either the room badge or `COPY CODE` / `COPY INVITE LINK` to copy to clipboard in one click.
    - **Instant Peer Discovery**: When your friend enters your code and clicks `JOIN`, the host's screen instantly reflects `🟢 RIVAL JOINED` in real-time and activates the glowing `START MATCH` button.
    - **Synchronized Launch**: The host controls match launch. Clicking start simultaneously transitions both players into a synchronized 3-second combat countdown (`3... 2... 1... FIGHT!`).
    - **Live Score Synchronization**: Each client is authoritative for its own frags and broadcasts kill events over Supabase Realtime broadcast; state packets continuously repair any packet loss.
    - **Seamless CPU Fallback**: Start solo vs CPU at any time (`START NOW (VS CPU)`), or if a peer disconnects mid-match, an AI pilot takes over the puppet immediately so combat never halts.
- **Title Backdrop Is a Simulation**: The landing-page arena behind the menu is bots fighting bots (scores drift both ways). Your real match starts only after you pick a mode.

---

## 🕹️ Controls Guide

| Action | Keyboard & Mouse | Gamepad (Standard) |
| :--- | :--- | :--- |
| **Look** | Mouse (click to capture pointer lock) | Right Stick |
| **Move** | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / Arrows | Left Stick |
| **Sprint** | <kbd>Shift</kbd> | <kbd>L3</kbd> (Left stick click) |
| **Jump** | <kbd>Space</kbd> | <kbd>A</kbd> / <kbd>✕</kbd> |
| **Crouch & Slide** | <kbd>C</kbd> or <kbd>Left Ctrl</kbd> (tap while sprinting to slide) | <kbd>B</kbd> / <kbd>R3</kbd> |
| **Fire** | Left Mouse Button | <kbd>RT</kbd> / Right Trigger |
| **Aim Down Sights** | Right Mouse Button | <kbd>LT</kbd> / Left Trigger |
| **Reload** | <kbd>R</kbd> | <kbd>X</kbd> / <kbd>◻</kbd> |
| **Weapon Selection** | <kbd>1</kbd> Rifle · <kbd>2</kbd> Shotgun · <kbd>3</kbd> Rocket · <kbd>Q</kbd> / Wheel Last | <kbd>Y</kbd> / <kbd>RB</kbd> Next · <kbd>LB</kbd> Prev |
| **Frag Grenade** | <kbd>G</kbd> | D-Pad Down |
| **Activate Overdrive**| <kbd>F</kbd> (when charged) | D-Pad Up |
| **Choose Augment** | <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> or Click | D-Pad Left / Up / Right |
| **Scoreboard** | Hold <kbd>Tab</kbd> | Select / Back |
| **Pause & Settings** | <kbd>Esc</kbd> / <kbd>P</kbd> | Start |

---

## 🏗️ Technical Architecture

```
WWB/
├── src/
│   ├── main.ts              # Game bootstrap, state manager, audio mixer, busy-aware loop
│   ├── engine/              # Rapier 3D WASM physics bridge, fixed-step tick, input system
│   ├── game/
│   │   ├── game.ts          # Match orchestrator, damage arcs, combat resolution
│   │   ├── rules.ts         # Pure match rules, frag/death tracking, medals, score calculation
│   │   ├── onslaught.ts     # Pure wave director, style meter calculation, perk logic
│   │   ├── weapons.ts       # Weapon mechanics, recoil curves, hitscan & projectile ballistics
│   │   ├── bots.ts          # Enemy AI navigation, combat routines, IK aiming, puppet driver
│   │   ├── stages.ts        # Staged asset loader with background streaming queue
│   │   └── arena.ts         # Procedural ISO 6346 shipping containers & Kestrel port deck
│   ├── net/
│   │   ├── duel.ts          # Pure 1v1 netcode, room code generator, wire validation, rival interpolation
│   │   └── lobby.ts         # Lazy-loaded Supabase Realtime broadcast & presence transport
│   ├── ui/
│   │   ├── ui.ts            # HUD render layer, modal dialogs, title screen
│   │   ├── icons.ts         # High-definition inline SVG vector icon system (zero network overhead)
│   │   └── sparks.ts        # GPU canvas particle system for sparks & UI feedback
│   └── backend/
│       ├── cloud.ts         # Cloud profile, saves & AI debrief integration
│       └── supabase.ts      # REST-first browser-safe Supabase client (zero heavy SDK)
├── supabase/
│   ├── migrations/          # SQL schema (profiles, match_records, player_progress)
│   └── functions/           # Edge Functions (AI after-action debrief)
└── public/
    └── assets/              # Web-optimized 3D models (GLTF/GLB), HDRI, audio (SFX/Music), WebP
```

- **Render Engine**: Three.js WebGL renderer with image-based lighting (Poly Haven CC0 HDRI), PBR metal/roughness materials, screen-space grime, and dynamic bloom.
- **Physics**: Rapier3D compiled to WebAssembly for deterministic collision meshes, character controllers, and dynamic debris.
- **Audio Engine**: Staged Web Audio API mixer with spatial 3D audio, dynamic combat ducking, low-pass filters on low health, and adaptive music switching.
- **Adaptive Staged Streaming**: Loads core combat assets in `< 22 MB`, rendering the title screen in milliseconds while later waves and high-poly boss assets stream dynamically during calm gameplay windows.

---

## ☁️ Cloud Profile, Cross-Device Saves & Supabase

World War B runs 100% offline out-of-the-box, but also features seamless **Supabase Cloud Sync** for cross-device progression, leaderboards, and AI match debriefs:

1. **Authentication**: Sign in directly from the **Pilot Profile** HUD panel with Email & Password.
2. **Cloud Persistence**: Your best wave, high scores, style ranks, and combat statistics automatically sync across devices.
3. **Database Schema**: Pre-built migration provided in [`supabase/migrations/001_worldwarb.sql`](supabase/migrations/001_worldwarb.sql).
4. **Security by Design**: The client uses only browser-safe public `anon` credentials (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`). `service_role` secrets and database passwords are never bundled or exposed.
5. **1v1 Duels Need Realtime**: Random/code-match duels ride on Supabase Realtime broadcast + presence (no tables, no migration). Enable Realtime in your Supabase project; without it (or offline) duels fall back to a CPU rival automatically.

---

## 💻 Local Development & Testing

### Prerequisites
- Node.js 20+
- pnpm (recommended) or npm

### Setup & Run
```bash
# Clone the repository
git clone https://github.com/jeevesh2515/WWB.git
cd WWB

# Install dependencies
pnpm install

# Start local dev server
pnpm dev
```
Open [http://localhost:5173/](http://localhost:5173/) to play and test locally.

### Production Build & Size Budget Verification
```bash
# Typecheck + Vite production bundle + wire size budget check
pnpm build

# Run Vitest test suite (pure game rules, style meter, onslaught, save store, duel wire protocol)
pnpm test

# Run multi-window Playwright verification (host lobby + joiner + synchronized start + live score sync)
pnpm run test:duel

# Run headless smoke test with automated screenshots
pnpm smoke
```

---

## 🛡️ Security & Privacy

- **No Secret Leaks**: `.env` and `.env.local` are explicitly ignored in `.gitignore`.
- **Row-Level Security (RLS)**: Database tables enforce strict user isolation; pilots can only read and write their own records.
- **Offline First**: If Supabase credentials are not present, the game gracefully switches to offline mode with `localStorage` fallback—no crashes or blocked gameplay.

---

## 📜 Credits & Attributions

- **Environment & PBR Textures**: [Poly Haven](https://polyhaven.com/) (CC0) — *The Sky Is On Fire* HDRI, industrial wet concrete, and rusty metal materials.
- **Terminal Props**: RTG cranes and container equipment modeled from Tripo scans.
- **Rigging & Animations**: Mixamo X Bot via Three.js.
- **Icons & Graphics**: Vector SVG icon library custom crafted for World War B.
- **Physics**: [Rapier.rs](https://rapier.rs/) (Apache-2.0).
- **Core 3D Engine**: [Three.js](https://threejs.org/) (MIT).

---

<div align="center">

### 🎮 Ready to drop into Kestrel Terminal?

[![Play Live in Browser](https://img.shields.io/badge/▶_PLAY_FREE_NOW-Instant_Browser_Play-FF9A2E?style=for-the-badge&logo=googlechrome&logoColor=white)](https://jeevesh2515.github.io/WWB/)
&nbsp;&nbsp;
[![Star on GitHub](https://img.shields.io/github/stars/jeevesh2515/WWB?style=for-the-badge&label=⭐_Star_Repository&color=238636)](https://github.com/jeevesh2515/WWB)

<br/>

*If you enjoyed the game or find the Three.js + Rapier WASM codebase useful, please drop a ⭐ star on the repository—it helps indie open-web gaming reach more players!*

<br/>

<sub>World War B: Bugfront · MIT Licensed · Built with passion for open-web gaming.</sub>

</div>
