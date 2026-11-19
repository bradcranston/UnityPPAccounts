# Unity PP Accounts — manual account entry + PrinterPresence log

Two changes to `PP_PS_API_Sandbox.fmp12` and the `PPAccounts` widget.

**1. Add an account by hand.** Today an account can only be created by picking a
portal that a webhook already delivered. The Add Account modal now also takes a
typed account number and name, creates the Account record, *and* writes a stub
`PrinterPresence` row so that account behaves exactly like a webhook-seeded one.

**2. A Log tab.** A third tab beside Individual and Group, showing the
PrinterPresence table: when it arrived, order number, account name and number,
customer, item count, amount, status, whether an active account covers it, and a
Re-run button that sends the order to PrintSmith again the way the webhook does.

The two features are meant to be used together: filter the Log to **No active
account**, see which orders fell through, add the account manually, then Re-run
those orders.

---

## Install order

Do these in order. Steps 1 and 2 are schema/script work in FileMaker; step 4 is
the usual widget build.

### 1. Add 8 calculation fields to PrinterPresence

See **01-PrinterPresence-calc-fields.md**. All 8 are stored calculations over
`messageClean`, which is what lets the log query order data through OData
instead of parsing a 100 KB JSON blob 200 times per page.

`idText` is not optional — `__ID` auto-enters `Get ( UUIDNumber )`, a 58-digit
number, and JavaScript rounds anything past ~16 digits. Without `idText` the
Re-run button targets a record that does not exist.

Expect a minute or two of re-evaluation across the 7,153 existing records.

### 2. Paste the new branches into "Manage: Accounts"

**02-Manage-Accounts-new-branches.xml** holds three new `Else If` branches —
`addManual`, `logLoad`, `rerun` — as 180 script steps.

They belong inside the existing `If [ $mode = "load" ] … End If` chain, after the
`delete` branch:

1. Open `Manage: Accounts`.
2. Click the **last step inside the `Else If [ $mode = "delete" ]` branch** (the
   trailing `# (comment)`), so the paste lands after it and before `End If`.
3. Paste. FileMaker inserts below the selected step.
4. Confirm the last pasted step is the comment `--- end of pasted branches ---`,
   and that it sits immediately above the chain's `End If`.
5. Scan for `<Field Missing>` — there should be none. If you see one, tell me
   which step and I will re-pull that field ID from the DDR.

Field and script IDs in the snippet were taken from the 9/14/2026 DDR:
`PrinterPresence` `__ID`=9, `status`=17, `result`=18, `headerresponse`=19,
`authToken`=21, `type`=22; layout `PrinterPresence`=3; scripts
`process data - individual`=3, `process data - group`=13. If any of those have
changed since the export, the paste will show `<Field Missing>`.

### 3. Let a re-run past the time-window check

See **03-process-scripts-rerun-guard.md**. One line added to the opening `If` of
*both* `process data - individual` and `process data - group`. Without it, every
re-run is stamped `timed out` and nothing is sent — the guard those scripts open
with rejects any record older than a few hours, which is every record you would
ever want to re-run.

### 4. Replace the portal-list query (optional but recommended)

See **04-portal-list-sql.md**. One `Set Variable` step replaces the four-step
OData pull in the `load` and `addAccount` branches. No widget change needed.

### 5. Build and upload the widget

```
npm run deploy-to-fm
```

which is `npm run build` followed by `npm run upload` — parcel bundles
`index.html` and `UploadToHTML` writes it into the `HTML` record named
`PPAccounts`. Nothing about that pipeline changed.

Then reopen the Settings layout (or click the button on it) so `Manage: Accounts`
re-runs in `load` mode and the new widget renders.

---

## How the pieces talk to each other

Everything still goes through one script, `Manage: Accounts`, dispatching on
`mode`, and one web viewer object named `web`.

