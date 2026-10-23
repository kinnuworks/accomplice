# Accomplice on Fire TV (Vega OS)

The Fire TV app is a small Vega OS app (`apps/vega`) that opens the game's TV stage in a full-screen WebView. The stage is served by the live game server, so every TV in a room stays in sync with the phones. If the server can't be reached, the app shows a bundled "We can't reach the game" page, and OK retries.

- Package id: `com.accomplice.tv`, component `com.accomplice.tv.main`
- Server: `http://Accomp-Alb16-mcZdJ1MHVPFR-1726733199.ap-south-1.elb.amazonaws.com/tv/?device=vega` (set in `apps/vega/src/config.ts`)
- Built with Vega SDK 0.24.12112 and Vega CLI 1.4.7, React Native 0.83 for Vega, `@amazon-devices/webview` 4

![Accomplice title screen on the Vega Virtual Device](vega/vvd-title-screen.png)

![Game lobby on the Vega Virtual Device after pressing OK on "Host a game"](vega/vvd-lobby-screen.png)

Both screenshots are from the Vega Virtual Device running the release package against the live server, taken on 23 October 2026.

## Packages

All packages are in `apps/vega/release/`. Checksums are in `apps/vega/release/SHA256SUMS.txt`.

| File | CPU | Build | Size |
|---|---|---|---|
| `accomplice_armv7_release.vpkg` | armv7 (most Fire TV sticks) | Release | 154,538 bytes |
| `accomplice_aarch64_release.vpkg` | aarch64 (Vega Virtual Device on Apple Silicon, 64-bit devices) | Release | 154,537 bytes |
| `accomplice_x86_64_release.vpkg` | x86_64 (Vega Virtual Device on Intel) | Release | 154,538 bytes |
| `accomplice_armv7_debug.vpkg` | armv7 | Debug | 457,943 bytes |
| `accomplice_aarch64_debug.vpkg` | aarch64 | Debug | 457,910 bytes |
| `accomplice_x86_64_debug.vpkg` | x86_64 | Debug | 457,666 bytes |

Use a Release package unless you need to debug. Only `accomplice_aarch64_release.vpkg` was run and measured; the armv7 and x86_64 packages were built from the same source but not run.

To rebuild (from `apps/vega`, with npm, since this folder is outside the pnpm workspace):

```sh
source ~/vega/env
npm install
npm run build:release   # build/<arch>-release/accomplice_<arch>.vpkg
npm run build:debug     # build/<arch>-debug/accomplice_<arch>.vpkg
```

Use the npm scripts, not a bare `vega build`. `vega build -b Release` on its own skipped the JavaScript bundle and produced a 5 KB package that can't run.

## Install and run

### One command

```sh
apps/vega/scripts/judge-run.sh                 # a device is already connected
START_VVD=1 apps/vega/scripts/judge-run.sh     # boot the Vega Virtual Device first
apps/vega/scripts/judge-run.sh apps/vega/release/accomplice_armv7_release.vpkg   # pick a package
```

The script waits for a device, picks the release package that matches the device's CPU, installs it, launches it, and retries if the device reports "offline".

### By hand on the Vega Virtual Device

```sh
source ~/vega/env
nohup vega virtual-device start --timeout 180 &
vega device list            # repeat until the virtual device is listed
vega run-app apps/vega/release/accomplice_aarch64_release.vpkg com.accomplice.tv.main
```

If `run-app` fails with "device offline", wait about 20 seconds and run it again. On an Intel Mac, use the x86_64 package.

### By hand on a Fire TV with Vega OS

1. Turn on developer mode on the device and connect it to the computer as the Vega SDK docs describe. Check it is visible with `vega device list`.
2. Install and launch:

```sh
vega device install-app -p apps/vega/release/accomplice_armv7_release.vpkg
vega device launch-app -a com.accomplice.tv.main
# or both at once:
vega run-app apps/vega/release/accomplice_armv7_release.vpkg com.accomplice.tv.main
```

