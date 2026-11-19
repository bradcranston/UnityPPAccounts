"""Builds the FCB Locations branches for the "Manage: Accounts" script as a paste-ready
fmxmlsnippet. Step shapes are copied from the existing priceLoad / priceSave / priceDelete
branches in the 10/22/26 DDR, so every step uses layout-by-name and Set Field By Name and
nothing depends on field or layout IDs.

    python3 14-build-location-branches.py   ->  14-fcb-location-branches.xml
"""
import html
import os
import xml.etree.ElementTree as ET

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "14-fcb-location-branches.xml")


def esc(s):
    return html.escape(s, quote=True)


def calc(tag, text):
    return (f"<{tag}><Calculation><![CDATA[{text}]]></Calculation>"
            f"<DisplayCalculation><Chunk type=\"NoRef\">{esc(text)}</Chunk></DisplayCalculation></{tag}>")


def bare_calc(text):
    return (f"<Calculation><![CDATA[{text}]]></Calculation>"
            f"<DisplayCalculation><Chunk type=\"NoRef\">{esc(text)}</Chunk></DisplayCalculation>")


def step(sid, name, text, body=""):
    return (f'<Step enable="True" id="{sid}" name="{esc(name)}"><StepText>{esc(text)}</StepText>'
            f'<DisableStepCollapsed state="False"/>{body}</Step>')


def comment(text=""):
    if not text:
        return step(89, "# (comment)", "", '<Restore state="False"/>')
    return step(89, "# (comment)", "#" + text, f'<Restore state="False"/><Text>{esc(text)}</Text>')


def set_var(name, value):
    return step(141, "Set Variable", f"Set Variable [ {name}; Value:{value} ]",
                calc("Value", value) + calc("Repetition", "1") + f"<Name>{name}</Name>")


def if_(c):
    return step(68, "If", f"If [ {c} ]", '<Restore state="False"/>' + bare_calc(c))


def else_if(c):
    return step(125, "Else If", f"Else If [ {c} ]", '<Restore state="False"/>' + bare_calc(c))


def else_():
    return step(69, "Else", "Else [  ]", '<Restore state="False"/>')


def end_if():
    return step(70, "End If", "End If")


def loop():
    return step(71, "Loop", "Loop [ Flush: Always ]", '<Restore state="False"/><FlushType value="Always"/>')


def exit_loop_if(c):
    return step(72, "Exit Loop If", f"Exit Loop If [ {c} ]", bare_calc(c))


def end_loop():
    return step(73, "End Loop", "End Loop")


def exit_script():
    return step(103, "Exit Script", "Exit Script [  ]")


def new_window():
    # same window the price branches open: a scratch window so the Settings web viewer keeps its state
    return step(122, "New Window",
                "New Window [ Style: Document; Using layout: “PrinterPresence” (PrinterPresence); Close: Yes; "
                "Minimize: Yes; Maximize: Yes; Resize: Yes; Menu Bar: Yes; Dim parent window: No; Toolbars: Yes ]",
                '<LayoutDestination value="SelectedLayout"/>'
                '<NewWndStyles DimParentWindow="No" Toolbars="Yes" MenuBar="Yes" Style="Document" Close="Yes" '
                'Minimize="Yes" Maximize="Yes" Resize="Yes" Styles="1076299266"/>'
                '<Layout id="3" name="PrinterPresence"/>')


def close_window():
    return step(121, "Close Window", "Close Window [ Current Window ]",
                '<LimitToWindowsOfCurrentFile state="True"/><Window value="Current"/>')


def go_to_layout(name):
    return step(6, "Go to Layout", f'Go to Layout [ "{name}" ]',
                '<LayoutDestination value="LayoutNameByCalc"/>'
                f'<Layout id="0" name="">{bare_calc(chr(34) + name + chr(34))}</Layout>')


def enter_find():
    return step(22, "Enter Find Mode", "Enter Find Mode [  ]", '<Pause state="False"/><Restore state="False"/>')


def perform_find():
    return step(28, "Perform Find", "Perform Find [  ]", '<Restore state="False"/>')


