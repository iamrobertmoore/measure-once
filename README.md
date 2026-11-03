<p align="center"><img src="docs/brand/demo.gif" alt="A clip of my living room window: the sheet of A4 is found, a tape snaps across the frame, the photo flattens into a front-on drawing and the pole is drawn to scale with the cut marked" width="880"></p>

<p align="center"><img src="docs/brand/readme-banner.svg" alt="Measure Once: film your window, get the right size first time" width="880"></p>

<p align="center"><b>A sizing desk for people who make things to measure. The buyer films their window; I get the size, the cut and a drafted reply to approve.</b></p>

<p align="center"><a href="https://measure-once.vercel.app"><b>Try it live, on your own window</b></a> · <a href="https://www.youtube.com/watch?v=TBD">3-minute video</a> · <a href="#measured-against-a-tape">Measured against a tape</a> · <a href="#run-it-yourself">Run it yourself</a></p>

I make reclaimed-wood curtain poles in Whitstable and sell them on Etsy. Poles come in fixed lengths, the buyer cuts theirs down at home, and a cut pole can't come back. So a lot of my day is people asking which size to order, and every answer starts with "could you measure from here to here".

Measure Once is the desk I wanted for that. The buyer films their window for a few seconds with a sheet of A4 (or US Letter) taped flat on the wall and says what they want. SAM 3.1 finds the sheet, the window and their hands. My code turns pixels into centimetres, using the sheet's known size. Muse Spark looks at the edges the code found and decides which ones the pole has to span. My catalogue rules pick the pole and the cut, Muse Spark drafts my reply in my words, Muse Image shows the pole on their own wall, and I check it and press send.

It's built around my shop, but the measuring isn't tied to it. The page has a second catalogue, a made-to-measure roller blind using the usual trade rules, and the same clip gives that maker the width to order inside the recess or outside it. Blinds, shutters, curtains and tracks all start with the same question.

## Try it

No login, nothing to install.

