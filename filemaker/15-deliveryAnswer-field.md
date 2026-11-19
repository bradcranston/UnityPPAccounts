# PrinterPresence::deliveryAnswer: new stored calculation field (10/22/2026)

One field, same pattern as the calc fields in **01-PrinterPresence-calc-fields.md**. It exposes FCB's
delivery-location answer so the `fcb-order-trace` skill (and anything else) can read it with one
SQL query instead of pulling the ~100 KB `messageClean` blob. FileMaker SQL has no `POSITION`, so
the answer can't be cut out of `messageClean` in the query itself.

## Add the field

Manage > Database > PrinterPresence > Fields. New field `deliveryAnswer`, **Calculation**, result
**Text**, storage **stored** (leave "Do not store" unchecked).

```
JSONGetElementValid ( PrinterPresence::messageClean ; "payload.message.form_submission.fields.please_select_which_location_you_would_like_your_items_delivered_to:" )
```

This is the exact expression `process data - individual` uses for `$locationDelivered`, so the
field always shows what the script saw. It's empty for non-FCB orders.

Expect a minute or two while it evaluates across the ~8,000 existing records. No script or widget
changes needed.
