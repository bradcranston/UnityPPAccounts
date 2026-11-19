# Tracking prefix — match portal-less orders from the Accounts tab

9/23/2026. Replaces the hard-coded tracking-number rules in `webhook` and in the
`rerun` branch of `Manage: Accounts` with a **Tracking prefix** field on each
Account, which you edit on the Accounts tab.

## How matching works now

For an order whose message has **no portal title**:

1. Read `payload.message.message_tracking_number`.
2. Find the account whose `TrackingPrefix` that tracking number **starts with**.
   Case does not matter. An account can have more than one prefix, separated by commas.
3. If more than one account matches, the longest prefix wins, and an active
   account beats an inactive one.
4. Write that account to `portalManual` as `Name (PrintSmith Account #NNNNN)`.
   The `portal` and `number` calcs, the account match, and the Log tab
   then treat the order exactly like one that arrived with a portal.

If no prefix matches, nothing changes: the existing store-location fallback
(the next `If` in both scripts) still runs.

Inactive accounts are included in the lookup, the same as the old hard-coded
rules. The order gets the right account name, but it only processes once the
account is active.

### Checked against live data (9/23/26, 7,474 records)

- Every order the old rules caught had the text at the **start** of the
  tracking number, so "starts with" gives the same result as the old "contains":
  EATON 245, FoxsPizzaDen 236, FROnlineApparel 74, WPASchoolBlind 49, GearForDeer 1.
- The Fox's *store-location* rule (Fox's + Pizza in `store_location_name`) matched
  **0** orders that the FoxsPizzaDen prefix did not already catch. It is removed.
- **FileMaker SQL treats `''` as NULL**, so `col <> ''` returns no rows at all
  (measured: 438 rows `IS NOT NULL`, 0 rows with `<> ''` added). The lookup uses
  `IS NOT NULL` only. Don't add `<> ''` back.

### Re-run picks up prefixes added later

In both scripts the lookup runs when the message has no portal title (not when
the `portal` calc is empty). So you can add a prefix to an account and then
**Re-run** older orders from the Log, even ones that already had the
store-location fallback written into `portalManual`. The lookup only
overwrites `portalManual` when a prefix actually matches. Anything typed into
`portalManual` by hand is left alone otherwise.

## Install order

### 1. Add the field

Manage Database → `Account` → new **Text** field `TrackingPrefix`. No options.
Do this first. The OData `$select` and the pasted SQL both refer to it by name.

### 2. webhook: replace the hard-coded rules

Snippet **11-tracking-prefix-lookup.xml** (16 steps).

1. Open `webhook`. Select steps **20–34**: from
   `If [ IsEmpty ( PrinterPresence::portal ) ]` (the one followed by
   `Set Variable [ $orderNumber … ]`) through its `End If`, just before the
   `# (comment)` and the store-location `If`.
2. Delete them. Click the `# (comment)` step that now sits where they were (step 19).
3. Paste. The last pasted step is `# --- end tracking prefix lookup ---`, and the
   store-location `If [ IsEmpty ( PrinterPresence::portal ) ]` follows it.

### 3. Manage: Accounts → rerun: same replacement

Same snippet, **11-tracking-prefix-lookup.xml**.

1. In the `rerun` branch, select steps **245–259**: from
   `If [ IsEmpty ( PrinterPresence::portal ) ]` / `Set Variable [ $orderNumber … ]`
   through its `End If`.
2. Delete them, click the `# (comment)` above where they were (step 244), and paste.

### 4. Manage: Accounts → new setPrefix branch

Snippet **12-setPrefix-branch.xml** (30 steps, starts with `Else If [ $mode = "setPrefix" ]`).

Click `# --- end of reportSave branch ---` and paste. The branch's last step,
`# --- end of setPrefix branch ---`, should sit above the chain's closing `End If`.

### 5. Manage: Accounts → addManual saves the prefix

Snippet **13-addManual-prefix.xml** (3 steps).

In the `addManual` branch, click step 117,
`Set Variable [ $data; Value:JSONSetElement("" ;["Name";$portalName;…` (the one
right after `#1. the Account record` and `$url`). Paste, then **delete the old
step 117**. The new `$data` is the same plus `TrackingPrefix`.

### 6. Manage: Accounts → load the prefix into the widget

Three `$url` steps build `…/Account?$select=AccountNumber,fActive,Name,__ID,Type`:
step 17 (`load`), step 64 (`addAccount`), step 137 (`addManual`).
In each one, change the end to
`…,Name,__ID,Type,TrackingPrefix`.

### 7. Build the widget

`npm run deploy-to-fm` as usual.

### 8. Fill in the prefixes

On the Accounts tab, click **Edit** next to Tracking prefix on the account row,
type the prefix, then **Save** (or Enter). **Cancel** or Esc puts it back:

| Account | # | Tab | Prefix |
|---|---|---|---|
| Fox's Pizza Den (CORPORATE) | 23586 | Individual | `FoxsPizzaDen` |
| Eaton | 21489 | Individual | `EATON` |
| FROnlineApparel | 24124 | Individual | `FROnlineApparel` |
| WPASchoolBlind | 12934 | Group | `WPASchoolBlind` |
| **Gear For Deer** | 24513 | — | `GearForDeer`. **No Account record exists.** Add it with Add Account → Enter it manually, prefix included. |

Until step 8 is done, portal-less orders for these accounts fall through to the
store-location fallback, so do steps 2–8 in one sitting. Anything that slips
through in between can be fixed with Re-run from the Log once the prefixes are in.

## Widget changes (src/index.js, index.html, src/style.css)

- Account rows show the **Tracking prefix** read-only with an **Edit** button.
  Edit unlocks it and swaps in **Save** / **Cancel** (Enter / Esc). Clicking
  away does nothing, so a prefix can't be changed by accident. A refused
  (duplicate) prefix keeps the box in edit mode so it can be corrected.
- Input is normalized to `A, B`. Commas, semicolons, and spaces all separate prefixes,
  and repeats are dropped. FileMaker normalizes the same way.
- A prefix already on another account (exact match, any case) is refused,
  both in the widget and again in the `setPrefix` branch. Overlapping prefixes
  (`EAT` vs `EATON`) are allowed, and the longest match wins.
- The Add Account manual form has an optional prefix field.
- The account search also matches on prefix.
- `window.setPrefixResult({ ok, __ID, TrackingPrefix, errors })` confirms or
  reverts the save.
