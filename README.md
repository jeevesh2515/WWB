# World War B: Bugfront

A hyper-real, push-forward first-person shooter that runs in the browser (three.js + Rapier). As Kai,
a lone operator, hold a storm-lit container port against **8 waves** of masked mercenaries, humanoid
robots, robot hounds and powered exoskeletons, ending in a boss fight against **The Warden**.
Kills drop shards that restore health, armor and ammo, so aggression keeps you alive. Chain kills
to climb the style ranks, pick an augment between waves, and fire off Overdrive when it is charged.
Classic **Deathmatch** against five bots (first to 20 frags) is still available from the title
screen. The game remains playable offline, and can optionally use Supabase for pilot login,
cross-device progress, match records, and a server-side AI after-action report.

The current (V4) design, its reference analysis (Halo, Apex, CoD MW, Payday 2, DOOM Eternal, ULTRAKILL,
Titanfall 2) and concept art are in [`docs/concept/v4/PROPOSAL.md`](docs/concept/v4/PROPOSAL.md); earlier
rounds are in `docs/concept/`.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (pointer lock; click the game to capture the mouse) |
| W A S D / arrows | Move |
| Shift | Sprint |
| Space | Jump |
| C / Left Ctrl | Hold to crouch (real cover: smaller hitbox, bots aim lower); tap while running to slide |
| Left mouse | Fire |
| Right mouse | Aim down sights |
| R | Reload |
| 1 / 2 / 3, mouse wheel, Q | Rifle / shotgun / rocket launcher, cycle, last weapon |
| G | Throw grenade |
| F | Overdrive (when charged) |
| 1 / 2 / 3 or click | Choose an augment between waves |
| Tab (hold) | Scoreboard |
| Esc / P | Pause, settings and controls |

Gamepad (standard mapping): RT fire, LT aim, A jump, X reload, Y/RB next weapon, LB previous,
L3 sprint, R3 slide, D-pad up Overdrive, D-pad down grenade, Start pause.

## Game systems
- **Arena — Kestrel Terminal (V5):** a wet 80 × 80 m container yard ringed by three-high walls of
  procedural ISO containers (`src/game/containers.ts`: real corrugation, castings, door gear, stencilled
  codes), a Tripo RTG crane straddling the central deck, reach stackers as heavy cover, painted lanes and
  bay stencils on wet concrete with puddles and rain ripples, drizzle (medium/high quality), and an open
  north quay with ship-to-shore cranes (streamed with stage 2), harbour water and a container ship.
- **Deathmatch robots:** two of the six Deathmatch bots (WRAITH, NOVA) are Sentinel robots.
- **Low health:** a sharp, pulsing blood-red vignette closes in below 35 HP (no blur or heavy desaturation).

- **Enemies:** Wolf-masked riflemen and Boar-masked shotgun breachers, Sentinel humanoid robots
  (join the rifle rotation from wave 2), robot Hounds with back turrets, Exo minigun heavies (back power
  cell = 3x weak point), and The Warden, a 3 m assault exoskeleton with slam, cannon and drone phases.
  Characters are textured Tripo scans re-skinned onto shared rigs (`scripts/v4-rig-transfer.mjs`).
- **Recharging armor:** 150 armor over 100 health. After 1 s without taking damage, armor refills
  (segmented cyan bar, RECHARGING shimmer, HUD sparks, recharge whine, full chime, break shatter).
- **Player body:** Kai's rigged body is rendered into the shadow map only, so your own silhouette
  moves across the ground.
- **Style meter:** ranks D → C → B → A → S → SS → FRONTBREAKER. Variety, headshots, multi-kills and
  environmental kills pay more; the meter decays when you play passively. Rank multiplies score.
- **Augments:** eight stackable perks (Hollow Points, Quick Hands, Plated, Scavenger, Overclock,
  Demolitions, Vampire Core, Choke), offered three at a time after each wave.
- **Overdrive:** a charged state with faster fire, infinite ammo and a distinct colour grade.
- **Weapons:** M4 carbine (holographic sight), M870 pump shotgun (ghost-ring rear and fiber-optic
  front sight, shell-by-shell reload), RPG-X (rocket launcher with splash damage) and frag grenades.
- **Feedback:** recoil and camera kick, muzzle flash and smoke, tracers, flipbook sparks, decals,
  shells, debris, shockwaves, hit-stop, hitmarkers, damage arcs, and HUD spark bursts on hits,
  kills, pickups and rank changes.
- **Presentation:** HDRI sky and image-based lighting, a shadow-casting sun, fog, world-space
  grime on PBR surfaces (reflections and emission kept low to avoid glare), HDR bloom and a
  cinematic grade with damage, low-health and Overdrive looks. The HUD scales down on short
  viewports.

## Loading

Boot loads only what the title screen and wave 1 need (arena, Wolf/Boar rigs, Kai's body, rifle and
shotgun, core VFX and SFX, title music), then shows the title immediately. Later content (Sentinel and
Hounds, Exo and launcher, Warden, boss audio and music) streams through a staged queue in `src/game/stages.ts`.
The queue pauses while combat is busy (many effects or enemies on screen) and resumes when it calms
down. If a stage is still late when its wave starts, it is promoted to urgent and a "syncing
wave data" tag is shown.

## Cloud profile, cross-device saves, and AI debriefs