Use the aarch64 package if `vega device list` reports an aarch64 device. This path was not tested, because no Fire TV hardware was available.

### Playing

Press OK on "Host a game". The TV shows a room code and a QR code. Phones join by scanning the code or by opening the address shown on the TV. Three to six players are needed to start.

## Plain HTTP and the WebView

The game server's load balancer serves plain HTTP. The Vega WebView blocks cleartext HTTP by default. The first build pointed at the server showed the offline page, even though `curl` from the device shell got a 200 from the same URL.

The fix is a manifest section that allows cleartext for this one host only:

```toml
[network-traffic-policy.cleartext]
allowed-domains = ["accomp-alb16-mczdj1mhvpfr-1726733199.ap-south-1.elb.amazonaws.com"]
```

This section is not in the public Vega docs as of SDK 0.24. The key names come from the manifest schema inside the device's package manager (`libvega_packagemanager_omnikit.so` lists `network-traffic-policy`, `cleartext`, `allowed-domains`, `blocked-domains`). The build's manifest check accepts it, and with it the app loads the live stage (screenshots above). If the server moves to HTTPS, delete the section. If the server's hostname changes, update both `src/config.ts` and this list.

## Performance on the Vega Virtual Device

Measured on 23 October 2026 with the aarch64 release package on the Vega Virtual Device (firmware `vvrp-tv-arm64-user OS 1.2 (TV Ship/102282480)`), on a MacBook with Apple Silicon running macOS 26, against the live server in AWS ap-south-1. This is an emulator on a laptop, so these numbers say little about how a Fire TV stick will perform.

| Metric | Median | Samples | Tool |
|---|---|---|---|
| Cold start: launch to first frame (TTFF) | 749 ms | 5 (622 to 1,029 ms) | KPI Visualizer, `cool-start-latency` |
| Cold start: launch to fully drawn (TTFD) | 1,452 ms | 5 (1,035 to 1,628 ms) | KPI Visualizer, `cool-start-latency` |
| JavaScript bundle load | 6.4 ms | 6 | KPI Visualizer |
| Memory, title screen (idle) | 248.6 MiB | 3 runs, about 30 samples each | `perf activity-monitor`, "Memory Application" |
| Memory, game lobby | 260.1 MiB | 3 runs, about 30 samples each | `perf activity-monitor`, "Memory Application" |
| Frames presented during the cold-start window | 61.4 fps | 5 | KPI Visualizer GWSI trace (side output) |

### How each number was taken

#### Cold start

`vega exec perf kpi-visualizer --app-name com.accomplice.tv.main --kpi cool-start-latency --iterations 3`, run twice (six iterations). The tool kills the app, launches it, and reads the times from a Perfetto trace. One iteration was thrown out by the tool itself ("VLCM trace markers error"), which leaves five. TTFF is the time to the app's first frame, which is the native splash screen. TTFD ends when the app calls `performance.reportFullyDrawn()`. The app does this in the WebView's first `onLoad`, which fires when the live stage page has finished loading from the server. TTFD therefore includes the network round trip from the device to ap-south-1. The raw reports are in `docs/vega/perf-raw/app-launch-kpi-report-*.json`.

#### Memory

`apps/vega/scripts/measure-memory.sh 3 20` runs the measurement three times. Each run cold-launches the app and waits 15 s for the title screen. It then records `vega exec perf activity-monitor --app-name com.accomplice.tv.main` once per second for about 30 s. Next it presses OK on the remote (`inputd-cli button_press KEY_ENTER` in the device shell) to open the game lobby, waits 8 s, and records again. The table shows the median of the three per-run medians:

- Title screen: 248.6, 251.0 and 247.5 MiB
- Lobby: 260.1, 261.3 and 259.1 MiB

