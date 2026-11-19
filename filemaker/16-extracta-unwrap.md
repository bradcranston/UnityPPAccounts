# 16 - extractaWebhook: unwrap the SimpleQ message

Unity_SimpleQ delivers every message as `{"message": <payload>, "messageId": …, "queueId": …}`
(`deliver staticDSN message`, step 21). `PP_PS_API::webhook` expects that, but `Unity_PO::extractaWebhook`
read `result[i]result` from the top of the parameter. It found nothing, exited, and still reported
success, so queue rows showed "Delivered" and no PO was filled in. This unwraps `message` when
`messageId` is present, so a raw payload still works too, and starts `$i` at 0.

## Install (Unity_PO, script `extractaWebhook`)

1. Click step 12, `Set Variable [ $param; Value:Get(ScriptParameter) ]`.
2. Paste (`16-extracta-unwrap.xml` is already on the clipboard). That adds 3 steps after it: the
   comment, `Set Variable [ $param; … ]` and `Set Variable [ $i; Value:0 ]`. The next step should be
   `Loop [ Flush: Always ]`.
3. Save the script.
4. Test by sending one extracta document, or by pressing Retry on a delivered extracta row in
   Unity_SimpleQ. Check that the PO gets a Date, Number, Vendor and line items.

## Noticed, not changed

- The items loop reuses `$i` from the outer loop over `result[]`. With one result per webhook,
  which is what extracta sends, this is harmless. With several results, the second and later ones would
  be skipped.
- Earlier deliveries that left blank POs (e.g. 406527-SM, from the 11:24:19 message) won't fill in
  on their own. Retry them after pasting. The script finds the PO by `fileId` and updates it, but the
  items loop adds line items again each time it runs, so retry a PO only once.
