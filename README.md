<p align="center"><img src="docs/brand/demo.gif" alt="A clip of my living room window: the sheet of A4 is found, a tape snaps across the frame, the photo flattens into a front-on drawing and the pole is drawn to scale with the cut marked" width="880"></p>

<p align="center"><img src="docs/brand/readme-banner.svg" alt="Measure Once: film your window, get the right size first time" width="880"></p>

<p align="center"><b>A sizing desk for people who make things to measure. The buyer films their window; I get the size, the cut and a drafted reply to approve.</b></p>

<p align="center"><a href="https://measure-once.vercel.app"><b>Try it live, on your own window</b></a> · <a href="https://measure-once.vercel.app/rob">My buyer link</a> · <a href="https://www.youtube.com/watch?v=TBD">The video (2:58)</a> · <a href="#measured-against-a-tape">Measured against a tape</a> · <a href="#run-it-yourself">Run it yourself</a></p>

I make reclaimed-wood curtain poles in Whitstable and sell them on Etsy. It's a real shop, [Creationsfromrob](https://www.etsy.com/shop/creationsfromrob), open since 2020, with nearly 800 sales and a 4.7-star rating from 119 reviews, and every number below comes from my own inbox, my own windows and my own catalogue. Poles come in fixed lengths and get cut to fit, and a cut pole can't come back. So a lot of my day is people asking which size to order, and every answer starts with "could you measure from here to here".

Measure Once is the desk I wanted for that. The buyer films their window for a few seconds with a sheet of A4 (or US Letter) taped flat on the wall and says what they want. SAM 3.1 finds the sheet and the window, and on full clips tracks their hands. My code turns pixels into centimetres, using the sheet's known size. Muse Spark Open, Meta's open-weights model (on Baseten), looks at the edges the code found and decides which ones the pole has to span. My catalogue rules pick the pole and the cut, Muse Spark Open drafts my reply in my words, Muse Image shows the pole on their own wall, and I check it and press send.

It's set up for my real buyers now: the link [measure-once.vercel.app/rob](https://measure-once.vercel.app/rob) is in the saved reply I send any buyer who asks which size to order. They open it on their phone, film the window, and see their size and how sure it is in about a minute; the measurement and a drafted reply land in my own inbox, and nothing goes back to them until I've checked it.