The tool does not say exactly what "Memory Application" counts. As a cross-check, the system's resource manager logs PSS for each process (`resmgr-pss-logger` lines, saved in `docs/vega/perf-raw/memory-system-pss-log.txt`). In one run, the app process was at 156.3 MB PSS on the title screen and 166.8 MB in the lobby. The separate WebView renderer service (`com.amazon.webview.renderer_service`) was at 109.2 MB PSS. Together the two processes come to about 259 MiB, close to the activity monitor figure, so that figure most likely includes the renderer. The lobby is the furthest point you can reach with the remote alone. Memory during actual play was measured later in a live game with four scripted phones; see "A live game on the Vega Virtual Device" below.

#### Frame rate

There was no UI-fluidity number at first (one was added later, see "UI fluidity" under "A live game on the Vega Virtual Device"). The KPI Visualizer's `ui-fluidity` test and its memory tests (`foreground-memory`, `memory`) both need an Appium server, which is not part of the SDK install. Run without it, the tool stops with "Appium server is not found in the platform". The cold-start trace does log how many frames the compositor presented for the app's surface during each roughly 12 s launch window. That gave 61.9, 61.5, 55.3, 61.4 and 61.1 fps, a median of 61.4. The tool marks these values as uncapped, and they cover launch and the title screen's idle animation, not gameplay. They show that the title screen renders at the display rate on the virtual device. They are not a UI fluidity score.

## A live game on the Vega Virtual Device

We have no Fire TV hardware. As the closest substitute, we recorded the release package (`accomplice_aarch64_release.vpkg`) on the Vega Virtual Device playing one whole game against the live server in AWS ap-south-1, with four phones joining. Recorded on 23 October 2026 between 12:35 and 12:52 local time (IST), room `TFFW`, classic case "A Rather Final Dinner at Ashby Hall".

- Recording: `docs/vega/vvd-live-game.mov` (2320x1136, 15 min 12 s, 72 MB) and `docs/vega/vvd-live-game.mp4` (1280 wide, 14.5 MB). Both show the virtual device's whole window, including its on-screen remote. There is no sound: macOS window capture records picture only, and the voices played through the laptop speakers.
- Key frames: `docs/vega/frames/01-title.png` to `07-reveal-accomplice.png`, plus `08-bug-stale-lobby-caption.png`.

### How it was run

- **TV:** the Vega app, driven only by remote key presses from the device shell (`inputd-cli button_press KEY_ENTER`, `KEY_DOWN`, `KEY_PLAYPAUSE`).
- **Room code:** read from the QR code on the TV. A window screenshot was decoded with macOS Vision's barcode detector, which returned `https://<joinBase>/p?room=TFFW`. The code was then confirmed with `GET /api/rooms/TFFW` (phase `lobby`, no players).
- **Phones:** four headless Chromium phones (Playwright, separate contexts, iPhone 15 and Pixel 7 profiles) joined through the HTTPS `joinBase` from `/api/health`, at `<joinBase>/p/?room=TFFW`. They used the same join, typed-question and vote steps as the e2e harness (`e2e/src/harness.mjs`, `e2e/src/game.mjs`). Questions were typed with the phone's "Type instead" fallback, not spoken. Every answer came from the live model, and every voice was live Polly.
- **Capture:** the first 12 minutes were recorded at 30 fps with a small ScreenCaptureKit window recorder. That stream was then cut off by macOS ("The user stopped the stream"). The last 3 minutes are built from window screenshots (`screencapture -l <window id>`), taken about 2 per second and placed on their real timestamps, so that part looks choppier. About 1 min 45 s between the two parts was not captured: the free question to Ned and the start of round 3. After 12:52:14, window capture returned only black frames, because the window was no longer visible on the Mac. The app was still running on the device (`vega device running-apps`), but the final results screen was not recorded.

### Timeline of the recording

