# Pending work

What's left after the October 2026 work: Muse's feedback on players zooming across the court, then everything that
was pending (full court, steals, Pivot & Protect, bubbles, the smoke test, questions, path links, print questions,
reserved names, link previews per play). Delete items as they're done.

## 1. Check on the live site

At https://karthikpds.github.io/hoops/, after the deploy. The smoke test checks all of these on localhost, but not on
a phone or in a real messaging app.

- **Offline on a phone:** open the site once, wait a few seconds, switch to airplane mode, then reload. It should
  still work, with the "No internet right now" note. The cache name changed to `hoops-v2`, so this is also the first
  real test of an update replacing the old copy.
- **A play's preview card:** "Copy link" now copies `…/p/<id>/` once the page finds the share pages. Paste one into a
  messaging app: the card should show that play's name, idea and picture, and tapping it should open the play.
- **The full-court plays on a phone:** Press Break and Diamond Press, at normal speed, to see that the view following
  the ball is easy to watch on a small screen.

## 2. Ideas that came up

- **Red can't shoot,** so Diamond Press and Corner Trap end with the steal instead of points. On a full court, red
  could shoot at its own hoop, at (250, 887.5): shots, `isThree`, missed-shot bounces and the celebration would need
  to know which hoop.
- **Facing for defenders.** Only Pivot & Protect uses `face`. Defense plays could show defenders facing their player,
  or turning to see both the ball and their player in Deny the Ball and Help Side.
- **Questions on the full court.** The view frames the ball and a "where" answer, but a "Who's open?" answer far up
  the court could be outside it. Press Break avoids that by asking "where"; a new full-court play with "ask" should be
  checked on a phone.
- **Bubbles:** 5 of 244 still touch a player a little (Beat the Box-and-One step 5, Horns Twist step 1, Pick and Pop
  step 5, UCLA Cut step 2, Zipper step 6). Small, but `bubbleBoxes` could try more spots.

## Decided against

- **Saving progress** (watched ✓, quiz scores): not wanted. Nothing about the user is stored in the browser.
- **Curl Cut** as its own play: Down Screen already teaches the curl read.
- **Questions for Jab Step and Switch!** Jab Step's moves are too short to tap (a "where" needs more than 70 units),
  and in Switch! the right spot for X1 depends on where 2 rolls, which kids haven't seen yet.
