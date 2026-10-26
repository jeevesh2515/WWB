# World War B: Bugfront: LinkedIn launch post

**Attach:** `wwb_trailer_linkedin_4x5.mp4` (same folder; 35 s, 1080×1350, captions burned in)
**When:** Tuesday 27 Oct 2026, 8:00–9:00 AM your local time. Tue–Thu mornings reach B2B/recruiter feeds best; use today (Monday) for commenting instead of posting.
**Visibility:** Anyone
**Repo link:** in the post body (no first-comment link needed)

---

## Post (copy everything between the lines)

---

I wanted to build something that has to respond at the speed of interaction, not the speed of a notebook.

So I built World War B: Bugfront, a 3D shooter that runs in a browser tab. No install, no account. The clip is real gameplay from wave 1.

Play it: https://jeevesh2515.github.io/WWB/

What's under it:
• TypeScript and Three.js for WebGL rendering
• Rapier physics compiled to WebAssembly
• a fixed 60 Hz simulation loop, with rendering interpolated between steps
• enemy AI, 8 waves and a boss, with later assets streamed in while you play
• works offline; Supabase adds optional profiles and saves
• a 1v1 mode where two players race for bot kills over a Supabase Realtime lobby

The choice I'd make again: combat, wave, scoring, save and duel rules live in plain TypeScript modules that never touch the renderer. 42 Vitest tests run against them without a canvas, and a Playwright script drives two browser windows through the duel lobby.

To be clear about scope: duel mode syncs lobby and score state for a bot race. It isn't authoritative player-versus-player netcode.

Code is open: https://github.com/jeevesh2515/WWB

What's the hardest real-time system you've built in the browser?

#TypeScript #ThreeJS #WebAssembly #SoftwareEngineering

---

## Optional first comment (post it yourself ~1 minute after publishing)

> If you try it: desktop browser, keyboard and mouse or a gamepad. Click the screen to lock the mouse. If you want to try the 1v1 race, host a room and send the 6-character code to a friend. Bug reports and blunt feedback welcome, here or as a GitHub issue.

## Alternative opening lines (swap the first paragraph if you prefer)

1. Most of what I've built runs at the speed of a notebook. I wanted to build something that has to answer roughly every 16 milliseconds.
2. I built a 3D shooter that runs in a browser tab, mostly to find out what breaks when a system has to react every frame.

## Before you post

- [ ] Watch the video once with sound on your phone.
- [ ] Open both links from your phone.
- [ ] Leave the scope sentence in. It's the line engineers will trust.
- [ ] Reply to real comments with a specific detail (the fixed-step loop, how kill totals resync, why rules stay out of the renderer), not "thanks!".

## Today (Monday): comment, don't post

Leave 10–15 substantive comments on posts from:
- web/graphics engineers posting about Three.js, WebGPU or WebAssembly
- engineers and hiring managers at companies you'd like to work for
- people who have posted about browser games or real-time systems recently

Add something they didn't say (a trade-off, a number from your own work, a question). That warms up your profile before tomorrow's post.