| Time | What is on the TV |
|---|---|
| 0:00 | Title screen. OK on "Host a game". |
| 0:10 | Lobby with QR code and room code TFFW. Four phones join (Ada, Bram, Cleo, Dev) by about 0:58. |
| 1:00 | OK on "Open the case". Briefing: title card, victim, the five suspects, then "One of them did it". |
| 2:00 | Practice round. Ada asks Hobbs "Who was the last person to see Sir Hector alive?". His answer is captioned: "If you insist." ... "nothing but the rain." |
| 2:20 | Round 1 board: clue cards, floor plan, suspect row. Bram asks Ned and Cleo asks Lady Imogen (typed on the phones). |
| 6:15 | The TV starts showing the round-1 answers, more than two minutes after the server had them (see problem 1). The captions run word by word ("Let me think." ... "with me."). |
| 7:00 | The server's round clock moves the room to round 2. The TV stays frozen on the end of Ned's answer ("with me.") for about 2.5 minutes. |
| 9:40 | After a Play/Pause press on the remote, Lady Imogen's answer plays with captions, then freezes on its last words again. |
| 10:50 | Round 3 starts, and an "Emergency meeting" vote appears on the TV. |
| 11:58 | The 30 fps part ends. About 1 min 45 s is not captured. The rest comes from screenshots. |
| 12:00 to 13:00 | Lady Imogen's answer, frozen on "pleasure.". |
| 13:10 | Accusation screen, "Who did it?". All four phones vote. |
| 13:40 to 15:12 | Reveal: "How it was done" in 7 steps, "It was Colonel Rupert Hargreaves", GUILTY, the confession, and "Cleo was the Accomplice. GOT AWAY". |

### Measurements during the game

Memory was measured the same way as `apps/vega/scripts/measure-memory.sh`: `vega exec perf activity-monitor --app-name com.accomplice.tv.main`, recorded while the game was running, using the median of the "Memory Application" column. This was one game, so each row is a single window of samples, not a median across runs.

| Moment | Memory Application (median) | Samples | CPU Application % (median) |
|---|---|---|---|
| Title screen, before hosting (pre-check) | 248.0 MiB | 10 | n/a |
| Investigate, round 2 (answer caption on screen, music bed playing) | 287.4 MiB | 7 | 81% (63 to 100) |
| Reveal | 294.8 MiB (292.9 to 294.9) | 37 | 47% (20 to 133) |

Raw data: `docs/vega/perf-raw/memory-live-game-*.txt`. A first window during round 1 returned no samples. A tool started in the background with `nohup` printed nothing, so it was run again in the foreground. Memory during the game was about 27 to 35 MiB above the lobby figure (260 MiB) and stayed flat during the reveal. CPU on the emulator says nothing reliable about a stick's CPU.

### UI fluidity (KPI Visualizer, with Appium)

The KPI Visualizer's `ui-fluidity` test needs Appium plus Amazon's Appium driver for Vega. Neither comes with the SDK. Both were installed locally, outside the repo: `appium@2.19.0` (the driver needs Appium 2) and `@amazon-devices/appium-kepler-driver@3.33.1` (`appium driver install --source=npm @amazon-devices/appium-kepler-driver`, with `APPIUM_HOME` pointing at a scratch folder). With those on `PATH`, the test ran:

```sh
vega exec perf kpi-visualizer --app-name com.accomplice.tv.main --kpi ui-fluidity \
  --test-scenario docs/vega/perf-raw/ui-fluidity-test-scenario.py --iterations 3 \
  --monitor-processes webview.renderer_service
```

The scenario (`docs/vega/perf-raw/ui-fluidity-test-scenario.py`) waits 10 s for the title screen, then sends 16 D-pad presses (right, right, left, left, four times, 0.7 s apart) through the driver's `injectInputKeyEvent`. Each press moves the focus ring between "Host a game", "How to play" and "Settings". The test does not cover in-game screens, which need phones in the room. Results (23 October 2026, aarch64 release package):

| Metric | Value | Samples |
|---|---|---|
| Fluidity % | 78.9 (78.8 to 78.9) | 2 iterations (the tool found no app surface in the first of 3) |
| Granular fluidity % | 78.7 mean (66.7 to 96.4) | 86 windows, marked statistically sound by the tool |
| 3+ consecutive dropped frames | 0.5 mean (0 to 1) | 2 iterations |
| 5+ consecutive dropped frames | 0 | 2 iterations |
| GWSI average FPS (side output) | 75.7 and 76.9 | 2 iterations, about 960 frames in 12.5 s each |
| Key-press and input-to-frame latency | not reported | the tool's trace had no input events, so these came back null and the run ends with "VALUE VALIDATION FAILED" for these four values only |