1. Create a Supabase project and run [`supabase/migrations/001_worldwarb.sql`](supabase/migrations/001_worldwarb.sql) in its SQL editor.
2. Copy [`.env.example`](.env.example) to `.env.local` and set `VITE_SUPABASE_URL` plus the public `VITE_SUPABASE_ANON_KEY`. These are browser-safe values; never put a `service_role` key in Vite or GitHub.
3. Deploy [`supabase/functions/after-action/index.ts`](supabase/functions/after-action/index.ts) as the `after-action` Edge Function. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` as Edge Function secrets. Without an AI key, the function returns a deterministic tactical report instead of exposing a key or failing.
4. For GitHub Pages, add the same two `VITE_` values as repository Actions secrets/variables and build with `npm run build` (or the project’s existing pnpm build once pnpm is available).

Login and account creation appear in the **Pilot Profile** panel. Match results can be synced to the signed-in account and sent to **AI Debrief**. Offline play and the local save continue to work when Supabase is not configured.

## Development

```bash
pnpm install
pnpm dev      # dev server (Tweak panel available in Manus Preview)
pnpm build    # typecheck + production build + boot/total size budget + sharing metadata
pnpm test     # unit tests (deathmatch rules, onslaught style/waves/perks, save, tuning bridge)
pnpm smoke    # after build: headless Bugfront and Deathmatch runs with screenshots in shots/
```

`scripts/debug.mjs` is a dev-only probe. It runs JavaScript steps from a file (separated by `---`
lines) against the running dev server and captures a screenshot after each step.

Asset pipeline (sources in `.asset-src/`, not shipped):

- `scripts/fetch-assets.py` downloads the CC0 Poly Haven HDRI, textures and props.
- `scripts/build-assets.py` converts them into web-ready files.
- `scripts/build-v2.py` packs the VFX flipbook atlases, HUD art, music and SFX.
- `scripts/prune-chars.mjs` trims, welds and meshopt-compresses the character rig.

## Layout

| Path | Role |
| --- | --- |
| `src/main.ts` | Bootstrap, staged loading, busy-aware streaming, screen flow, perk flow, music |
| `src/engine/` | Fixed-step loop, input, Rapier physics, renderer + post-processing, Web Audio mixer (staged samples, streamed music), save, i18n |
| `src/game/config.ts` / `tuning.ts` | Gameplay tuning and the Preview Tweak catalog bound to it |
| `src/game/onslaught.ts` | Pure style-meter, wave-plan and perk logic (unit tested) |
| `src/game/rules.ts` | Pure deathmatch rules (unit tested) |
| `src/game/game.ts` | Wave director, combat resolution, projectiles, explosions, camera feel, HUD state |
| `src/game/stages.ts` | Staged asset loader with the busy-aware background queue |
| `src/game/weapons.ts` / `guns.ts` | Player arsenal logic and procedural modeled viewmodels with gloved arms |
| `src/game/bots.ts` / `robot.ts` / `hornet.ts` / `nav.ts` | Enemy AI, rigged robots with armour kits and IK, drones, navigation grid |
| `src/game/arena.ts` / `props.ts` / `library.ts` | Level build, explosive props + pickups, asset loading and PBR materials |
| `src/game/fx.ts` | Flipbook-atlas GPU particles, decals, shells, debris, light pool, shockwaves, explosions |
| `src/ui/ui.ts` / `sparks.ts`, `src/styles/main.css` | DOM HUD and menus, and the HUD spark particle layer |
| `game-sharing.json`, `assets/share/` | Link-preview title/description, OG cover and favicon |

## Rules for changes

- **Simulation in `step()`, visuals in `render()`/`animate()`.** Gameplay state only changes in
  fixed steps; read presses there with `input.consume(action)`.
- **Rules stay pure.** Scoring, style, waves and perks go in `onslaught.ts`/`rules.ts` with tests.
- **No new lights at runtime.** Dynamic lights come from the pre-allocated pool in `fx.ts`, so
  explosions never trigger shader recompiles.
- **Keep glare low.** Environmental reflections and emission are deliberately subdued; use them sparingly.
- Keep `pnpm build` within budget and `pnpm smoke` green.

## Preview Tweak

`src/game/tuning.ts` is the game's parameter manager, and `config.ts` owns the source defaults
and the active configuration. The manager registers through `scripts/manus-tuning/adapter.js`
only under `import.meta.env.DEV`. Keep the Vite plugin and the `scripts/__manus__/` helpers
intact; production builds exclude the adapter and never inject the bridge.

Parameters apply at different points:

- `LIVE` parameters apply on the next update.
- `NEXT_ACTION` parameters apply at the next jump.
- `NEXT_RUN` parameters apply when a match starts.

Apply changes preview state only; Save with Manus edits `DEFAULT_CONFIG`. While any gameplay
value differs from its default, the manager latches `tuning.unranked`. `Game` copies that flag
onto the match, so modified runs are not saved as best scores.

## Credits

- HDRI, PBR textures and prop models: [Poly Haven](https://polyhaven.com), CC0 (*The Sky Is On Fire*
  HDRI; Concrete Floor 03, Concrete Floor Worn 001, Concrete Wall 008, Rusty Metal 02, Metal Plate
  and Corrugated Iron 02 textures; Barrel 03, Old Military Crate, Wooden Military
  Crate, Medical Box, Ammo Box, Propane Tank, Utility Box 02 and Security Light models).
- Port props (RTG crane, ship-to-shore crane, reach stacker) and the clean Sentinel: generated with Tripo
  from AI concept references for this project (`scripts/build-v5-props.sh`).
- Character rig and animations: Mixamo X Bot, as distributed in the three.js examples.
- Enemy armour, weapons, drones and arms: procedural geometry built in code for this project.
- Music (title, combat and boss themes) and sound effects: AI-generated for this project.
- VFX flipbooks, HUD icons, loading and title backgrounds, and concept art: AI-generated for this project.
- Fonts: SIL Open Font License 1.1 (see `public/fonts/*-OFL.txt`).
- Libraries: three.js (MIT), Rapier (Apache-2.0), meshoptimizer (MIT).
- Sharing artwork (OG cover, favicon): AI-generated for this project.