def show_all():
    return step(23, "Show All Records", "Show All Records")


def new_record():
    return step(7, "New Record/Request", "New Record/Request")


def delete_record():
    return step(9, "Delete Record/Request", "Delete Record/Request\n[ No dialog ]", '<NoInteract state="True"/>')


def commit():
    return step(75, "Commit Records/Requests", "Commit Records/Requests\n[ No dialog ]",
                '<NoInteract state="True"/><Option state="False"/><ESSForceCommit state="False"/>')


def set_field_by_name(target, value):
    return step(147, "Set Field By Name", f'Set Field By Name [ "{target}"; {value} ]',
                calc("Result", value) + calc("TargetName", f'"{target}"'))


def perform_js(func, params):
    ps = "".join(f"<P>{bare_calc(p)}</P>" for p in params)
    shown = ";".join(f"\n   Parameter {i + 1}:  {p}" for i, p in enumerate(params))
    return step(175, "Perform JavaScript in Web Viewer",
                f'Perform JavaScript in Web Viewer [ Object Name: "web"; Function Name: "{func}";{shown} ]',
                calc("ObjectName", '"web"') + calc("FunctionName", f'"{func}"') +
                f'<Parameters Count="{len(params)}">{ps}</Parameters>')


def dialog_two_buttons(title, message, b1, b2):
    # button 1 is the default; Cancel goes there, matching priceDelete
    return step(87, "Show Custom Dialog",
                f"Show Custom Dialog [ Title: {title}; Message: {message}; Default Button: “{b1}”, Commit: “Yes”; "
                f"Button 2: “{b2}”, Commit: “No” ]",
                calc("Title", title) + calc("Message", message) +
                '<Buttons>'
                f'<Button CommitState="True">{bare_calc(chr(34) + b1 + chr(34))}</Button>'
                f'<Button CommitState="False">{bare_calc(chr(34) + b2 + chr(34))}</Button>'
                '<Button CommitState="False"/>'
                '</Buttons>')


ADDRESS_SQL = (
    'ExecuteSQL ( "select cast(\\"__ID\\" as varchar), \\"Type\\", \\"Center Name\\", \\"RC\\", \\"Color\\", '
    '\\"Address\\", \\"Address2\\", \\"City\\", \\"State\\", \\"ZIP\\", \\"zzModifiedTimestamp\\", \\"zzModifiedName\\" '
    'from \\"Address\\" order by \\"Type\\", \\"Center Name\\", \\"Color\\"" ; Char ( 31 ) ; Char ( 30 ) )'
)

RESULT_LOCATIONS = """Let ( [
  // park real returns on Char(11) so only Char(30) breaks rows
  ~ok = Left ( $raw ; 1 ) <> "?" and not IsEmpty ( $raw ) ;
  ~rows = Substitute ( Substitute ( $raw ; ¶ ; Char ( 11 ) ) ; Char ( 30 ) ; ¶ ) ;
  ~n = If ( ~ok ; ValueCount ( ~rows ) ; 0 )
] ;
While (
  [ ~i = 1 ; ~out = "[]" ] ;
  ~i <= ~n ;
  [
    ~r = Substitute ( GetValue ( ~rows ; ~i ) ; Char ( 31 ) ; ¶ ) ;
    ~p = "[" & ( ~i - 1 ) & "]" ;
    ~out = JSONSetElement ( ~out ;
      [ ~p & ".id" ; GetValue ( ~r ; 1 ) ; JSONString ] ;
      [ ~p & ".type" ; GetValue ( ~r ; 2 ) ; JSONString ] ;
      [ ~p & ".center" ; Substitute ( GetValue ( ~r ; 3 ) ; Char ( 11 ) ; ¶ ) ; JSONString ] ;
      [ ~p & ".rc" ; GetValue ( ~r ; 4 ) ; JSONString ] ;
      [ ~p & ".color" ; Substitute ( GetValue ( ~r ; 5 ) ; Char ( 11 ) ; ¶ ) ; JSONString ] ;
      [ ~p & ".address" ; Substitute ( GetValue ( ~r ; 6 ) ; Char ( 11 ) ; ¶ ) ; JSONString ] ;
      [ ~p & ".address2" ; Substitute ( GetValue ( ~r ; 7 ) ; Char ( 11 ) ; ¶ ) ; JSONString ] ;
      [ ~p & ".city" ; GetValue ( ~r ; 8 ) ; JSONString ] ;
      [ ~p & ".state" ; GetValue ( ~r ; 9 ) ; JSONString ] ;
      [ ~p & ".zip" ; GetValue ( ~r ; 10 ) ; JSONString ] ;
      [ ~p & ".modified" ; GetValue ( ~r ; 11 ) ; JSONString ] ;
      [ ~p & ".modifiedBy" ; GetValue ( ~r ; 12 ) ; JSONString ]
    ) ;
    ~i = ~i + 1
  ] ;
  ~out
) )"""