The tool itself warns that numbers from a virtual device are not real-device numbers. A fluidity score near 79% while the frame rate is above 60 fps probably reflects uneven frame pacing on the emulator, not dropped frames on a stick. Report: `docs/vega/perf-raw/ui-fluidity-kpi-report-2026-10-23_13-04-33.json`.

### Problems found on the device

1. **Voice lines never finish on the Vega WebView, so the TV falls behind the game (serious).** On the device, a suspect's or narrator's voice line plays to its last word, but the caption then freezes on that word ("with me.", "pleasure.") and the next line never starts. In this run, Ned's round-1 answer stayed on screen through the start of round 2, and answers showed up minutes after the server had them. One answer (Pippa, asked in round 2) only appeared on the accusation screen. In `apps/tv-web/src/audio/audio.ts`, `speak()` resolves only on the audio element's `ended` or `error` event. `perform()` in `apps/tv-web/src/audio/director.ts` waits on that with no time limit. The Vega WebView apparently does not fire `ended` (or stalls just before it), so the line queue blocks for good. Pressing Play/Pause on the remote sometimes freed it. The same block happens invisibly when the screen changes: Hobbs's practice line was stuck after the tutorial screen had gone, which delayed round 1's answers. Suggested fix: a watchdog in `perform()` that ends the line after `max(estimateMs(line), audio.duration) + ~1.5 s`, or when `currentTime` stops advancing near the end. This was not seen in desktop browsers.
2. **A stale lobby caption sits on top of the briefing** (`frames/08-bug-stale-lobby-caption.png`). "NARRATOR: Scan the code or enter room code TFFW" stays on screen through the briefing slides and overlaps the briefing's own narrator caption. Same cause as problem 1: the lobby line never ended.
3. **A caption overlaps the accusation title** (`frames/06-vote.png`). Pippa's late answer ("PIPPA QUILL / Oh, sweetie.") is drawn on top of "THE MOMENT OF TRUTH / Who did it?". This only happens because of problem 1, but suspect captions should not show on the accusation screen.
4. **The stuck answer shows through the Emergency meeting panel.** The frozen Lady Imogen question and caption are still visible faintly behind the semi-transparent panel.
5. **The "Lying or truthful?" box covers part of the floor plan** on the round 1 board (`The house` panel): the Great Hall, Dining Room and Pantry labels are hidden behind it.
6. **The vote counter on the TV stayed at "0 of 4 votes sealed"** in the frames captured before the reveal began. The phones locked in their votes at 07:21:04 to 07:21:05 UTC and the server went straight to the reveal, so this may only be timing.
7. **The rounds moved on without the remote.** Rounds 1 and 2 ended on the server's round clock while the TV was still playing old answers. This is server behaviour, not a device bug. Combined with problem 1, though, the table never got to hear answers before the round ended.

## Screenshots

The on-device `screenshooter` fails with a permission error, and the CLI has no screenshot command. These screenshots capture the virtual device's macOS window: the window id comes from `CGWindowListCopyWindowInfo` (owner `vega-virtual-device`, title "Vega Virtual Device"), and the capture command is `screencapture -x -o -l <window id> file.png`.

## Known limits

- Not tested on Fire TV hardware. All numbers are from the virtual device on a laptop.
- The app needs the live game server. Without it, the app shows the offline page and nothing else.
- The server is plain HTTP. Allowing it uses a manifest section that isn't documented yet (see above).
- The Vega Virtual Device sometimes goes offline right after it reports ready. `judge-run.sh` retries for this.
- The lobby's phone join address comes from the server's configuration, not from the TV app. During this test it showed a `trycloudflare.com` tunnel address rather than the load balancer. Check it before a demo.
- Packages are signed by the local SDK for development. A Fire TV needs developer mode to install them, and they are not store builds.
