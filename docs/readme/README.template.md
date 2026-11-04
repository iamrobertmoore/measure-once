<p align="center"><img src="docs/brand/demo.gif" alt="A clip of my living room window: the sheet of A4 is found, a tape snaps across the frame, the photo flattens into a front-on drawing and the pole is drawn to scale with the cut marked" width="880"></p>

<p align="center"><img src="docs/brand/readme-banner.svg" alt="Measure Once: film your window, get the right size first time" width="880"></p>

<p align="center"><b>A sizing desk for people who make things to measure. The buyer films their window; I get the size, the cut and a drafted reply to approve.</b></p>

<p align="center"><a href="{{live_url}}"><b>Try it live, on your own window</b></a> · <a href="{{live_url}}/buyer.html?shop=creationsfromrob">The buyer link</a> · <a href="{{video_url}}">The video (2:58)</a> · <a href="#measured-against-a-tape">Measured against a tape</a> · <a href="#run-it-yourself">Run it yourself</a></p>

I make reclaimed-wood curtain poles in Whitstable and sell them on Etsy. It's a real shop, [Creationsfromrob](https://www.etsy.com/shop/creationsfromrob), open since 2020, with nearly 800 sales and a 4.7-star rating from 119 reviews, and every number below comes from my own inbox, my own windows and my own catalogue. Poles come in fixed lengths, the buyer cuts theirs down at home, and a cut pole can't come back. So a lot of my day is people asking which size to order, and every answer starts with "could you measure from here to here".

