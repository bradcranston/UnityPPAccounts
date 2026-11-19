# Stop pulling all 7,153 PrinterPresence rows to build the portal list

## The problem

`Manage: Accounts` builds the "available portals" list like this, in both the
`load` and `addAccount` branches:

```
Set Variable [ $url ; .../PrinterPresence?$select=portal,number ]
Set Variable [ $payload ; ...GET... ]
Insert from URL [ $resultPortal ; $url ; $payload ]
```

No `$top`, no `$filter`. That is every row in the table — 7,153 today — shipped
over HTTP so the web viewer can throw almost all of it away: the widget drops
null portals, drops portals whose number already belongs to an account, and then
de-duplicates the rest by name. A few hundred unique portals survive.

It runs on every open of the Settings layout, and again after every account add.

## The fix

One `ExecuteSQL` against the index, returning only the distinct unclaimed
portals, formatted as the same `{"value":[...]}` JSON the widget already parses:

```
SELECT DISTINCT "portal", "number"
FROM "PrinterPresence"
WHERE "portal" IS NOT NULL
  AND "portal" NOT IN ( SELECT "Name" FROM "Account" WHERE "Name" IS NOT NULL )
ORDER BY "portal"
```

`portal` is a *stored* calculation, so `DISTINCT` and `ORDER BY` both run off the
index rather than scanning records. The HTTP round trip disappears entirely.

**No widget change is needed.** `setAccountData` already accepts either a bare
array or `{ value: [...] }`, and the JSON this builds is byte-compatible with
what OData was returning, nulls included.

Two details in the SQL worth knowing:

- The `WHERE "Name" IS NOT NULL` on the subquery is not decoration. In SQL's
  three-valued logic, `NOT IN` against a set containing a single NULL returns no
  rows at all — one Account with an empty Name would silently empty the whole
  portal list.
- The calculation checks for `"?"` as the first character, which is what
  `ExecuteSQL` answers on a syntax or privilege error, and falls back to an empty
  list rather than feeding garbage to the widget.

The widget keeps its own number-based exclusion and case-insensitive de-dupe, so
an account whose Name was typed differently from its portal string still gets
filtered out downstream.

## Applying it

**04-portal-list-sql.xml** is a single `Set Variable [ $resultPortal ; ... ]` step.

It replaces **four** steps in each of two places in `Manage: Accounts`:

```
# portal data                         <- the comment
Set Variable [ $url ; ... ]
Set Variable [ $payload ; ... ]
Insert from URL [ $resultPortal ; ... ]
```

1. In the **`$mode = "load"`** branch, click the `Insert from URL [ $resultPortal ... ]`
   step and paste. The new step lands directly below it.
2. Delete the four old steps above it (the `#portal data` comment, the two
   `Set Variable` steps, and the `Insert from URL`).
3. Repeat both steps in the **`$mode = "addAccount"`** branch.

The `addManual` branch in `02-Manage-Accounts-new-branches.xml` already uses this
version — if you have not pasted that file yet, you only have these two edits to
make.

Leave the *account* data query alone. `Account` holds 50 records and that OData
call is genuinely cheap.

## Checking it worked

Open the Settings layout and then the Add Account modal. The portal count in the
modal should match what it showed before, the list should now be alphabetical
(it was previously in record-creation order), and the layout should open
noticeably faster.

If the count comes back 0, the SQL returned `?`. The usual causes are the
`odata`/current account lacking read access to `Account`, or a table occurrence
having been renamed away from `PrinterPresence` / `Account`.
