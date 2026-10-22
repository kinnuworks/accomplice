# Accessibility on the phone

The phone is where each player plays, so it has to work for everyone at the table: blind and low-vision players, Deaf and hard-of-hearing players, people with tremors or one free hand, and people who just turned their text size up. This is what we built and how to check it.

## What we did

**Structure**
- One `h1` per screen, then `h2` and `h3` in order. When the game moves to a new phase, focus moves to the new screen's heading, so a screen reader announces where you are.
- Real HTML controls everywhere: buttons, radio groups inside `fieldset` and `legend`, labelled inputs, a native `dialog` for Settings and My role (focus is trapped and Escape closes it).
- Picking a suspect, an avatar, a tone or an accusation uses native radio buttons. Each one is stretched invisibly over its card, so touch exploration finds it where you see it.
- The investigation tabs follow the tab pattern: arrow keys, Home and End, `aria-selected`, linked panels.

**Hearing what happens**
- Two live regions exist from the first paint: a polite one for news and an assertive one for errors.
- Announced: new private clues, phase changes, narrator lines, every suspect reply ("Ivy Marchetti says: ..."), what the mic heard, when a question is sent, and errors.
- Nothing is announced while the mic is open, so the screen reader voice does not end up in your question.
- "Read my clues" reads every private clue aloud. It asks the game's narrator first, and uses the phone's own voice if no narrator audio arrives within two seconds.
- Settings has "Read replies on my phone" for players using headphones.

**Talking without a custom gesture**
- The talk button works in two ways. Press and hold, then let go. Or tap once to start and tap again to stop. A double tap from VoiceOver or TalkBack counts as a tap, so screen reader users never need a held gesture. Keyboard and switch users get the same toggle.
- The role envelope works the same way: hold to peek, or tap to open and tap to close. When opened with a screen reader or keyboard, focus goes to the role card. The role text is removed from the page whenever the envelope is closed, and it closes itself if the phone is locked or you switch apps.
- Before anything is sent, you can read and edit what the mic heard.
- Typing always works. If the mic is blocked, missing, or the page is not on a secure link, the phone tells you why in plain words and opens the typing box.
- Starting and stopping the mic gives a short sound (rising, then falling) and a vibration, where the phone supports it. Both can be turned off in Settings.

**Seeing and touching**
- Every target is at least 48 by 48 CSS pixels. The talk button is 80 pixels tall and sits at the bottom of the screen, within reach of your thumb.
- Body text is 17px, sized in `rem`. On iPhone the page follows the system text size (Dynamic Type). There is also a "Bigger text" switch.
- At 200% text size nothing scrolls sideways. The screenshot script checks this on every run.
- Light text on dark plum, with contrast checked by axe. With `prefers-contrast: more`, muted text and borders get stronger. With `forced-colors` (Windows High Contrast), controls get real borders and the selected state uses the system Highlight colour.
- Gold foil, shimmer, card tilt, pulses and envelope flaps all switch off with `prefers-reduced-motion`.
- Inputs use 16px or larger text, so iOS does not zoom in on focus. Pinch zoom is never blocked.

**Time**
- The phone never acts on a timer. If the server sends a soft deadline, the phone shows it once in a while ("About 2 minutes left") and says the host can always give more time. Nothing is sent for you when time runs out.
- Toasts stay for 7 seconds, can be dismissed, and are also announced, so nothing important exists only in a toast.

## Automated checks

```
pnpm --filter @accomplice/phone screenshot
```

This captures 19 screens in demo mode at iPhone 15 size and runs axe-core on each one (WCAG 2.0, 2.1 and 2.2 A and AA, plus best practices). It also checks for sideways scrolling at 200% text and plays through join, lobby, role, investigate and a held-to-talk question. Current result: 0 violations on every screen, and no sideways scrolling.

## Testing by hand

Open `http://<your-computer>:5174/p/?demo=1` on the phone. Demo mode runs a whole game on its own. Add `&at=investigate`, `&at=role&as=accomplice` and so on to jump to a screen.

> The mic needs a secure link (https or localhost). Over plain http on your home network, the phone will offer typing instead. That is expected.

### VoiceOver (iPhone)
1. Settings > Accessibility > VoiceOver, on. A triple click of the side button is a handy shortcut.
2. Join: swipe through. Each field reads its label and hint. Submit with an empty name and check that the error is read and focus lands on the name field.
3. Lobby: swipe through the guest list. The host hears the "Choose the mood" radio group and the Start button.
4. Role: double tap "Hold to peek at my role". Focus should move to "Detective" or "Accomplice". Double tap the envelope again to hide it, and check that the role text is gone.
5. Investigate: the rotor's Headings list should show "Question the suspects". Pick a suspect (each one reads as a radio button with name and role). Double tap "Hold to ask", speak, then double tap again. You should hear "I heard: ...", with focus in the question box. Double tap "Ask".
6. When the suspect answers on the TV, VoiceOver reads "Name says: ..." without moving focus.
7. My clues: double tap "Read my clues".
8. Accuse: choose, review, "Lock it in". Votes are announced as they come in.

### TalkBack (Android)
1. Settings > Accessibility > TalkBack, on.
2. Repeat the steps above, using double tap to activate. Swipe right and left to move, and the reading controls to jump by headings.
3. On the Investigate tabs, check that TalkBack reads "tab, 2 of 3, selected".
4. Turn on Settings > Accessibility > Remove animations, and check that nothing shimmers or slides.

### Other quick checks
- Text size: set the phone to its largest text and play a round. Nothing should be cut off or need sideways scrolling.
- Keyboard: on a laptop, Tab through every screen. The focus ring is a bright gold outline. Space and Enter work everywhere, including the talk button and the envelope.
- Sound off: with the phone muted, every event still shows on screen (latest answer, narrator line, new clue badge).

## Known gaps
- iPhone Safari has no vibration API, so iPhone players get the sound cue only.
- Screen reader speech can be picked up by the mic if the phone's speaker is loud. Headphones help. Typing avoids it completely.
- The protocol has no "more time" message yet, so the phone can only show that the host can extend a round.