Measure Once is the desk I wanted for that. The buyer films their window for a few seconds with a sheet of A4 (or US Letter) taped flat on the wall and says what they want. SAM 3.1 finds the sheet and the window, and on full clips tracks their hands. My code turns pixels into centimetres, using the sheet's known size. Muse Spark Open, Meta's open-weights model, looks at the edges the code found and decides which ones the pole has to span. My catalogue rules pick the pole and the cut, Muse Spark Open (Meta's open-weights model, on Baseten) drafts my reply in my words, Muse Image shows the pole on their own wall, and I check it and press send.

The buyer side is a link I can send to any buyer who asks which size to order. They open it on their phone, film the window, and see their size and how sure it is in about a minute; I get the measurement and the drafted reply by email, and nothing goes back to them until I've checked it.

It's built around my shop, but the measuring isn't tied to it. The page has two more catalogues using the usual trade rules: a made-to-measure roller blind (the width to order inside the recess or outside it) and made-to-measure curtains (each curtain's width for pencil pleat or eyelet, and the drop when the clip shows it). The same clip, measured once, sizes all three. Each maker's rules are one small file.

## Try it

No login, nothing to install.

| Try this | What happens |
|---|---|
| Open [the page]({{live_url}}) and pick **Your window** | Tape a sheet of A4 or US Letter on the wall beside any window, film it or take two photos, and it measures yours. Nothing is stored. |
| Pick **Living room, shutters** | My own window: the sheet is found, a tape snaps across the frame, and the photo flattens into a scale drawing with the pole, the cut and where I pointed |
| Press **Run it live** | The whole pipeline runs again on that clip, on Meta's models, in about {{run_seconds}} seconds |
| Pick **Small window in a recess** | Muse Spark picks the recess opening on the wall, not the frame set back inside it. I'd said 59 cm; the reply gives sizes for both and asks which edges I meant |
| Switch to **Roller blind** or **Curtains** | Same clip, same measurement, another maker's rules: the blind to order inside the recess or outside it, or each curtain's width for the pole, and a reply in that maker's voice |
| Open [the buyer link]({{live_url}}/buyer.html?shop=creationsfromrob) on a phone | What my buyers see: film the window, get the size, the likely range and whether the pole fits across it, then send it to me. The maker's email goes to a demo inbox |
| Pick any of the last three clips | No sheet, a curled sheet, a steep angle: it refuses and says how to film it again, instead of guessing |

## Why not just a tape measure?

Buyers do have tape measures. What goes wrong is which edges they measure, and whether they say so: the frame or the trim, the glass, the recess or the wall around it. Every sizing thread in my inbox starts with me asking that. A clip shows me the window itself, so the size, the edges and the cut can all be settled in one reply.

I read my last {{inbox_threads_read}} buyer threads. {{inbox_sizing_threads}} were about which size to order, about {{inbox_sizing_share}} of everything. My replies ran to {{inbox_reply_words_median}} words on a normal day and {{inbox_reply_words_p90}} on a hard one, and buyers waited a median {{inbox_wait_hours_median}} hours for an answer. Big online blind retailers sell or bundle measuring guarantees for this reason ([example](https://www.selectblinds.com/satisfaction-guarantee.html)). A one-person shop can't, so the size has to be right first time. And it isn't just my shop: in the UK, online sellers are now the largest route to market for curtains and blinds, driven by made-to-measure ordering ([Barbour ABI, 2026](https://store.barbour-abi.com/report/residential-window-coverings-market-report-uk-2026-2030/)), and every one of those orders starts with someone's measurement. A different maker's rules are one small file: the roller blind and curtain catalogues on the live page are [`src/blinds.ts`](src/blinds.ts) and [`src/curtains.ts`](src/curtains.ts).

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
| It's about 3 cm from a steel tape on a typical window, never more than {{today_worst_cm}} cm; the poles it chose would all have fitted | Today's code, every measured clip re-run 4 times ({{today_runs}} runs): a median {{today_median_cm}} cm out, worst {{today_worst_cm}} cm (the recorded runs on the page: {{median_err_cm}} cm). {{windows_total}} real windows, {{other_homes}} of them in other homes: {{windows_measured}} measured (worst {{worst_err_cm}} cm, a recess), {{windows_refused}} refused rather than guessed. Cut to the measurement, {{pole_fit_ok}} of {{pole_fit_total}} poles would still fit the tape's width ({{pole_fit_overhangs}} past each side) | [Measured against a tape](#measured-against-a-tape) |
| The measuring code earns its place | Asked the same question from the same full-size frames, Muse Spark alone was a median {{spark3_err_median}} cm out but {{spark3_err_max}} cm out on two windows, and its single-frame answers swung by up to {{spark3_swing}} cm. With the code, the worst was {{worst_err_cm}} cm | [The baseline](#muse-spark-alone-versus-the-measuring-code) |
| The model earns its place too | On the same lettered edges, the code's outline alone is {{ablation_outline_worst}} cm out at worst (it misses both recesses) and the widest edges {{ablation_widest_worst}} cm; Muse Spark's pick, {{ablation_spark_worst}} cm | [Which edges?](#which-edges-does-the-pole-span) |
| The reply can't add a length of its own | Every length in a draft, with its unit, must be one the code computed (exactly, or rounded to the whole centimetre) or the buyer said; anything else is rejected. It can't stop a real number landing in the wrong sentence, which is why I read every draft before it goes | {{ref_check}}, tested in `test/checker.ts` |
| It gives the same answer twice, and doesn't copy the buyer's number | Each recorded clip re-run 3 times end to end: {{repeat_ok}} of {{repeat_runs}} measured, widths within {{repeat_spread_mm}} mm of each other, the recesses picked every time. Then {{masked_runs}} more runs on today's code with every length the buyer said hidden from the edge pick: the same pick {{masked_same_pick}} of {{masked_runs}} times, widths within {{masked_max_move_mm}} mm of the recorded runs | [`repeat.json`](public/samples/repeat.json), [`masked.json`](public/samples/masked.json) |
| It says how sure it is | Every size comes with a likely range ({{likely_half_cm}} cm each side here), from how much the frames disagree plus how far that kind of window has been from the tape. The tape was inside the range on {{likely_inside}} of {{likely_total}} windows, and the pole it chose fits across the whole range on {{likely_holds}} of {{likely_total}}. The range is set from these same windows, so I also checked it leaving each window out of its own range: then the tape is inside on {{loo_inside}} of {{loo_total}}. With five windows it's a working estimate, and the reply asks for a tape check whenever the pole might not hold | [`src/sure.ts`](src/sure.ts) |
| One frame isn't enough | On the plain windows, a single frame alone was a median {{single_median_cm}} cm from the tape but up to {{single_worst_cm}} cm off; the frames' median never more than {{plain_within_cm}} cm | `frames` in each `public/samples/*/run.json` |
| It knows when not to answer | Three clips filmed to fail (no sheet, curled sheet, steep angle): refused {{refused}} of {{refusals}}, all three on the page | Pick them on the live page |
| Nothing in the photo changes except the pole | Only SAM's cut-out of the painted pole is pasted back onto the original | {{ref_sam_pole}} |
| It works on your window, not just mine | **Your window** on the page sends your frames to the same pipeline | {{ref_upload}} |

## What happens to one clip

<p align="center"><img src="docs/brand/architecture.svg" alt="Clip in; SAM 3.1 finds the sheet, window and hands; code measures; Muse Spark picks which edges the pole spans; catalogue picks the pole; Muse Voice Transcribe hears the request; Muse Spark Open drafts the reply; Muse Image and SAM 3.1 show the pole; the maker approves" width="880"></p>

1. **The buyer films the window** with the sheet on the wall, and talks: "eyelet curtains, from about here to here."
2. **SAM 3.1** segments the sheet and the window on the sharpest frames, and tracks the buyer's hands through the whole clip in one video call. That call gets 35 seconds and the size never waits for it: on the five recorded runs it found hands on two, and twice it ran over and the size went ahead without it.
3. **My code works out millimetres.** The sheet's known size (A4 or US Letter, told apart by its shape) fixes the scale and the window's straight edges fix the angle of the wall. The window is measured to the outside of its trim, where a tape would go, and the frames have to agree.
4. **Muse Spark Open picks the span.** The code draws every strong vertical edge it finds on the wall beside the window as a lettered line, and Muse Spark Open, the open-weights model, picks the pair the pole has to span, from the picture and what the buyer said (with any lengths they said hidden). Up to five sharp frames vote; the code measures between the chosen lines. If Baseten can't answer, hosted Muse Spark picks instead.
5. **Muse Voice Transcribe** hears the request, with curtain words passed as keywords.
6. **My catalogue rules** pick the pole: 15 to 20 cm past the opening each side, the shortest stock length that works, the cut taken equally off each end so the join stays central.
7. **Muse Spark Open** (open weights, on Baseten) drafts my reply in my voice from those numbers. If the buyer said a length that disagrees with ours, the reply gives both sizes and asks.
8. **Muse Image** paints the pole on their window, and **SAM 3.1** cuts the painted pole back out, so only the pole is added.
9. **I approve and send.**

For my living room window it recommends the **{{lr_pole}}**, taking **{{lr_cut_each_end_cm}} cm off each end**.

## How Meta's models are used

| Model | The job | Code |
|---|---|---|
| SAM 3.1, images | Finds the A4 sheet and three readings of the window (frame, surround, wooden frame) on each sharp frame | {{ref_sam_image}} |
| SAM 3.1, video | Tracks the buyer's hands through the whole clip in one call: where they pointed, and which frames to set aside (on full clips; an upload from the page sends frames only, to stay fast and small) | {{ref_sam_video}} |
| **Muse Spark Open, looking** (open weights, on Baseten) | Picks which of the lettered edges the pole spans: the trim, or a recess opening around a set-back window. Re-run on every measured clip, it picked the same edges as hosted Muse Spark {{open_pick_same}} of {{open_pick_runs}} times | {{ref_span}}, [`masked-open.json`](public/samples/masked-open.json) |
| Muse Spark 1.3, looking (fallback) | Picks the edges if Baseten can't answer; it picked them on the recorded runs | {{ref_span}} |
| Muse Voice Transcribe | Hears what the buyer wants, biased to English with curtain words as keywords | {{ref_voice}} |
| **Muse Spark Open** (open weights, `meta-models/muse-spark-open`, served on Baseten) | Writes the reply: picks among the options the code computed and drafts it in my voice, reconciling the buyer's own numbers. On the {{open_runs}} recorded clips every draft passed the number check first time, in about {{open_secs}} s each. Every live run says which model wrote its draft | {{ref_open}} |
| Muse Spark 1.3, writing (fallback) | Takes over the draft by itself if Baseten can't answer, so a run never stops | {{ref_spark}} |
| Muse Image 1.0 | Turns a flat pole drawn in exact perspective into a photoreal pole on the buyer's wall | {{ref_image}} |
| SAM 3.1 on Muse Image's output | Cuts out only the painted pole, so nothing else in the buyer's photo changes, and checks the painted pole runs the full length that was drawn: under 95% it paints again, under 85% it shows the exact drawn pole instead | {{ref_sam_pole}}, {{ref_render_check}} |

### Which model writes the reply

Each of the 5 measured windows redrafted 3 times by each writer ({{writers_n}} drafts each), with the same numbers, the same prompt and the same number check (`scripts/compare-writers.ts`, results in [`public/samples/writers.json`](public/samples/writers.json)):

{{writers_table}}

Both are accurate; Muse Spark Open is about {{writers_speedup}} times faster, which matters when a buyer is waiting on the page, so it writes and the hosted model is the fallback. It writes longer than I asked, which I trim when I check the draft.

The split is deliberate. The models see, choose, hear, write and paint. The numbers come from geometry and my catalogue, and the checker ({{ref_check}}) holds the reply to them.

## Measured against a tape

{{windows_total}} real windows filmed on a phone the way a buyer would: 3 in my house and {{other_homes}} in other homes. I measured every tape figure myself with a steel tape, across the outside of the frame or, for a recess, across the opening at the wall face, where the pole goes. It measured {{windows_measured}}, each checked with a steel tape, and asked for a re-film on {{windows_refused}}. Plus 3 clips filmed to fail.

{{tape_table}}

Clips filmed to fail (no sheet, a curled sheet, a steep angle): refused {{refused}} of {{refusals}}, each with a reason and how to film it again.

Over the {{windows_measured}} windows it measured, today's code is a median {{today_median_cm}} cm out and never more than {{today_worst_cm}} cm (the recorded runs on the page: {{median_err_cm}} cm and {{worst_err_cm}} cm); on the {{plain_count}} plain windows it's within {{plain_within_cm}} cm. The question that matters is whether the pole would fit: cut to each measurement, the pole sits {{pole_fit_overhangs}} past each side of the width the tape measured, so {{pole_fit_ok}} of {{pole_fit_total}} would fit ({{pole_fit_band}} inside my usual 15 to 20 cm). The {{recess_count}} recessed windows are the hard ones ({{recess_errs}}): the frame sits back from the wall, so Muse Spark picks the recess opening on the wall and the code measures that. When the buyer's own number differs, the reply says both and sizes both, for example: "{{sm_reply_quote}}"

Each size also comes with a likely range, and the reply checks the pole against the whole of it, not just the middle. The tape was inside the range on {{likely_inside}} of {{likely_total}} windows and the chosen pole fits across all of it on {{likely_holds}} of {{likely_total}}; when it doesn't, the reply asks for a quick tape check before anything is cut.

A steel tape isn't perfect either. On a recess or a chunky surround it's easy to be a few millimetres out, and a buyer measuring from the wrong edge can be centimetres out, which is the mistake a clip of the window catches. So read the tape column as the best reference I have, not ground truth.

Two windows were refused rather than guessed: one had the sheet resting on top of the frame instead of flat on the wall, the other was filmed from a sharp side angle with one side hidden behind a machine. A refusal costs the buyer ten seconds of filming; a wrong size costs a pole.

### Muse Spark alone versus the measuring code

The same full-size frames, with Muse Spark asked the same question the pipeline answers (the outside of the trim, or a recess opening at the wall face), using the sheet as its scale:

{{baseline_table}}

It's a fair fight, and Muse Spark alone does better than I expected: within 2 cm on three windows. But it was 11 cm out on two, and its answers for one window swung by up to {{spark3_swing}} cm from frame to frame, so any single answer is a gamble. The code's worst was {{worst_err_cm}} cm and its frames agree to within millimetres. (Two earlier runs, with a vaguer question and frames shrunk to 1280 px, were {{spark2_err_min}} to {{spark2_err_max}} cm out; they're in `baseline.json` and `baseline-2.json`.) `FAIR=1 npx tsx scripts/baseline-spark.ts` re-runs it.

### Which edges does the pole span?

The code finds every strong vertical edge on the wall and letters it. Picking the pair is the model's job, and a simple rule can't do it. The same edges on each clip's main frame, chosen three ways:

{{ablation_table}}

The outline alone misses both recesses; the widest edges catch the recesses but run out to other edges on the living room wall. No single rule gets all five: the model took the outline on the three plain windows and the wider pair on the two recesses. It isn't perfect. On the small recess the code never found the opening's left edge (that side is in shadow), so the best pair on offer was the frame's left side and the opening's right side, which is where its 5.5 cm miss comes from; better edge-finding, not a better pick, is the fix. The buyer's own lengths are hidden from the pick ({{ref_mask}}), so it can't just match their number: re-run that way, hosted Muse Spark and Muse Spark Open each picked the same edges every time.

## Live and recorded

- **Recorded:** each of my clips opens on a run recorded with this code, so the page is instant. Its real end-to-end time is shown under the drawing (a median {{run_seconds}} s over the five measured clips, {{run_seconds_min}} to {{run_seconds_max}} s).
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

- **A small sheet can't set the wall's angle on its own.** At A4 size, one pixel at a corner is 1% of the scale. The sheet and the whole window are fitted together: the sheet sets the scale, the big window sets the angle ({{ref_joint}}).
- **Masks are a few pixels fat or thin, and that's 3 cm.** On simulated frames a 2 to 3 pixel mask bias gave 30 to 38 mm of error, and averaging didn't remove it. SAM finds each side; the pixels place it (0.1 to 0.2 mm on the same frames).
- **The window came out 6 cm short.** I looked at the corners: the line sat on the inner side of the architrave's moulding, about 20 pixels in at the top. Edges are now taken where the profile first leaves the wall, which is where a tape goes ({{ref_outer}}). Each side gets its own colour contrast, because a white surround on a cream wall is lit differently left and right ({{ref_sides}}).
- **A picture frame pulled the sheet's edge.** A hanging picture's wooden bar sat just above the sheet and dragged its top edge up by 9 pixels. Samples where the "outside" is brighter than the sheet are now ignored ({{ref_polarity}}).
- **The recess.** The tool measured the frame, set back in the recess, and I'd measured the opening on the wall: 11.7 cm apart. Asked for coordinates, Muse Spark was out by up to 100 pixels; asked to pick between lettered lines the code had found, it was consistent, 3 of 3. Its first picks wandered between a reveal edge and a wall corner, so candidates are now limited to a narrow band beside the window, and a wider span is only taken when frames agree within 25 mm ({{ref_span}}).
- **The buyer and the tool can both be right.** Lengths the buyer says out loud are picked out ({{ref_buyer}}). When they disagree with the measurement, the reply must give both sizes; if Muse Spark leaves one out twice, the code writes that sentence itself from the computed option.
- **Hands everywhere.** Buyers point while they film. Frames are only set aside when a hand covers the sheet or a side of the window ({{ref_hand_way}}), and a slow hand-tracking call can't hold up the size ({{ref_hands_cap}}).
- **SAM sees several windows in one window.** Frame, trim and surround all come back. The reading seen in the most frames wins, unless a wider one is clearly wider.
- **Muse Image moves things.** The painted pole can drift from where the code placed it. Only SAM's pole mask inside the planned region is kept, gaps are closed, a short cut-out gets one retry, and the exact drawn pole is the fallback.
- **Rate limits.** Ten frames times four prompts at once hit the limit. SAM calls share a small queue with backoff, and the hands moved to one video call.

## How this maps to the judging

- **Impact:** a problem from my own inbox, with numbers, and three other makers who'd use it. Roller blind and curtain catalogues run on the same measurement, any shop can make its own buyer link on the page, and anyone can try it on their own window.
- **Use of Meta's tooling:** SAM 3.1 on images, video and Muse Image's output; Muse Spark Open both looking (which edges, matching hosted Muse Spark 10 of 10 times) and writing; Muse Voice Transcribe; Muse Image. The models see and choose, the code measures.
- **Technical depth:** a joint wall-plane fit, sub-pixel edges to the outside of the trim, frames that must agree, a fair model-alone baseline and an edge-pick comparison, the buyer's numbers hidden from the pick, a unit-aware number checker, and a tape-measured test set with clips filmed to fail.
- **Demo:** a live page with no login that measures your window, and runs the whole pipeline on demand.

## Built for the Meta Global AI Developer Hackathon

Everything here was written during the event (26 October to 4 November 2026). The clips are of my house and of {{other_homes}} windows in other homes. MIT licence.
