# FCB Prices tab (9/21/2026)

A fourth tab in the widget for editing the `FCBPrice` table. The FCB (acct 22860)
block in `process data - individual` reads this table when it builds the PrintSmith notes.

## Install

1. **Paste the script steps.** In `Manage: Accounts`, click the comment
   `--- end of pasted branches ---` at the end of the `rerun` branch, then paste
   `08-fcb-price-branches.xml` (106 steps). It adds three `Else If` branches
   (`priceLoad`, `priceSave`, `priceDelete`) just above the chain's `End If`. The
   last pasted step is `--- end of FCB price branches ---`. Every field and layout
   reference goes by name (Set Field By Name, Go to Layout by calc, ExecuteSQL), so
   nothing can paste as `<Field Missing>`.
2. **Give FCBPrice a key and audit fields.** In Manage Database, open
   `zzTableTemplate`, select all 7 fields, copy them, and paste them into `FCBPrice`
   (`__ID` plus the zzCreated* and zzModified* fields).
3. **Backfill `__ID`.** On the FCBPrice layout, Show All Records, then
   Records > Replace Field Contents > `__ID` > calculated result `Get ( UUIDNumber )`.
   Auto-enter only fills new records, and the tab cannot edit or delete a row that
   has no `__ID`.
4. *(Optional)* Change `FCBPrice::Price` from Text to Number. Both the widget and
   the notes script already treat it as a number.
5. `npm run deploy-to-fm`

## How it works

| Widget action | mode | FileMaker | callback |
|---|---|---|---|
| open tab / Refresh | `priceLoad` | ExecuteSQL of all rows (~420), `__ID` cast to text | `setPriceData(rows, meta)` |
| Edit row / Add item / + Size | `priceSave` `{rows:[{id,sku,tier,price,description}]}` | validates everything first (required fields, numeric price, unique SKU + tier), then writes in a new window | `setPriceResult` |
| Delete | `priceDelete` `{id,label}` | FileMaker confirm; Cancel is the default | `setPriceResult` |

Tiers: `BASE` (S–XL / XS–XL), `2XL`–`6XL`, `ONE` (no size). An empty `id` means a new record.
The widget checks duplicates and prices before it sends anything, and FileMaker checks them again.
