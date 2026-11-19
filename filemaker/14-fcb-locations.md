# FCB Locations tab (10/22/2026)

A tab for adding, editing and deleting the FCB delivery locations: the `Address` table that the
FCB (acct 22860) block in `process data - individual` reads for the PrintSmith ship-to address
and delivery job.

## Install

1. **Paste the script steps.** In `Manage: Accounts`, click the comment
   `--- end of FCB price branches ---`, then paste `14-fcb-location-branches.xml` (124 steps). It
   adds three `Else If` branches (`locationLoad`, `locationSave`, `locationDelete`). The last pasted
   step is `--- end of FCB location branches ---`. Every field and layout reference goes by name
   (Set Field By Name, Go to Layout by calc, ExecuteSQL), so nothing can paste as `<Field Missing>`.
   `14-build-location-branches.py` regenerates the XML if a branch needs changing.
2. `npm run deploy-to-fm`

No schema changes: `Address` already has `__ID` (auto-enter `Get ( UUIDNumber )`) and the zz audit fields.

## How orders use these records

The order's answer to *"Please select which location you would like your items delivered to:"* is
looked up in `Address`:

| Store answer | Looks up | Example |
|---|---|---|
| contains `(IFC)` | `Type = IFC` and `Center Name` = text before the first bracket, with `Office` removed (case-sensitive) | `Anderson (IFC)` → Anderson |
| anything else | `Type = Color` and `Color` = text inside the first brackets (case-insensitive) | `Bloomfield (Red)` → Red |

The matched row's address becomes the PrintSmith ship-to. Its `Center Name` sets the delivery line
and the second job: IFC → PS-SKU-5 IFC Shipping; contains "Greensburg" → PS-SKU-4 Greensburg
Storeroom Delivery; contains "Indiana" → PS-SKU-5 Indiana Storeroom Shipping; anything else →
`*** CHECK DELIVERY ***` in the notes and no delivery job.

So the tab is organised the way the lookup works:

- **Storeroom colors**: one card per storeroom (`Center Name` of the Color rows) with its address,
  its delivery type, and its colors. Each color is its own `Address` row carrying a copy of the
  storeroom address, so **Edit storeroom** saves name and address onto every color at once, and
  adding a color copies the storeroom address. Moving a color = editing it and picking another storeroom.
- **IFC offices**: one row each. The name must be exactly what the store shows before the bracket.
- **Recent orders**: every delivery answer FCB orders sent in the last 30–365 days, what it resolves
  to, and the delivery job. Unmatched answers are listed first with an **Add location** button that
  fills the form in. A test box resolves any answer before the store starts sending it.

`locations.js` `resolveAnswer()` repeats the script's lookup exactly. If the FCB block in
`process data - individual` changes, change that function to match.

## Guard rails

Checked in the widget as you type, and again in `locationSave` before anything is written:

- **No second match.** Two IFC rows with the same name, or one color on two rows, makes the script's
  `$addressId` a list and the ship-to address comes out as two addresses run together.
- **Names an order can actually match.** An IFC name with a bracket or the word "Office", or a color
  with brackets, can never be found.
- Street, city, state and ZIP are required; RC must be a number.

Warnings (save still allowed):

- a storeroom name without "Greensburg" or "Indiana" (orders get CHECK DELIVERY);
- an edit that stops recent answers matching (only right if the store's dropdown changed too), or
  that fixes unmatched ones.

Delete confirms in FileMaker (Cancel is the default) and shows how many recent orders used the
location. Orders already sent are unaffected: PrintSmith got a copy of the address.

| Widget action | mode | FileMaker | callback |
|---|---|---|---|
| open tab / Refresh / change days | `locationLoad` `{days}` | ExecuteSQL of all Address rows (`__ID` cast to text); finds PrinterPresence by date in a new window and reads FCB answers with GetNthRecord | `setLocationData(locations, orders, meta)` |
| Save (add, edit, edit storeroom) | `locationSave` `{rows:[{id,type,center,rc,color,address,address2,city,state,zip}]}` | validates everything, then writes in a new window | `setLocationResult` |
| Delete | `locationDelete` `{id,label}` | FileMaker confirm; Cancel is the default | `setLocationResult` |

## Data notes (10/22/26)

- `Devon (105)` (IFC) can never match: orders only use the text before the bracket. Rename it `Devon`
  on the IFC offices view; the form shows how many recent answers that fixes.
- The store changed answer formats around 8/14–8/17/26. Before that it sent
  `0106 - Pleasant Valley - Brown` / `… - IFC`. Nothing can match those, so the Recent orders view
  shows them as **Old format** rather than as problems. They only matter if such an order is re-run.
- `locationLoad` filters to FCB inside the calc (`PrinterPresence::number` is a calculation, so it
  is not in the find). The find is by `zzCreatedTimestamp`, so the default 90 days is quick; a year
  on the hosted file will take a few seconds.
