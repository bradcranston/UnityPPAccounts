# FCB Report tab (9/22/2026)

Builds the monthly detail + promo code workbook that is assembled by hand today.
The workbook is written in JavaScript in the web viewer and handed to FileMaker as
base64, so there is no plugin.

## Pieces

| File | What it is |
|---|---|
| `src/xlsx-writer.js` | ~200 lines: a stored (uncompressed) zip and the handful of xlsx parts we need — inline strings, numbers, dates, formulas, `"$"#,##0.00`, wrapped text, column widths. No dependency. |
| `src/report-core.js` | Order shaping: item text cleanup, size → price tier, price lookup, marketing contribution, the sheet layouts, tracking-number gap detection. |
| `src/report.js` | The tab: month picker, load, summary cards, warnings, preview, Generate. |
| `filemaker/09-report-load.xml` | `reportLoad` branch for `Manage: Accounts` (21 steps). |
| `filemaker/wire-report-tab.py` | The edits already applied to index.html / src/index.js / src/style.css. |

## Round trips

| Widget | mode | FileMaker | callback |
|---|---|---|---|
| open tab / Load | `reportLoad` `{month, skip, top}` | ExecuteSQL page of that month's FCB orders (40 at a time) | `setReportData(rows, meta)` |
| Generate .xlsx | `reportSave` `{fileName, base64}` | Base64Decode into a container, export it | `setReportResult({ok, path, errors})` |

Prices come from the same `priceLoad` the FCB Prices tab uses, so the report's
marketing contribution and the PrintSmith note always agree.

## The save branch

`filemaker/10-report-save.xml` (28 steps) goes after `--- end of reportLoad branch ---`:
Base64Decode the payload into `Settings::gReportFile` (container, global, field id 11),
then `Export Field Contents` with automatic open. `Base64Decode` names the container file,
so the Save dialog opens on the report's own name and whoever runs it just picks the folder.
Cancelling the dialog is FileMaker error 1 and comes back as `cancelled`, not an error.

To write straight to the Desktop with no dialog, set the step's output file to
`Get ( DesktopPath ) & $rFile`.

## Notes

- The month filter runs on `zzCreatedTimestamp` (server local). The date written into
  the sheet is `orderDate` (UTC) shifted by the difference between the two, which is the
  store's local order time.
- Item text is stripped to plain ASCII: (R) and (TM) are dropped rather than spelled out.
- `findGaps` lists tracking numbers missing from the sequence. In August, 82 of them.

## Item-number matching (9/30/2026)

Store item numbers do not always match the price chart: `FCB-06` vs `FCB-006`,
`LTM763` vs `FCB-LTM763`, `3001CVC` vs `BC3001CVC`, `DT6000` vs `DT6000-SUMMER`,
`ERG Sticker Pack` vs `ERG - Sticker Pack (5 stickers/pack)`. Rather than make
Ashley renumber the store, `resolveSku` in `report-core.js` tries four rules in
order, from tightest to loosest:

1. exact match on the item number
2. same number once punctuation and leading zeros inside a digit run are ignored
   (`normSku`: `FCB-06` and `FCB-006` both become `FCB6`)
3. the chart's item number *starts with* the store's, at least 5 characters in
4. one is the other plus a prefix or suffix ending at a separator
5. one normalized number contains the other, at least 6 characters

Two guards keep it honest. A rule has to land on **exactly one** chart item — if
several match, nothing is chosen and the item is listed under "needs a closer
look" with the candidates. And rules 3–5 also require the store's item *title* to
share a real word (4+ letters, stop-words dropped) with the chart row's
description. That second guard is what stops a bare `INVENTORY` from matching
`4400-INVENTORY`: the onesie's description has no word in common with the
Proud-to-be-FCB tee, so the item stays on the unpriced list where it belongs.

Matches are cached per item number + title, so the ladder runs once per distinct
item, not once per line.

On August (135 orders) this resolves 9 real mismatches, refuses `INVENTORY`, and
leaves `DT6000-FCB-ERG Shirt`, `DG20-SALE` and `L540 4XL` unmatched. A sweep of
all 421 chart item numbers against themselves still resolves each to itself.

### What the tab shows

- A **Matched by item name** card (blue, informational) and a panel listing each
  alias: store number → chart number, tier, price, which rule fired, how many
  orders. Nothing is hidden — the report is priced using these, so they are shown
  for review.
- A button, **Add the store's spelling to FCBPrice**, that writes each alias into
  the price table as its own row at the same price (mode `priceSave`, the same
  branch the FCB Prices tab uses). After that the match is exact and the panel
  empties out. This is the permanent fix; the ladder is the safety net.
- An **ambiguity** panel when a store number could be more than one chart item.
  Those are never guessed — they show up as unpriced until someone decides.

Saving prices re-runs `shape()` on the loaded month (`prices.js` calls
`host.report.shape()` at the end of `setData`), so the numbers update without a
reload.

## Full tracking-number gap list (9/30/2026)

The gap panel used to truncate at 40 with "and 42 more". It now lists every
missing number in a scrolling box (`.rpt-gaps`, `user-select: all`) with a
**Copy the list** button, so the whole set can go straight into the workbook.
Copy uses a hidden textarea and `document.execCommand('copy')` — the async
clipboard API is not reliable inside a FileMaker web viewer.