RESULT_ORDERS = """If ( $findError <> 0 ; "[]" ;
While (
  [ ~i = 1 ; ~n = Get ( FoundCount ) ; ~k = 0 ; ~out = "[]" ] ;
  ~i <= ~n ;
  [
    // number is a calc off the portal, so filter here rather than in the find
    ~fcb = GetNthRecord ( PrinterPresence::number ; ~i ) = 22860 ;
    ~j = If ( ~fcb ; GetNthRecord ( PrinterPresence::messageClean ; ~i ) ; "" ) ;
    ~loc = If ( ~fcb ; JSONGetElement ( ~j ; "payload.message.form_submission.fields.please_select_which_location_you_would_like_your_items_delivered_to:" ) ; "" ) ;
    ~loc = If ( Left ( ~loc ; 1 ) = "?" ; "" ; ~loc ) ;
    ~ts = GetNthRecord ( PrinterPresence::zzCreatedTimestamp ; ~i ) ;
    ~out = If ( IsEmpty ( ~loc ) ; ~out ; JSONSetElement ( ~out ;
      [ "[" & ~k & "].loc" ; ~loc ; JSONString ] ;
      [ "[" & ~k & "].num" ; JSONGetElement ( ~j ; "payload.message.message_tracking_number" ) ; JSONString ] ;
      [ "[" & ~k & "].date" ; Year ( ~ts ) & "-" & Right ( "0" & Month ( ~ts ) ; 2 ) & "-" & Right ( "0" & Day ( ~ts ) ; 2 ) & " " & Right ( "0" & Hour ( ~ts ) ; 2 ) & ":" & Right ( "0" & Minute ( ~ts ) ; 2 ) & ":00" ; JSONString ] ;
      [ "[" & ~k & "].status" ; GetNthRecord ( PrinterPresence::status ; ~i ) ; JSONString ]
    ) ) ;
    ~k = ~k + If ( IsEmpty ( ~loc ) ; 0 ; 1 ) ;
    ~i = ~i + 1
  ] ;
  ~out
) )"""