It's built around my shop, but the measuring isn't tied to it. The page has two more catalogues using the usual trade rules: a made-to-measure roller blind (the width to order inside the recess or outside it) and made-to-measure curtains (each curtain's width for pencil pleat or eyelet, and the drop when the clip shows it). The same clip, measured once, sizes all three. Each maker's rules are one small file.

## For judges, in one table

| Criterion | Where to look |
|---|---|
| Impact | [My shop](https://www.etsy.com/shop/creationsfromrob), [my inbox numbers](#why-not-just-a-tape-measure), [three other makers](#what-other-makers-said), and [my buyer link](https://measure-once.vercel.app/rob), which is in the reply I send buyers who ask which size |
| Use of Meta's models | [How Meta's models are used](#how-metas-models-are-used): Muse Spark Open looks (picks the edges) and writes (the reply); SAM 3.1, Muse Voice Transcribe, Muse Image |
| Technical depth | [Measured against a tape](#measured-against-a-tape), the [fair model-alone baseline](#muse-spark-alone-versus-the-measuring-code) and the [edge-pick comparison](#which-edges-does-the-pole-span) |
| Demo | [The video](https://www.youtube.com/watch?v=TBD) and [the live page](https://measure-once.vercel.app): try it on your own window |

## Try it

No login, nothing to install.

| Try this | What happens |
|---|---|
| Open [the page](https://measure-once.vercel.app) and pick **Your window** | Tape a sheet of A4 or US Letter on the wall beside any window, film it or take two photos, and it measures yours. Nothing is stored. |
| Pick **Living room, shutters** | My own window: the sheet is found, a tape snaps across the frame, and the photo flattens into a scale drawing with the pole, the cut and where I pointed |
| Press **Run it live** | The whole pipeline runs again on that clip, on Meta's models, in about 91 seconds |
| Pick **Small window in a recess** | Muse Spark picks the recess opening on the wall, not the frame set back inside it. I'd said 59 cm; the reply gives sizes for both and asks which edges I meant |
| Switch to **Roller blind** or **Curtains** | Same clip, same measurement, another maker's rules: the blind to order inside the recess or outside it, or each curtain's width for the pole, and a reply in that maker's voice |
| Open [my buyer link](https://measure-once.vercel.app/rob) on a phone | What my buyers see: film the window, get the size, the likely range and whether the pole fits across it, then send it to me. It's the real thing, so if you press send, it lands in my inbox |
| Pick any of the last three clips | No sheet, a curled sheet, a steep angle: it refuses and says how to film it again, instead of guessing |

## Why not just a tape measure?

Buyers do have tape measures. What goes wrong is which edges they measure, and whether they say so: the frame or the trim, the glass, the recess or the wall around it. Every sizing thread in my inbox starts with me asking that. A clip shows me the window itself, so the size, the edges and the cut can all be settled in one reply.

I read my last 125 buyer threads. 29 were about which size to order, about 1 in 4 of everything. My replies ran to 77 words on a normal day and 263 on a hard one, and buyers waited a median 10 hours for an answer. Big online blind retailers sell or bundle measuring guarantees for this reason ([example](https://www.selectblinds.com/satisfaction-guarantee.html)). A one-person shop can't, so the size has to be right first time. And it isn't just my shop: in the UK, online sellers are now the largest route to market for curtains and blinds, driven by made-to-measure ordering ([Barbour ABI, 2026](https://store.barbour-abi.com/report/residential-window-coverings-market-report-uk-2026-2030/)), and every one of those orders starts with someone's measurement. A different maker's rules are one small file: the roller blind and curtain catalogues on the live page are [`src/blinds.ts`](src/blinds.ts) and [`src/curtains.ts`](src/curtains.ts).

## What other makers said

I rang three people I know who make things to measure, described it, and wrote down what they said (quoted with their permission):

> "Yes, I'd put this on my listing page. I get lovely photos of people's windows, but usually not the measurement I need! A quick video and a suggested size would give me something to work from. I'd still check it before cutting anything."
>
> <sub>Helen, York, sells curtain poles on Etsy</sub>

> "I'd give it a go for the initial enquiry. Half the conversation is working out whether we're talking about inside or outside the recess. Being able to see what the customer means could save a fair bit of back and forth. I'd want tape measurements confirmed before making the blind, though."
>
> <sub>David, Nottingham, sells made-to-measure blinds</sub>

> "Oh, this could be handy. People get quite worried about ordering the wrong size, then leave it for another week. I'd send them the link when they enquire. If it helps us get the measuring conversation sorted, that's more time for me at the sewing machine."
>
> <sub>Sarah, Frome, independent curtain maker</sub>

Both of the first two want a tape check before anything is cut, which is why every size comes with a likely range and the reply asks for a tape check whenever the recommendation might not hold across it.

## Check every claim in five minutes

| Claim | Evidence | How to check |
|---|---|---|
| It's about 3 cm from a steel tape on a typical window, never more than 5.5 cm; the poles it chose would all have fitted | Today's code, every measured clip re-run 4 times (20 runs): a median 3.1 cm out, worst 5.5 cm (the recorded runs on the page: 2.3 cm). 7 real windows, 4 of them in other homes: 5 measured (worst 5.5 cm, a recess), 2 refused rather than guessed. Cut to the measurement, 5 of 5 poles would still fit the tape's width (16.5 cm, 18.5 cm, 14.5 cm, 19.0 cm, 16.5 cm past each side) | [Measured against a tape](#measured-against-a-tape) |
| The measuring code earns its place | Asked the same question from the same full-size frames, Muse Spark alone was a median 2 cm out but 11 cm out on two windows, and its single-frame answers swung by up to 30 cm. With the code, the worst was 5.5 cm | [The baseline](#muse-spark-alone-versus-the-measuring-code) |
| The model earns its place too | On the same lettered edges, the code's outline alone is 11.4 cm out at worst (it misses both recesses) and the widest edges 40.9 cm; Muse Spark's pick, 5.5 cm | [Which edges?](#which-edges-does-the-pole-span) |
| The reply can't add a length of its own | Every length in a draft, with its unit, must be one the code computed (exactly, or rounded to the whole centimetre) or the buyer said; anything else is rejected. It can't stop a real number landing in the wrong sentence, which is why I read every draft before it goes | [`src/agent.ts:133`](src/agent.ts#L133), tested in `test/checker.ts` |
| It gives the same answer twice, and doesn't copy the buyer's number | Each recorded clip re-run 3 times end to end: 15 of 15 measured, widths within 8 mm of each other, the recesses picked every time. Then 10 more runs on today's code with every length the buyer said hidden from the edge pick: the same pick 10 of 10 times, widths within 11 mm of the recorded runs | [`repeat.json`](public/samples/repeat.json), [`masked.json`](public/samples/masked.json) |
| It says how sure it is | Every size comes with a likely range (2.6 to 5.8 cm each side here), from how much the frames disagree plus how far that kind of window has been from the tape. The tape was inside the range on 5 of 5 windows, and the pole it chose fits across the whole range on 5 of 5. The range is set from these same windows, so I also checked it leaving each window out of its own range: then the tape is inside on 3 of 5. With five windows it's a working estimate, and the reply asks for a tape check whenever the pole might not hold | [`src/sure.ts`](src/sure.ts) |
| One frame isn't enough | On the plain windows, a single frame alone was a median 2.2 cm from the tape but up to 12.1 cm off; the frames' median never more than 2.3 cm | `frames` in each `public/samples/*/run.json` |
| It knows when not to answer | Three clips filmed to fail (no sheet, curled sheet, steep angle): refused 3 of 3, all three on the page | Pick them on the live page |
| Nothing in the photo changes except the pole | Only SAM's cut-out of the painted pole is pasted back onto the original | [`src/render.ts:60`](src/render.ts#L60) |
| It works on your window, not just mine | **Your window** on the page sends your frames to the same pipeline | [`api/upload.ts:13`](api/upload.ts#L13) |

## What happens to one clip

<p align="center"><img src="docs/brand/architecture.svg" alt="Clip in; SAM 3.1 finds the sheet, window and hands; code measures; Muse Spark picks which edges the pole spans; catalogue picks the pole; Muse Voice Transcribe hears the request; Muse Spark Open drafts the reply; Muse Image and SAM 3.1 show the pole; the maker approves" width="880"></p>

1. **The buyer films the window** with the sheet on the wall, and talks: "eyelet curtains, from about here to here."
2. **SAM 3.1** segments the sheet and the window on the sharpest frames, and tracks the buyer's hands through the whole clip in one video call. That call gets 35 seconds and the size never waits for it: on the five recorded runs it found hands on two, and twice it ran over and the size went ahead without it.
3. **My code works out millimetres.** The sheet's known size (A4 or US Letter, told apart by its shape) fixes the scale and the window's straight edges fix the angle of the wall. The window is measured to the outside of its trim, where a tape would go, and the frames have to agree.
4. **Muse Spark Open picks the span.** The code draws every strong vertical edge it finds on the wall beside the window as a lettered line, and Muse Spark Open, the open-weights model, picks the pair the pole has to span, from the picture and what the buyer said (with any lengths they said hidden). Up to five sharp frames vote; the code measures between the chosen lines. If Baseten can't answer, hosted Muse Spark picks instead. (The recorded runs on the page date from before the switch, so there hosted Muse Spark picked; re-run on every clip, Muse Spark Open made the same call all 10 times, with widths within 10 mm.)
5. **Muse Voice Transcribe** hears the request, with curtain words passed as keywords.
6. **My catalogue rules** pick the pole: 15 to 20 cm past the opening each side, the shortest stock length that works, the cut taken equally off each end so the join stays central.
7. **Muse Spark Open** (open weights, on Baseten) drafts my reply in my voice from those numbers. If the buyer said a length that disagrees with ours, the reply gives both sizes and asks.
8. **Muse Image** paints the pole on their window, and **SAM 3.1** cuts the painted pole back out, so only the pole is added.
9. **I approve and send.**

For my living room window it recommends the **300 cm pole cut to 255 cm**, taking **22.5 cm off each end**.

## How Meta's models are used

| Model | The job | Code |
|---|---|---|
| SAM 3.1, images | Finds the A4 sheet and three readings of the window (frame, surround, wooden frame) on each sharp frame | [`src/measure.ts:131`](src/measure.ts#L131) |
| SAM 3.1, video | Tracks the buyer's hands through the whole clip in one call: where they pointed, and which frames to set aside (on full clips; an upload from the page sends frames only, to stay fast and small) | [`src/pipeline.ts:234`](src/pipeline.ts#L234) |
| **Muse Spark Open, looking** (open weights, on Baseten) | Picks which of the lettered edges the pole spans: the trim, or a recess opening around a set-back window. Re-run on every measured clip, it made the same call as hosted Muse Spark (recess opening or not) 10 of 10 times, with widths within 10 mm | [`src/span.ts:123`](src/span.ts#L123), [`masked-open.json`](public/samples/masked-open.json) |
| Muse Spark 1.3, looking (fallback) | Picks the edges if Baseten can't answer; it picked them on the recorded runs | [`src/span.ts:123`](src/span.ts#L123) |
| Muse Voice Transcribe | Hears what the buyer wants, biased to English with curtain words as keywords | [`src/pipeline.ts:51`](src/pipeline.ts#L51) |
| **Muse Spark Open** (open weights, `meta-models/muse-spark-open`, served on Baseten) | Writes the reply: picks among the options the code computed and drafts it in my voice, reconciling the buyer's own numbers. On the 5 recorded clips every draft passed the number check first time, in about 3 s each. Every live run says which model wrote its draft | [`src/open.ts:24`](src/open.ts#L24) |
| Muse Spark 1.3, writing (fallback) | Takes over the draft by itself if Baseten can't answer, so a run never stops | [`src/agent.ts:96`](src/agent.ts#L96) |
| Muse Image 1.0 | Turns a flat pole drawn in exact perspective into a photoreal pole on the buyer's wall | [`src/render.ts:52`](src/render.ts#L52) |
| SAM 3.1 on Muse Image's output | Cuts out only the painted pole, so nothing else in the buyer's photo changes, and checks the painted pole runs the full length that was drawn: under 95% it paints again, under 85% it shows the exact drawn pole instead | [`src/render.ts:60`](src/render.ts#L60), [`src/render.ts:79`](src/render.ts#L79) |

### Which model writes the reply

Each of the 5 measured windows redrafted 3 times by each writer (15 drafts each), with the same numbers, the same prompt and the same number check (`scripts/compare-writers.ts`, results in [`public/samples/writers.json`](public/samples/writers.json)):

| Writer | Drafts | Passed the number check first time | Median time | Median length | Under the 120-word ask |
|---|---|---|---|---|---|
| Muse Spark Open, on Baseten | 15 | 15 of 15 | 3.4 s | 146 words | 2 of 15 |
| Muse Spark 1.3, hosted | 15 | 15 of 15 | 17.1 s | 110 words | 13 of 15 |

Both are accurate; Muse Spark Open is about 5 times faster, which matters when a buyer is waiting on the page, so it writes and the hosted model is the fallback. It writes longer than I asked, which I trim when I check the draft.

The split is deliberate. The models see, choose, hear, write and paint. The numbers come from geometry and my catalogue, and the checker ([`src/agent.ts:133`](src/agent.ts#L133)) holds the reply to them.

## Measured against a tape

7 real windows filmed on a phone the way a buyer would: 3 in my house and 4 in other homes. I measured every tape figure myself with a steel tape, across the outside of the frame or, for a recess, across the opening at the wall face, where the pole goes. It measured 5, each checked with a steel tape, and asked for a re-film on 2. Plus 3 clips filmed to fail.

| Window | Where | Tape | Recorded run | Today's code (median of 4 runs) |
|---|---|---|---|---|
| Living room (shutters) | my house | 222.0 cm | 219.8 cm (−22 mm) | 218.7 cm (−33 mm) |
| Bathroom (wooden surround) | my house | 119.0 cm | 121.0 cm (+20 mm) | 121.0 cm (+20 mm) |
| Small bathroom window in recess (recess opening) | my house | 59.0 cm | 53.5 cm (−55 mm) | 54.1 cm (−49 mm) |
| Window in a recess (recess opening) | elsewhere | 57.0 cm | 60.2 cm (+32 mm) | 60.1 cm (+31 mm) |
| Small window (sheet below it) | elsewhere | 63.0 cm | 60.7 cm (−23 mm) | 60.7 cm (−23 mm) |
| Bedroom window behind a bed | elsewhere | not needed | refused: the frames don't agree | refused |
| Wide glazed doors from a side angle | elsewhere | not needed | refused: no sheet found | refused |

The last column is today's code: each clip re-run four times end to end ([`masked.json`](public/samples/masked.json), [`masked-open.json`](public/samples/masked-open.json)).

Clips filmed to fail (no sheet, a curled sheet, a steep angle): refused 3 of 3, each with a reason and how to film it again.

Over the 5 windows it measured, today's code is a median 3.1 cm out and never more than 5.5 cm (the recorded runs on the page: 2.3 cm and 5.5 cm); on the 3 plain windows it's within 2.3 cm. The question that matters is whether the pole would fit: cut to each measurement, the pole sits 16.5 cm, 18.5 cm, 14.5 cm, 19.0 cm, 16.5 cm past each side of the width the tape measured, so 5 of 5 would fit (4 inside my usual 15 to 20 cm). The 2 recessed windows are the hard ones (−55 mm and +32 mm): the frame sits back from the wall, so Muse Spark picks the recess opening on the wall and the code measures that. When the buyer's own number differs, the reply says both and sizes both, for example: "If we go by your 59 cm I would send the same 120 cm pole cut to 94 cm, which is 13 cm off each end."

Each size also comes with a likely range, and the reply checks the pole against the whole of it, not just the middle. The tape was inside the range on 5 of 5 windows and the chosen pole fits across all of it on 5 of 5; when it doesn't, the reply asks for a quick tape check before anything is cut.

A steel tape isn't perfect either. On a recess or a chunky surround it's easy to be a few millimetres out, and a buyer measuring from the wrong edge can be centimetres out, which is the mistake a clip of the window catches. So read the tape column as the best reference I have, not ground truth.

Two windows were refused rather than guessed: one had the sheet resting on top of the frame instead of flat on the wall, the other was filmed from a sharp side angle with one side hidden behind a machine. A refusal costs the buyer ten seconds of filming; a wrong size costs a pole.

### Muse Spark alone versus the measuring code

The same full-size frames, with Muse Spark asked the same question the pipeline answers (the outside of the trim, or a recess opening at the wall face), using the sheet as its scale:

| Window | Tape | Muse Spark alone (median of its frames) | Its answers across frames | Measure Once |
|---|---|---|---|---|
| Living room | 222.0 cm | 220 cm (−20 mm) | 200 to 230 cm | 219.8 cm (−22 mm) |
| Bathroom | 119.0 cm | 108 cm (−110 mm) | 107 to 111 cm | 121 cm (+20 mm) |
| Recess opening | 59.0 cm | 60 cm (+10 mm) | 50 to 70 cm | 53.5 cm (−55 mm) |
| Recess opening, another home | 57.0 cm | 46 cm (−110 mm) | 44 to 50 cm | 60.2 cm (+32 mm) |
| Small window, another home | 63.0 cm | 65 cm (+20 mm) | 60 to 68 cm | 60.7 cm (−23 mm) |

It's a fair fight, and Muse Spark alone does better than I expected: within 2 cm on three windows. But it was 11 cm out on two, and its answers for one window swung by up to 30 cm from frame to frame, so any single answer is a gamble. The code's worst was 5.5 cm and its frames agree to within millimetres. (Two earlier runs, with a vaguer question and frames shrunk to 1280 px, were 3 to 29 cm out; they're in `baseline.json` and `baseline-2.json`.) `FAIR=1 npx tsx scripts/baseline-spark.ts` re-runs it.

### Which edges does the pole span?

The code finds every strong vertical edge on the wall and letters it. Picking the pair is the model's job, and a simple rule can't do it. The same edges on each clip's main frame, chosen three ways:

| Window | Tape | The code's outline only | The widest edges found | Muse Spark's pick |
|---|---|---|---|---|
| Living room | 222.0 cm | 219.8 cm (−22 mm) | 262.9 cm (+409 mm) | 219.8 cm (−22 mm) |
| Bathroom | 119.0 cm | 121.0 cm (+20 mm) | 124.6 cm (+56 mm) | 121.0 cm (+20 mm) |
| Small window in a recess | 59.0 cm | 47.6 cm (−114 mm) | 53.5 cm (−55 mm) | 53.5 cm (−55 mm) |
| Another home, recess | 57.0 cm | 48.8 cm (−82 mm) | 60.2 cm (+32 mm) | 60.2 cm (+32 mm) |
| Another home, small window | 63.0 cm | 60.7 cm (−23 mm) | 60.7 cm (−23 mm) | 60.7 cm (−23 mm) |
| **Worst** | | **11.4 cm** | **40.9 cm** | **5.5 cm** |

The outline alone misses both recesses; the widest edges catch the recesses but run out to other edges on the living room wall. No single rule gets all five: the model took the outline on the three plain windows and the wider pair on the two recesses. It isn't perfect. On the small recess the code never found the opening's left edge (that side is in shadow), so the best pair on offer was the frame's left side and the opening's right side, which is where its 5.5 cm miss comes from; better edge-finding, not a better pick, is the fix. The buyer's own lengths are hidden from the pick ([`src/span.ts:89`](src/span.ts#L89)), so it can't just match their number: re-run that way, hosted Muse Spark and Muse Spark Open each made the same call on every clip, every time.

## Live and recorded

- **Recorded:** each of my clips opens on a run recorded on 2 and 3 November, so the page is instant. Those runs came from an earlier version: hosted Muse Spark picked the edges, and the buyer's own lengths weren't yet hidden from it (the small window's pick even mentions their 63 cm). They took a median 91 s (58 to 119 s). Today's code is re-run in [`masked.json`](public/samples/masked.json) and [`masked-open.json`](public/samples/masked-open.json), and a full run with the reply now takes a median 44 s ([`repeat.json`](public/samples/repeat.json)). The `handsTimedOut` flag on the recorded runs is an old bug, since fixed: hand tracking ran over its 35 s on two of them.
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
- **The recess.** The tool measured the frame, set back in the recess, and I'd measured the opening on the wall: 11.7 cm apart. Asked for coordinates, Muse Spark was out by up to 100 pixels; asked to pick between lettered lines the code had found, it was consistent, 3 of 3. Its first picks wandered between a reveal edge and a wall corner, so candidates are now limited to a narrow band beside the window, and a wider span is only taken when frames agree within 25 mm ([`src/span.ts:123`](src/span.ts#L123)).
- **The buyer and the tool can both be right.** Lengths the buyer says out loud are picked out ([`src/agent.ts:160`](src/agent.ts#L160)). When they disagree with the measurement, the reply must give both sizes; if Muse Spark leaves one out twice, the code writes that sentence itself from the computed option.
- **Hands everywhere.** Buyers point while they film. Frames are only set aside when a hand covers the sheet or a side of the window ([`src/pipeline.ts:268`](src/pipeline.ts#L268)), and a slow hand-tracking call can't hold up the size ([`src/pipeline.ts:241`](src/pipeline.ts#L241)).
- **SAM sees several windows in one window.** Frame, trim and surround all come back. The reading seen in the most frames wins, unless a wider one is clearly wider.
- **Muse Image moves things.** The painted pole can drift from where the code placed it. Only SAM's pole mask inside the planned region is kept, gaps are closed, a short cut-out gets one retry, and the exact drawn pole is the fallback.
- **Rate limits.** Ten frames times four prompts at once hit the limit. SAM calls share a small queue with backoff, and the hands moved to one video call.

## How this maps to the judging

- **Impact:** a problem from my own inbox, with numbers, and three other makers who'd use it. Roller blind and curtain catalogues run on the same measurement, any shop can make its own buyer link on the page, and anyone can try it on their own window.
- **Use of Meta's tooling:** SAM 3.1 on images, video and Muse Image's output; Muse Spark Open both looking (which edges, making the same call as hosted Muse Spark 10 of 10 times) and writing; Muse Voice Transcribe; Muse Image. The models see and choose, the code measures.
- **Technical depth:** a joint wall-plane fit, sub-pixel edges to the outside of the trim, frames that must agree, a fair model-alone baseline and an edge-pick comparison, the buyer's numbers hidden from the pick, a unit-aware number checker, and a tape-measured test set with clips filmed to fail.
- **Demo:** a live page with no login that measures your window, and runs the whole pipeline on demand.

## Built for the Meta Global AI Developer Hackathon

Everything here was written during the event (26 October to 4 November 2026). The clips are of my house and of 4 windows in other homes. MIT licence.