| From the widget | mode | What FileMaker does | What comes back |
|---|---|---|---|
| Add (manual form) | `addManual` | validates, POSTs the Account, POSTs a stub PrinterPresence row, re-queries | `setAccountData` |
| Open Log / filter / Load more | `logLoad` | builds an OData `$filter`, one paged GET | `setLogData` |
| Re-run button | `rerun` | confirm dialog, finds the record in a new window, clears the old outcome, re-matches the account, runs the process script | `setRerunResult` |

### Why the manual add writes a stub PrinterPresence row

`PrinterPresence::portal` is a calculation: the portal title out of the webhook
JSON, falling back to `portalManual` when there is none. `number` then filters the
digits after `#` out of `portal`. So writing `portalManual` as
`"Name (PrintSmith Account #12345)"` is enough to give the stub a working `portal`
and `number` — which is exactly what the webhook's account match reads, and what
the Add Account portal list reads.

The stub carries `status = "manual"` so it is obvious in the log that it is a
placeholder and not an order. It is filtered out of the "available portals" list
automatically, because that list already excludes numbers that belong to an
existing account.

### Why Re-run opens a new window

`Manage: Accounts` runs on the Settings layout, where the web viewer's content was
pushed in with `Set Web Viewer`. Navigating to the PrinterPresence layout and back
reloads that web viewer and throws away the log you were looking at. Doing the find
and the API call in a separate window on the PrinterPresence layout leaves the
Settings window untouched, so the log is still there — and still scrolled where you
left it — when the re-run finishes.

### Re-run creates a second order if the first one worked

There is no idempotency key on the PrintSmith side. Re-running a record whose
status is already `sent` posts a second invoice. The confirm dialog says so in as
many words and shows the current status, but nothing downstream will stop it.

Note the dialog's button order: FileMaker highlights button 1, which is **Re-run**,
and draws it on the right. So it reads `Cancel | Re-run`, and Return commits the
re-run. If you would rather Return mean Cancel, swap the two `<Button>` entries in
the `Show Custom Dialog` step.

---

## Things I noticed but did not change

**The OData password is in the script in plain text** (`Manage: Accounts`, every
branch, including the three new ones — I matched the existing style rather than
introduce a second pattern). Moving it to a field on `Settings` or to a custom
function would mean one place to rotate it instead of a dozen.

**`process data - individual` carries per-account hard-coded rules** — account
14328 skips stationery items, 3817 skips business cards, 22860 is First
Commonwealth with its own address lookup, 23586 always ships FedEx Ground. None of
that is visible anywhere in the UI, so a re-run can silently do nothing but stamp
`skipped for …`. The log does show that status, which is at least a start.

## Fixed along the way

**Portal and account names were being written into `innerHTML` unescaped.**
`createAccountHTML` and `createPortalHTML` interpolated `Name`, `AccountNumber`
and `portal` directly, and the `data-portal` attribute was only escaping
apostrophes. Portal names come out of webhook JSON, so a name containing `&`,
`<` or `>` rendered wrong and could inject markup into the page — a portal called
`Mercy & Sons <Apparel>` displayed as `Mercy & Sons` and put an `<apparel>`
element into the DOM. Both now run through the same `escapeHtml` helper the log
uses. Behaviour is otherwise identical; the add/toggle/delete payloads are
unchanged.

---

## 9/23/26: Tracking prefix

The hard-coded tracking-number rules are replaced by a `TrackingPrefix` field on
Account, which you edit on the Accounts tab. See **11-tracking-prefix.md** for the install steps
(snippets 11, 12, 13).

---

## 10/22/26: FCB Locations tab

Add, edit and delete the FCB delivery locations (the `Address` table), laid out the way
`process data - individual` matches an order's delivery answer to them. See
**14-fcb-locations.md** for install steps (snippet 14).

## 10/29/26: extracta POs left blank

Unity_SimpleQ wraps each delivery as `{message, messageId, queueId}`, so `Unity_PO::extractaWebhook`
found no data and left POs blank while the queue said "Delivered". See **16-extracta-unwrap.md**
(snippet 16, 3 steps pasted into Unity_PO).