SAVE_ERRORS = """While (
  [ ~i = 0 ; ~seen = "" ; ~err = "" ] ;
  ~i < $n ;
  [
    ~p = "[" & ~i & "]" ;
    ~id = JSONGetElement ( $rows ; ~p & ".id" ) ;
    ~type = Trim ( JSONGetElement ( $rows ; ~p & ".type" ) ) ;
    ~center = Trim ( JSONGetElement ( $rows ; ~p & ".center" ) ) ;
    ~color = Trim ( JSONGetElement ( $rows ; ~p & ".color" ) ) ;
    ~rc = Trim ( JSONGetElement ( $rows ; ~p & ".rc" ) ) ;
    ~missing = IsEmpty ( Trim ( JSONGetElement ( $rows ; ~p & ".address" ) ) ) or IsEmpty ( Trim ( JSONGetElement ( $rows ; ~p & ".city" ) ) ) or IsEmpty ( Trim ( JSONGetElement ( $rows ; ~p & ".state" ) ) ) or IsEmpty ( Trim ( JSONGetElement ( $rows ; ~p & ".zip" ) ) ) ;
    // the same lookups process data - individual runs; a second hit there turns $addressId into a list
    ~key = If ( ~type = "IFC" ; "IFC|" & ~center ; "COLOR|" & Lower ( ~color ) ) ;
    ~dup = GetAsNumber ( If ( ~type = "IFC" ;
      ExecuteSQL ( "select count(*) from \\"Address\\" where \\"Type\\" = 'IFC' and \\"Center Name\\" = ? and cast(\\"__ID\\" as varchar) <> ?" ; "" ; "" ; ~center ; If ( IsEmpty ( ~id ) ; "0" ; ~id ) ) ;
      ExecuteSQL ( "select count(*) from \\"Address\\" where \\"Type\\" = 'Color' and lower(\\"Color\\") = ? and cast(\\"__ID\\" as varchar) <> ?" ; "" ; "" ; Lower ( ~color ) ; If ( IsEmpty ( ~id ) ; "0" ; ~id ) )
    ) ) ;
    ~label = Case ( ~type = "Color" and not IsEmpty ( ~color ) ; ~color & " (" & ~center & ")" ; not IsEmpty ( ~center ) ; ~center ; "Row " & ( ~i + 1 ) ) ;
    ~err = List ( ~err ;
      Case (
        ~type <> "IFC" and ~type <> "Color" ; ~label & ": pick IFC office or storeroom color." ;
        IsEmpty ( ~center ) ; ~label & ": " & If ( ~type = "IFC" ; "office name" ; "storeroom name" ) & " is required." ;
        ~type = "Color" and IsEmpty ( ~color ) ; ~label & ": color is required." ;
        // orders are matched on the text before the bracket with "Office" removed (case-sensitive)
        ~type = "IFC" and ( PatternCount ( ~center ; "(" ) or not Exact ( Substitute ( ~center ; "Office" ; "" ) ; ~center ) ) ; ~label & ": leave off the bracket and the word Office - orders match on the name before the bracket." ;
        ~type = "Color" and ( PatternCount ( ~color ; "(" ) or PatternCount ( ~color ; ")" ) ) ; ~label & ": enter the color without brackets." ;
        ~missing ; ~label & ": street, city, state and ZIP are required." ;
        not IsEmpty ( ~rc ) and Filter ( ~rc ; "0123456789" ) <> ~rc ; ~label & ": RC must be a number." ;
        ~dup > 0 ; ~label & If ( ~type = "IFC" ; ": there is already an IFC office with this name." ; ": this color already belongs to a storeroom." ) ;
        PatternCount ( ¶ & ~seen & ¶ ; ¶ & ~key & ¶ ) ; ~label & ": listed twice." ;
        ""
      )
    ) ;
    ~seen = List ( ~seen ; ~key ) ;
    ~i = ~i + 1
  ] ;
  ~err
)"""


