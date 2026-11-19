# Let a re-run past the time-window check

`process data - individual` and `process data - group` both open with the same
guard: only process this record if its `zzCreatedTimestamp` falls inside a window
built from the order's own `date_created`. Anything outside that window is stamped
`timed out` and nothing is sent.

That is correct for live webhook traffic and fatal for a re-run — every record you
would ever want to re-run is, by definition, older than its window. So both scripts
need one change.

Neither script currently reads `Get ( ScriptParameter )` (I checked the DDR — zero
references in both), so using the parameter as the bypass signal is free: the webhook
calls them with no parameter and behaves exactly as it does today, and only the
re-run branch passes `"rerun"`.

---

## The change

In **both** `process data - individual` and `process data - group`, open the first
`If [ ... ]` step and put this on the front of the calculation, above the existing
`Let (`:

```
Get ( ScriptParameter ) = "rerun" or
```

That is the whole edit. The rest of the calculation is untouched.

The finished condition reads:

```
Get ( ScriptParameter ) = "rerun" or

Let ( [
  ¢tsraw = JSONGetElementValid ( PrinterPresence::messageClean ; "date_created" )
...
```

## Or paste it

`03-process-scripts-rerun-guard.xml` is that same `If` step, complete. If you would
rather paste than type: select the existing first `If` step, paste (the copy lands
directly below it), then delete the original — and make sure the one you delete is
the one *without* the `Get ( ScriptParameter )` line.

Typing the one line is honestly safer. Pasting an `If` and deleting the wrong one
leaves the script structurally intact but semantically inverted, which is the kind
of bug that only shows up in production.

## What stays protected

The window check still runs for everything the webhook sends. A re-run skips it, but
a re-run only ever happens when someone clicks the button in the Log tab and then
confirms a dialog that says, in as many words, that PrintSmith may end up with a
second copy of the order.
