# Account match: number first, name only as a fallback

Applies to **four** condition calculations — two in `Manage: Accounts` (the
`rerun` branch) and two in `webhook`. The Individual text is identical in both
scripts, and so is the Group text, so there are only two things to copy.

## Why

`PrinterPresence::number` is a calculation: the digits after `#` in
`PrinterPresence::portal`. `portal` itself is the webhook's portal title,
falling back to `portalManual`.

Matching on `Account::Name = PrinterPresence::portal` is unreliable because the
live portal titles carry suffix variants the Account names do not. Real examples
from the file:

```
Adelphoi USA (PrintSmith Account #3817)
Adelphoi USA (PrintSmith Account #3817) (ACTIVE)
Adelphoi USA (APPAREL) (PrintSmith Account #3817) (ACTIVE)
Central Westmoreland Career & Technology Center (CWCTC) (PrintSmith Account #8791) (ACTIVE)
```

All four resolve to a clean `number`. Only one of them will ever equal an
`Account::Name` exactly.

So: match on number when there is one. Fall back to name **only** when the
portal carries no `#NNNNN` at all — portals like `Kennametal`,
`Commercial Bank`, `Grand Lodge (Lodge Secretary)`, `*Excela Forms (MASTER)`.

Note the fallback fires on *no number to match with*, not on *number matched
nothing*. A record with number 24321 and no active account #24321 lands on
`no active account`; it does not then go looking by name. That is deliberate —
falling through to the name match on a miss would reintroduce exactly the
unreliability this change removes.

## Where to paste

| Script | Step |
|---|---|
| `webhook` | the `If [ ... "Individual" ... ]` near the end |
| `webhook` | the `Else If [ ... "Group" ... ]` right below it |
| `Manage: Accounts` | in the `rerun` branch, the `If [ ... "Individual" ... ]` |
| `Manage: Accounts` | in the `rerun` branch, the `Else If [ ... "Group" ... ]` |

Open each condition and replace the whole calculation.

## Individual

```
Let ( [

// Account number is parsed from the #NNNNN inside the portal string, so it
// survives the (ACTIVE) and other suffix variants that make a Name match
// unreliable. Fall back to Name ONLY when there is no number to match on.
~num = PrinterPresence::number ;

~hit = If ( not IsEmpty ( ~num ) ;
	ExecuteSQL ( " select \"__ID\" from \"Account\" where \"fActive\" = ? and \"AccountNumber\" = ? and \"Type\" = ? " ; "" ; "" ; 1 ; ~num ; "Individual" ) ;
	ExecuteSQL ( " select \"__ID\" from \"Account\" where \"fActive\" = ? and \"Name\" = ? and \"Type\" = ? " ; "" ; "" ; 1 ; PrinterPresence::portal ; "Individual" )
)

] ;

not IsEmpty ( ~hit ) )
```

## Group

```
Let ( [

// Account number is parsed from the #NNNNN inside the portal string, so it
// survives the (ACTIVE) and other suffix variants that make a Name match
// unreliable. Fall back to Name ONLY when there is no number to match on.
~num = PrinterPresence::number ;

~hit = If ( not IsEmpty ( ~num ) ;
	ExecuteSQL ( " select \"__ID\" from \"Account\" where \"fActive\" = ? and \"AccountNumber\" = ? and \"Type\" = ? " ; "" ; "" ; 1 ; ~num ; "Group" ) ;
	ExecuteSQL ( " select \"__ID\" from \"Account\" where \"fActive\" = ? and \"Name\" = ? and \"Type\" = ? " ; "" ; "" ; 1 ; PrinterPresence::portal ; "Group" )
)

] ;

not IsEmpty ( ~hit ) )
```

## After

The webhook is the path every incoming order takes, so watch the next few live
orders: they should still land with `status = sent` and the right `type`. If
something goes wrong the symptom is orders stalling at `status = new`, which the
Log tab's "New — never processed" filter will show immediately.