def branches():
    s = []
    # ---------------- locationLoad
    s += [
        else_if('$mode = "locationLoad"'),
        comment(),
        comment("FCB Locations tab: every Address row, plus the delivery answer on recent FCB orders. 10/22/26 bc"),
        comment("process data - individual matches an FCB order's \"Please select which location...\" answer against"),
        comment("these rows: answers containing (IFC) on Center Name + Type IFC, all others on the color in"),
        comment("brackets + Type Color. The widget repeats that match to show what each answer resolves to."),
        comment("__ID is a 58-digit UUIDNumber - CAST to text so JavaScript never rounds it."),
        comment(),
        set_var("$raw", ADDRESS_SQL),
        set_var("$resultLocations", RESULT_LOCATIONS),
        comment(),
        comment("recent orders: find by date in a scratch window, read with GetNthRecord"),
        set_var("$days", 'Let ( ~d = GetAsNumber ( JSONGetElement ( $param ; "days" ) ) ; If ( ~d > 0 ; ~d ; 90 ) )'),
        new_window(),
        go_to_layout("PrinterPresence"),
        enter_find(),
        set_field_by_name("PrinterPresence::zzCreatedTimestamp", '"≥" & GetAsText ( Get ( CurrentTimestamp ) - $days * 86400 )'),
        perform_find(),
        set_var("$findError", "Get ( LastError )"),
        set_var("$resultOrders", RESULT_ORDERS),
        close_window(),
        set_var("$meta", 'JSONSetElement ( "" ; [ "sqlError" ; Case ( Left ( $raw ; 1 ) = "?" ; "Could not read the Address table." ; "" ) ; JSONString ] ; [ "days" ; $days ; JSONNumber ] )'),
        perform_js("setLocationData", ["$resultLocations", "$resultOrders", "$meta"]),
        comment(),
        comment("--- end of locationLoad branch ---"),
        comment(),
    ]
    # ---------------- locationSave
    s += [
        else_if('$mode = "locationSave"'),
        comment(),
        comment("Add or update Address rows. Parameter: { rows: [ { id, type, center, rc, color, address, address2, city, state, zip } ] }"),
        comment("One row for an IFC office or a color; editing a storeroom sends every color in it."),
        comment("An empty id means a new record. Everything is validated before anything is written."),
        comment(),
        set_var("$rows", 'JSONGetElement ( $param ; "rows" )'),
        set_var("$n", 'If ( Left ( $rows ; 1 ) = "[" ; ValueCount ( JSONListKeys ( $rows ; "" ) ) ; 0 )'),
        comment("validation: required fields, names the order lookup can actually match, and no second match"),
        set_var("$errors", SAVE_ERRORS),
        if_("$n = 0 or not IsEmpty ( $errors )"),
        set_var("$out", 'JSONSetElement ( "" ; [ "ok" ; False ; JSONBoolean ] ; [ "action" ; "save" ; JSONString ] ; [ "errors" ; If ( $n = 0 ; "Nothing to save." ; $errors ) ; JSONString ] )'),
        perform_js("setLocationResult", ["$out"]),
        exit_script(),
        end_if(),
        comment(),
        comment("work in a separate window so the web viewer on Settings keeps its state"),
        new_window(),
        go_to_layout("Address"),
        set_var("$i", "0"),
        set_var("$saved", "0"),
        set_var("$fail", '""'),
        loop(),
        exit_loop_if("$i >= $n"),
        set_var("$p", '"[" & $i & "]"'),
        set_var("$id", 'JSONGetElement ( $rows ; $p & ".id" )'),
        set_var("$type", 'Trim ( JSONGetElement ( $rows ; $p & ".type" ) )'),
        set_var("$center", 'Trim ( JSONGetElement ( $rows ; $p & ".center" ) )'),
        set_var("$label", 'If ( $type = "Color" ; Trim ( JSONGetElement ( $rows ; $p & ".color" ) ) & " (" & $center & ")" ; $center )'),
        if_("IsEmpty ( $id )"),
        new_record(),
        else_(),
        enter_find(),
        set_field_by_name("Address::__ID", "$id"),
        perform_find(),
        end_if(),
        if_("not IsEmpty ( $id ) and Get ( FoundCount ) <> 1"),
        set_var("$fail", 'List ( $fail ; $label & ": record not found (deleted by someone else?)." )'),
        show_all(),
        else_(),
        set_field_by_name("Address::Type", "$type"),
        set_field_by_name("Address::Center Name", "$center"),
        set_field_by_name("Address::RC", 'Trim ( JSONGetElement ( $rows ; $p & ".rc" ) )'),
        set_field_by_name("Address::Color", 'If ( $type = "Color" ; Trim ( JSONGetElement ( $rows ; $p & ".color" ) ) ; "" )'),
        set_field_by_name("Address::Address", 'Trim ( JSONGetElement ( $rows ; $p & ".address" ) )'),
        set_field_by_name("Address::Address2", 'Trim ( JSONGetElement ( $rows ; $p & ".address2" ) )'),
        set_field_by_name("Address::City", 'Trim ( JSONGetElement ( $rows ; $p & ".city" ) )'),
        set_field_by_name("Address::State", 'Upper ( Trim ( JSONGetElement ( $rows ; $p & ".state" ) ) )'),
        set_field_by_name("Address::ZIP", 'Trim ( JSONGetElement ( $rows ; $p & ".zip" ) )'),
        commit(),
        if_("Get ( LastError ) <> 0"),
        set_var("$fail", 'List ( $fail ; $label & ": FileMaker error " & Get ( LastError ) & " while saving." )'),
        else_(),
        set_var("$saved", "$saved + 1"),
        end_if(),
        end_if(),
        set_var("$i", "$i + 1"),
        end_loop(),
        close_window(),
        comment(),
        set_var("$out", 'JSONSetElement ( "" ; [ "ok" ; IsEmpty ( $fail ) ; JSONBoolean ] ; [ "action" ; "save" ; JSONString ] ; [ "saved" ; $saved ; JSONNumber ] ; [ "errors" ; $fail ; JSONString ] )'),
        perform_js("setLocationResult", ["$out"]),
        comment(),
        comment("--- end of locationSave branch ---"),
        comment(),
    ]
    # ---------------- locationDelete
    s += [
        else_if('$mode = "locationDelete"'),
        comment(),
        comment("Delete one Address row after a FileMaker confirm. Cancel is button 1 (the default)."),
        comment("Orders already sent keep their address - PrintSmith got a copy. Only new orders are affected."),
        comment(),
        set_var("$id", 'JSONGetElement ( $param ; "id" )'),
        set_var("$label", 'JSONGetElement ( $param ; "label" )'),
        if_("IsEmpty ( $id )"),
        exit_script(),
        end_if(),
        dialog_two_buttons('"Delete this location?"',
                           '$label & ¶ & ¶ & "New FCB orders that pick it will reach PrintSmith with no ship-to address and a CHECK DELIVERY note until it is added back. Orders already sent are not changed."',
                           "Cancel", "Delete"),
        if_("Get ( LastMessageChoice ) <> 2"),
        set_var("$out", 'JSONSetElement ( "" ; [ "ok" ; False ; JSONBoolean ] ; [ "action" ; "delete" ; JSONString ] ; [ "cancelled" ; True ; JSONBoolean ] )'),
        perform_js("setLocationResult", ["$out"]),
        exit_script(),
        end_if(),
        comment(),
        new_window(),
        go_to_layout("Address"),
        enter_find(),
        set_field_by_name("Address::__ID", "$id"),
        perform_find(),
        if_("Get ( FoundCount ) = 1"),
        delete_record(),
        set_var("$fail", 'If ( Get ( LastError ) <> 0 ; "FileMaker error " & Get ( LastError ) & " while deleting." ; "" )'),
        else_(),
        set_var("$fail", '"That location was already gone."'),
        end_if(),
        close_window(),
        set_var("$out", 'JSONSetElement ( "" ; [ "ok" ; IsEmpty ( $fail ) ; JSONBoolean ] ; [ "action" ; "delete" ; JSONString ] ; [ "id" ; $id ; JSONString ] ; [ "errors" ; $fail ; JSONString ] )'),
        perform_js("setLocationResult", ["$out"]),
        comment(),
        comment("--- end of FCB location branches ---"),
    ]
    return s


def main():
    xml = '<fmxmlsnippet type="FMObjectList">' + "".join(branches()) + "</fmxmlsnippet>"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(xml)

    # validate: well-formed, and If/Loop balanced (Else If opens nothing new - it continues the caller's If)
    root = ET.parse(OUT).getroot()
    depth_if = depth_loop = 0
    for st in root.findall("Step"):
        n = st.get("name")
        depth_if += {"If": 1, "End If": -1}.get(n, 0)
        depth_loop += {"Loop": 1, "End Loop": -1}.get(n, 0)
        assert depth_if >= 0 and depth_loop >= 0, f"unbalanced at {n}"
    assert depth_if == 0 and depth_loop == 0, "unbalanced If/Loop"
    print(f"wrote {OUT}: {len(root.findall('Step'))} steps, balanced")


if __name__ == "__main__":
    main()
