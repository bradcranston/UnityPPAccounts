# PrinterPresence — new stored calculation fields

Add these 7 fields to the **PrinterPresence** table (Manage > Database > Fields).
All are **Calculation**, storage **stored** (leave "Do not store" UNCHECKED), and they
reference only PrinterPresence fields, so FileMaker will allow storage.

They exist so the Log tab can pull order data straight out of OData with
`$select` / `$filter` / `$orderby`, instead of parsing a 100 KB `messageClean`
blob 200 times per page load. Adding them re-evaluates once across the 7,153
existing records (expect a minute or two), then costs nothing.

---

## 1. orderNumber — result: Text

```
JSONGetElementValid ( PrinterPresence::messageClean ; "payload.message.message_tracking_number" )
```

## 2. orderDate — result: Timestamp

```
Let ([
~tsraw = JSONGetElementValid ( PrinterPresence::messageClean ; "date_created" ) ;
~l  = Substitute ( ~tsraw ; [ ":" ; ¶ ] ; [ "-" ; ¶ ] ; [ " " ; ¶ ] ; [ "T" ; ¶ ] ; [ "+" ; ¶ ] ) ;
~y  = GetValue ( ~l ; 1 ) ;
~mo = GetValue ( ~l ; 2 ) ;
~d  = GetValue ( ~l ; 3 ) ;
~h  = GetValue ( ~l ; 4 ) ;
~mi = GetValue ( ~l ; 5 ) ;
~s  = GetValue ( ~l ; 6 )
] ;
If ( IsEmpty ( ~tsraw ) ; "" ;
	Timestamp ( Date ( ~mo ; ~d ; ~y ) ; Time ( ~h ; ~mi ; ~s ) )
)
)
```

## 3. customerName — result: Text

Same fallback chain the process scripts walk, collapsed into one calculation.

```
Let ([
~f  = "payload.message.form_submission.fields." ;
~n1 = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "name" ) ;
~n2 = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "your_name" ) ;
~n3 = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "first_&_last_name" ) ;
~n4 = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "unknown_field_label_f34712061" ) ;
~n5 = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "ordered_by" ) ;
~fn = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "first_name" ) ;
~ln = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "last_name" )
] ;
Trim ( Case (
	not IsEmpty ( ~n1 ) ; ~n1 ;
	not IsEmpty ( ~n2 ) ; ~n2 ;
	not IsEmpty ( ~n3 ) ; ~n3 ;
	not IsEmpty ( ~n4 ) ; ~n4 ;
	not IsEmpty ( ~n5 ) ; ~n5 ;
	Trim ( ~fn & " " & ~ln )
) )
)
```

## 4. customerEmail — result: Text

```
Let ([
~f  = "payload.message.form_submission.fields." ;
~e1 = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "e_mail_address" ) ;
~e2 = JSONGetElementValid ( PrinterPresence::messageClean ; ~f & "email" )
] ;
Trim ( If ( not IsEmpty ( ~e1 ) ; ~e1 ; ~e2 ) )
)
```

## 5. orderAmount — result: Number

Mirrors the cents-vs-dollars handling in the process scripts.

```
Let ([
~a = JSONGetElementValid ( PrinterPresence::messageClean ; "payload.message.payment_transactions.data[]amount" )
] ;
If ( IsEmpty ( ~a ) ; "" ;
	If ( PatternCount ( ~a ; "." ) ;
		GetAsNumber ( ~a ) ;
		Round ( GetAsNumber ( ~a ) / 100 ; 2 )
	)
)
)
```

## 6. itemCount — result: Number

```
Let ([
~arr = JSONGetElement ( PrinterPresence::messageClean ; "payload.items.data" )
] ;
If ( IsEmpty ( ~arr ) or ~arr = "?" ; 0 ; ValueCount ( JSONListKeys ( ~arr ; "" ) ) )
)
```

## 7. itemTitles — result: Text

```
While (
	[ ~arr = JSONGetElement ( PrinterPresence::messageClean ; "payload.items.data" ) ;
	  ~n   = If ( IsEmpty ( ~arr ) or ~arr = "?" ; 0 ; ValueCount ( JSONListKeys ( ~arr ; "" ) ) ) ;
	  ~i   = 0 ;
	  ~out = "" ] ;
	~i < ~n ;
	[ ~out = ~out & If ( ~i > 0 ; ¶ ) & JSONGetElement ( ~arr ; "[" & ~i & "].title" ) ;
	  ~i   = ~i + 1 ] ;
	~out
)
```

---

## After adding them

The OData account (`odata`) already has access to the whole PrinterPresence table,
so no privilege change is needed — the new fields are selectable immediately.

Quick sanity check from the PrinterPresence layout: put the 7 fields on the layout
(or just look at one record in Table view) and confirm a recent record shows a real
order number, a real customer name, and a dollar amount that matches what the
`result` field reported back from PrintSmith.

---

## 8. idText — result: Text  ← do not skip this one

```
GetAsText ( PrinterPresence::__ID )
```

`PrinterPresence::__ID` auto-enters `Get ( UUIDNumber )`, which is a 58-digit
**number**. OData emits number fields unquoted, and JavaScript silently rounds
anything past 15-16 digits — so the raw `__ID` arrives in the web viewer as a
different number than the one in FileMaker, and the re-run button would target
the wrong record or none at all.

`idText` hands the same value to the browser as a quoted string, which survives
intact. The Log tab keys every row on it.