| Try this | What happens |
|---|---|
| Open [the page](https://measure-once.vercel.app) and pick **Your window** | Tape a sheet of A4 or US Letter on the wall beside any window, film it or take two photos, and it measures yours. Nothing is stored. |
| Pick **Living room, shutters** | My own window: the sheet is found, a tape snaps across the frame, and the photo flattens into a scale drawing with the pole, the cut and where I pointed |
| Press **Run it live** | The whole pipeline runs again on that clip, on Meta's models, in about 67 seconds |
| Pick **Small window in a recess** | Muse Spark picks the recess opening on the wall, not the frame set back inside it. I'd said 59 cm; the reply gives sizes for both and asks which edges I meant |
| Switch to **Roller blind** | Same clip, same measurement, another maker's rules: the width to order inside the recess or outside it, and a reply in that maker's voice |
| Pick any of the last three clips | No sheet, a curled sheet, a steep angle: it refuses and says how to film it again, instead of guessing |

## Why not just a tape measure?

Buyers do have tape measures. What goes wrong is which edges they measure, and whether they say so: the frame or the trim, the glass, the recess or the wall around it. Every sizing thread in my inbox starts with me asking that. A clip shows me the window itself, so the size, the edges and the cut can all be settled in one reply.

I read my last 125 buyer threads. 29 were about which size to order, about 1 in 4 of everything. My replies ran to 77 words on a normal day and 263 on a hard one, and buyers waited a median 10 hours for an answer. Big online blind retailers sell or bundle measuring guarantees for this reason ([example](https://www.selectblinds.com/satisfaction-guarantee.html)). A one-person shop can't, so the size has to be right first time.

## Check every claim in five minutes

| Claim | Evidence | How to check |
|---|---|---|
| It's 2.3 cm from a steel tape, median; the poles it chose would all have fitted | 7 real windows, 4 of them outside my house: 5 measured (worst 5.5 cm, a recess), 2 refused rather than guessed. Cut to the measurement, 5 of 5 poles would still fit the tape's width (16.5 cm, 18.5 cm, 14.5 cm, 19.0 cm, 16.5 cm past each side) | [Measured against a tape](#measured-against-a-tape) |
| The geometry earns its place | Asked to read the width straight off the same frames, Muse Spark alone said 210 cm and 105 cm, and its readings of single frames spread by up to 60 cm | [The baseline](#muse-spark-alone-versus-the-measuring-code) |
| The reply can't add a length of its own | Every length in a draft, with its unit, must be one the code computed or the buyer said; anything else is rejected. It can't stop a real number landing in the wrong sentence, which is why I read every draft before it goes | [`src/agent.ts:121`](src/agent.ts#L121), tested in `test/checker.ts` |
| It knows when not to answer | Three clips filmed to fail (no sheet, curled sheet, steep angle): refused 3 of 3, all three on the page | Pick them on the live page |
| Nothing in the photo changes except the pole | Only SAM's cut-out of the painted pole is pasted back onto the original | [`src/render.ts:60`](src/render.ts#L60) |
| It works on your window, not just mine | **Your window** on the page sends your frames to the same pipeline | [`api/upload.ts:13`](api/upload.ts#L13) |

## What happens to one clip

<p align="center"><img src="docs/brand/architecture.svg" alt="Clip in; SAM 3.1 finds the sheet, window and hands; code measures; Muse Spark picks which edges the pole spans; catalogue picks the pole; Muse Voice Transcribe hears the request; Muse Spark drafts the reply; Muse Image and SAM 3.1 show the pole; the maker approves" width="880"></p>

1. **The buyer films the window** with the sheet on the wall, and talks: "eyelet curtains, from about here to here."
2. **SAM 3.1** segments the sheet and the window on the sharpest frames, and tracks the buyer's hands through the whole clip in one video call.
3. **My code works out millimetres.** The sheet's known size (A4 or US Letter, told apart by its shape) fixes the scale and the window's straight edges fix the angle of the wall. The window is measured to the outside of its trim, where a tape would go, and the frames have to agree.
4. **Muse Spark picks the span.** The code draws every strong vertical edge it finds on the wall beside the window as a lettered line, and Muse Spark picks the pair the pole has to span, from the picture and what the buyer said. Up to five frames vote; the code measures between the chosen lines.
5. **Muse Voice Transcribe** hears the request, with curtain words passed as keywords.
6. **My catalogue rules** pick the pole: 15 to 20 cm past the opening each side, the shortest stock length that works, the cut taken equally off each end so the join stays central.
7. **Muse Spark** drafts my reply in my voice from those numbers. If the buyer said a length that disagrees with ours, the reply gives both sizes and asks.
8. **Muse Image** paints the pole on their window, and **SAM 3.1** cuts the painted pole back out, so only the pole is added.
9. **I approve and send.**

For my living room window it recommends the **300 cm pole cut to 255 cm**, taking **22.5 cm off each end**.

## How Meta's models are used

| Model | The job | Code |
|---|---|---|
| SAM 3.1, images | Finds the A4 sheet and three readings of the window (frame, surround, wooden frame) on each sharp frame | [`src/measure.ts:131`](src/measure.ts#L131) |
| SAM 3.1, video | Tracks the buyer's hands through the whole clip in one call: where they pointed, and which frames to set aside (on full clips; an upload from the page sends frames only, to stay fast and small) | [`src/pipeline.ts:220`](src/pipeline.ts#L220) |
| Muse Spark 1.3, looking | Picks which of the lettered edges the pole spans: the trim, or a recess opening around a set-back window | [`src/span.ts:103`](src/span.ts#L103) |
| Muse Voice Transcribe | Hears what the buyer wants, biased to English with curtain words as keywords | [`src/pipeline.ts:49`](src/pipeline.ts#L49) |
| **Muse Spark Open** (open weights, `meta-models/muse-spark-open`, served on Baseten) | Writes the reply: picks among the options the code computed and drafts it in my voice, reconciling the buyer's own numbers. On the 5 recorded clips every draft passed the number check first time, in about 3 s each. Every live run says which model wrote its draft | [`src/open.ts:24`](src/open.ts#L24) |
| Muse Spark 1.3, writing (fallback) | Takes over the draft by itself if Baseten can't answer, so a run never stops | [`src/agent.ts:84`](src/agent.ts#L84) |
| Muse Image 1.0 | Turns a flat pole drawn in exact perspective into a photoreal pole on the buyer's wall | [`src/render.ts:52`](src/render.ts#L52) |
| SAM 3.1 on Muse Image's output | Cuts out only the painted pole, so nothing else in the buyer's photo changes | [`src/render.ts:60`](src/render.ts#L60) |

The split is deliberate. The models see, choose, hear, write and paint. The numbers come from geometry and my catalogue, and the checker ([`src/agent.ts:121`](src/agent.ts#L121)) holds the reply to them.

## Measured against a tape

7 real windows, each measured with a tape: 3 in my house and 4 elsewhere, filmed on a phone the way a buyer would. Plus 3 clips filmed to fail.

| Window | Where | Tape | Measure Once | Difference |
|---|---|---|---|---|
| Living room (shutters) | my house | 222.0 cm | 219.8 cm | −22 mm |
| Bathroom (wooden surround) | my house | 119.0 cm | 121.0 cm | +20 mm |
| Small bathroom window in recess (recess opening) | my house | 59.0 cm | 53.5 cm | −55 mm |
| Window in a recess (recess opening) | elsewhere | 57.0 cm | 60.2 cm | +32 mm |
| Small window (sheet below it) | elsewhere | 63.0 cm | 60.7 cm | −23 mm |
| Bedroom window behind a bed | elsewhere | not needed | refused | the frames don't agree |
| Wide glazed doors from a side angle | elsewhere | not needed | refused | no sheet found |

Clips filmed to fail (no sheet, a curled sheet, a steep angle): refused 3 of 3, each with the right reason.

Over the 5 windows it measured, the median error is 2.3 cm and the worst 5.5 cm; on the 3 plain windows it's within 2.3 cm. The question that matters is whether the pole would fit: cut to each measurement, the pole sits 16.5 cm, 18.5 cm, 14.5 cm, 19.0 cm, 16.5 cm past each side of the width the tape measured, so 5 of 5 would fit (4 inside my usual 15 to 20 cm). The 2 recessed windows are the hard ones (−55 mm and +32 mm): the frame sits back from the wall, so Muse Spark picks the recess opening on the wall and the code measures that. When the buyer's own number differs, the reply says both and sizes both, for example: "If we use your 59 cm it would be the 120 cm pole cut to 94 cm, that is 13 cm off each end."

Two windows were refused rather than guessed: one had the sheet resting on top of the frame instead of flat on the wall, the other was filmed from a sharp side angle with one side hidden behind a machine. A refusal costs the buyer ten seconds of filming; a wrong size costs a pole.

### Muse Spark alone versus the measuring code

The same frames, with Muse Spark asked to read the width straight off the picture using the sheet as a scale:

| Window | Tape | Muse Spark alone (median of frames) | Its range across frames | Measure Once |
|---|---|---|---|---|
| Living room | 222.0 cm | 210 cm | 185 to 245 cm | 219.8 cm |
| Bathroom | 119.0 cm | 105 cm | 86 to 110 cm | 121.0 cm |
| Recess opening | 59.0 cm | 50 cm | 44 to 60 cm | 53.5 cm |

Muse Spark knows which edges matter (alone, it went for the recess opening too), but it can't measure them. The code measures well but can't tell which edges matter. Together they do both. `scripts/baseline-spark.ts` re-runs this.

## Live and recorded

- **Recorded:** each of my clips opens on a run recorded with this code, so the page is instant. Its real end-to-end time is shown under the drawing (about 67 s; the slowest was 102 s).
- **Live:** **Your window**, **Run it live** and **Show the pole** call Meta's models there and then. A daily cap on each server, and a spend limit on the Meta account, keep the public page from running up a bill.
- **Approve and send** emails the reply to a demo inbox I own. The page never asks a visitor for an email address, and an uploaded clip isn't kept.

## Run it yourself

Needs Node 20.17 or later, ffmpeg, and a Meta Model API key.

```bash
git clone https://github.com/iamrobertmoore/measure-once && cd measure-once
npm install
export MODEL_API_KEY=your_key
npm start                                         # the page at http://localhost:3000, with live runs and uploads
npm run measure -- samples/bathroom/source.mp4    # one clip from the command line
npm test                                          # geometry, catalogue and reply-checker tests
```

## Challenges I hit, and the fixes

- **A small sheet can't set the wall's angle on its own.** At A4 size, one pixel at a corner is 1% of the scale. The sheet and the whole window are fitted together: the sheet sets the scale, the big window sets the angle ([`src/geometry.ts:396`](src/geometry.ts#L396)).
- **Masks are a few pixels fat or thin, and that's 3 cm.** On simulated frames a 2 to 3 pixel mask bias gave 30 to 38 mm of error, and averaging didn't remove it. SAM finds each side; the pixels place it (0.1 to 0.2 mm on the same frames).
- **The window came out 6 cm short.** I looked at the corners: the line sat on the inner side of the architrave's moulding, about 20 pixels in at the top. Edges are now taken where the profile first leaves the wall, which is where a tape goes ([`src/geometry.ts:206`](src/geometry.ts#L206)). Each side gets its own colour contrast, because a white surround on a cream wall is lit differently left and right ([`src/measure.ts:91`](src/measure.ts#L91)).
- **A picture frame pulled the sheet's edge.** A hanging picture's wooden bar sat just above the sheet and dragged its top edge up by 9 pixels. Samples where the "outside" is brighter than the sheet are now ignored ([`src/geometry.ts:205`](src/geometry.ts#L205)).
- **The recess.** The tool measured the frame, set back in the recess, and I'd measured the opening on the wall: 11.7 cm apart. Asked for coordinates, Muse Spark was out by up to 100 pixels; asked to pick between lettered lines the code had found, it was consistent, 3 of 3. Its first picks wandered between a reveal edge and a wall corner, so candidates are now limited to a narrow band beside the window, and a wider span is only taken when frames agree within 25 mm ([`src/span.ts:103`](src/span.ts#L103)).
- **The buyer and the tool can both be right.** Lengths the buyer says out loud are picked out ([`src/agent.ts:147`](src/agent.ts#L147)). When they disagree with the measurement, the reply must give both sizes; if Muse Spark leaves one out twice, the code writes that sentence itself from the computed option.
- **Hands everywhere.** Buyers point while they film. Frames are only set aside when a hand covers the sheet or a side of the window ([`src/pipeline.ts:251`](src/pipeline.ts#L251)), and a slow hand-tracking call can't hold up the size ([`src/pipeline.ts:225`](src/pipeline.ts#L225)).
- **SAM sees several windows in one window.** Frame, trim and surround all come back. The reading seen in the most frames wins, unless a wider one is clearly wider.
- **Muse Image moves things.** The painted pole can drift from where the code placed it. Only SAM's pole mask inside the planned region is kept, gaps are closed, a short cut-out gets one retry, and the exact drawn pole is the fallback.
- **Rate limits.** Ten frames times four prompts at once hit the limit. SAM calls share a small queue with backoff, and the hands moved to one video call.

## How this maps to the judging

- **Impact:** a problem from my own inbox, with numbers. A second maker's catalogue (roller blinds) runs on the same measurement, and anyone can try it on their own window.
- **Use of Meta's tooling:** SAM 3.1 on images, video and Muse Image's output; Muse Spark both looking (which edges) and writing; Muse Voice Transcribe; Muse Image. The models see and choose, the code measures.
- **Technical depth:** a joint wall-plane fit, sub-pixel edges to the outside of the trim, frames that must agree, a model-alone baseline, a unit-aware number checker, and a tape-measured test set with clips filmed to fail.
- **Demo:** a live page with no login that measures your window, and runs the whole pipeline on demand.

## Built for the Meta Global AI Developer Hackathon

Everything here was written during the event (26 October to 4 November 2026). The clips are of my house and of 4 windows in other homes. MIT licence.
