# The parity inventory of version 1.3

This page lists every element and behaviour of 3D-Baukasten 1.3 that version 2.0 keeps at its
place, one record per number `P-nnn` of the parity plan, with the record of the window F6 that the
EXE holds (`P-200a`) and the tool tip of its combo CB3 (`P-203b`). Notebook 80 writes the page from
[tests/fixtures/parity.json](../tests/fixtures/parity.json), and a change goes into that file and
not into this page. The notebook walks every record in both looks: an element must exist once, lie
inside its container, keep its order among its group and show its text, and in the classic look at
1024 by 768 its place must equal the twips of 1.3 within 2 px.

The column Kind says how a record is checked. An `element` is a control at a place, a
`menu-entry` an entry of a menu or of a drop-down list, a `tooltip` the tool tip of a control, a
`state` a value of the page that the expression of the fixture tests, a `message` a text of a
message box or of the status field, a `key` a key and what it does, a `behaviour` a behaviour that
the notebook section in the column Checked in proves, and `absent` an element of 1.3 that 2.0 does
not build on purpose. The column Twips gives left, top, width and height of 1.3 relative to the
client of the container, 15 twips to the pixel. Where a decision stands in
[quirks.md](quirks.md), the note names its ID.

The inventory holds 196 records. By kind:

| Kind | Records |
| --- | --- |
| `absent` | 3 |
| `behaviour` | 54 |
| `element` | 99 |
| `key` | 2 |
| `menu-entry` | 14 |
| `message` | 3 |
| `state` | 20 |
| `tooltip` | 1 |

By look:

| Looks | Records |
| --- | --- |
| classic | 4 |
| modern | 2 |
| modern and classic | 190 |

## Records

| ID | Name | Kind | Selector | Container | Tab | Order | Group | Text | Looks | Twips | Trigger | Effect | Checked in | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-001 | Main window 3D-Baukasten | `element` | `#caption` | `#form1` |  |  |  | modern: 3D-Baukasten | modern classic |  |  |  |  | Form1. The classic caption follows 3D-Baukasten with a hyphen and the name of the scene, the modern look shows the name in the field #scene-name after the caption (Q-2). |
| P-002 | Default arrangement of the windows, Form_Set | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §6, 70 §1 | F3 at the top left, F2 under it, Form1 in the middle, F4 at the right edge with F6 under it, F5 under Form1. |
| P-003 | Automatic sizing of the views, ViewControl | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §6, 70 §2 | Four squares of F/2 in the classic look, F from the client size, four equal rectangles in the modern look. |
| P-004 | F2 and F3 stay above the other windows | `behaviour` |  |  |  |  |  |  | classic |  |  |  | 70 §15 | Q-71. Only above the windows of the page, not above other programs. |
| P-005 | Virtual screens of the classic look | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 70 §1, 70 §16 | 800 by 600, 1024 by 768 (the default), 1280 by 1024 or the window of the browser, chosen in Bildschirmeinstellungen. |
| P-006 | Repaint of the views | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §7 | The worker draws a whole frame after every change. |
| P-007 | Close button of a tool window | `element` | `#f3 .win-close` | `#f3` |  |  |  | Schließen | classic |  |  |  | 70 §15 | Hides the window, Ansicht › Alle Fenster zeigen shows it again. The modern panels have none. |
| P-008 | Captions of the small windows | `element` | `#f2 .win-caption` | `#f2` |  |  |  | 3D | classic |  |  |  |  | F3 has no caption, F4 reads Eingaben, F6 Farben/Texturen, F5 has no title bar. The attribute data-classic-caption carries the text of 1.3, and the modern panels name themselves in aria-label, Körper for F2. |
| P-010 | Menu bar and its order | `element` | `#menubar` | `#form1` |  |  |  |  | modern classic |  |  |  | 60 §1 | Datei, Bearbeiten, Objekte and Ansicht in the order of 1.3, then Hilfe, new in 2.0. |
| P-011 | Datei › Neu | `menu-entry` | `#menubar [data-menu="datei"] [data-entry="neu"]` | `#form1` |  | 0 | `#menubar [data-menu="datei"] > .menu-popup > .menu-entry` | Neu | modern classic |  | `menu:datei` |  |  | Strg+N. Asks Wollen Sie wirklich alle Objekte entfernen? under the title FRAGE. |
| P-012 | Datei › Öffnen | `menu-entry` | `#menubar [data-menu="datei"] [data-entry="oeffnen"]` | `#form1` |  | 1 | `#menubar [data-menu="datei"] > .menu-popup > .menu-entry` | Öffnen … | modern classic |  | `menu:datei` |  |  | Strg+O. A dead entry in 1.3, opens #open-dialog in 2.0. |
| P-013 | Datei › Speichern | `menu-entry` | `#menubar [data-menu="datei"] [data-entry="speichern"]` | `#form1` |  | 2 | `#menubar [data-menu="datei"] > .menu-popup > .menu-entry` | Speichern | modern classic |  | `menu:datei` |  |  | Strg+S. Übersetzen and Ausgeben, as in 1.3. |
| P-014 | Datei › Speichern unter | `menu-entry` | `#menubar [data-menu="datei"] [data-entry="speichern-unter"]` | `#form1` |  | 3 | `#menubar [data-menu="datei"] > .menu-popup > .menu-entry` | Speichern unter … | modern classic |  | `menu:datei` |  |  | A dead entry in 1.3, saves the scene file in 2.0. |
| P-015 | Datei › Schließen | `menu-entry` | `#menubar [data-menu="datei"] [data-entry="schliessen"]` | `#form1` |  | 4 | `#menubar [data-menu="datei"] > .menu-popup > .menu-entry` | Schließen | modern classic |  | `menu:datei` |  |  | A dead entry in 1.3, closes the scene in 2.0. |
| P-016 | Datei › Beenden | `menu-entry` | `#menubar [data-menu="datei"] [data-entry="beenden"]` | `#form1` |  | 8 | `#menubar [data-menu="datei"] > .menu-popup > .menu-entry` | Beenden | modern classic |  | `menu:datei` |  |  | Asks Programm beenden? first. Umbenennen, Beispiele and Link kopieren stand between Schließen and Beenden. |
| P-017 | Menu Bearbeiten | `element` | `#menubar [data-menu="bearbeiten"] > .menu-title` | `#menubar` |  | 1 | `#menubar > .menu-item > .menu-title` | Bearbeiten | modern classic |  |  |  |  | Empty in 1.3, holds the editing entries of 2.0. |
| P-018 | Menu Objekte | `element` | `#menubar [data-menu="objekte"] > .menu-title` | `#menubar` |  | 2 | `#menubar > .menu-item > .menu-title` | Objekte | modern classic |  |  |  |  | Empty in 1.3, holds the nine bodies and the entries of CB1. |
| P-019 | Menu Ansicht | `element` | `#menubar [data-menu="ansicht"] > .menu-title` | `#menubar` |  | 3 | `#menubar > .menu-item > .menu-title` | Ansicht | modern classic |  |  |  |  | Empty in 1.3, holds the zooms, the looks and the windows. |
| P-020 | Accelerators of the menus | `key` | `#menubar [data-menu="datei"] > .menu-title` | `#menubar` |  |  |  | Datei | modern classic |  | `key:Alt+d` | `!document.querySelector('#menubar [data-menu="datei"] > .menu-popup').hidden` |  | Alt+D opens Datei, and Alt+B, Alt+O, Alt+A and Alt+H open the other menus. Strg+N, Strg+O and Strg+S are the shortcuts of 1.3. |
| P-030 | Kreuzriss | `element` | `.view[data-view="1"]` | `#form1` |  | 0 | `#views > .view` | Kreuzriss | modern classic |  |  |  |  | Top left, x to the left and z up. |
| P-031 | Aufriss | `element` | `.view[data-view="0"]` | `#form1` |  | 1 | `#views > .view` | Aufriss | modern classic |  |  |  |  | Top right, y to the right and z up. |
| P-032 | Grundriss | `element` | `.view[data-view="2"]` | `#form1` |  | 3 | `#views > .view` | Grundriss | modern classic |  |  |  |  | Bottom right, y to the right and x down. |
| P-033 | Schrägriss | `element` | `.view[data-view="3"]` | `#form1` |  | 2 | `#views > .view` | Schrägriss | modern classic |  |  |  |  | Bottom left, the cavalier projection of 1.3 in the classic look. |
| P-034 | Dot raster of the 2D views | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 20 §9, 70 §5 | White dots on black in the classic look over the whole view. |
| P-035 | Axis cross from -2 to 10 | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 20 §1, 70 §9 |  |
| P-036 | First octant | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 20 §3, 20 §12 | Not enforced, negative values are accepted. |
| P-037 | Square units of the views | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 20 §1 | Q-21 is fixed in both looks. |
| P-038 | Snap to the raster | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | Step 1 by default, Alt and Shift in the modern look only. |
| P-039 | Mouse move in a 2D view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §5 | Two fields of F5, the third greyed in the modern look. |
| P-040 | Mouse move in the 3D view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §5 |  |
| P-041 | Left click in a 2D view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | The handshake mark_point. |
| P-042 | Right and middle click in a 2D view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §5 | Pan in 2.0, nothing in 1.3. |
| P-043 | Left click in the 3D view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §7 | Zooms the 3D view in, not the 2D views (Q-52). |
| P-044 | Right click in the 3D view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §7 | Zooms the 3D view out. |
| P-045 | Middle click in the 3D view, Zoomed_d3 | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §6 | The oblique view over the four fields. |
| P-046 | Cursor in the views | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 90 §5 | Arrow in the classic look, a crosshair while placing in the modern look. |
| P-047 | 2D zoom in | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §7, 20 §11 | Times 1.2 while below 50. |
| P-048 | 2D zoom out | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §7, 20 §11 | Divided by 1.2 while above 5. |
| P-049 | 3D zoom in and out | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §7 | Its own ladder, kept across inserts. |
| P-050 | Start zoom | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §8 | zoomf 12 and d3zoomf 10 at the start. |
| P-051 | Range of the zoom | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 20 §11 | 4.823 to 51.598, about 50 to 500 percent. |
| P-052 | Colours of the marks | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | Green, yellow and red crosses. |
| P-053 | Wire colours of the bodies | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 70 §5 | The colour of the item, 12-gon wires in the classic look. |
| P-054 | Raster of the 3D view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 20 §8 | A 10 by 10 grid and the axes, white in the classic look. |
| P-060 | Tool button 1 Position | `element` | `#tb1 .tb-button[data-tool="1"]` | `#f3` |  | 0 | `#tb1 > .tb-button` | Position | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-061 | Tool button 2 Körper einfügen | `element` | `#tb1 .tb-button[data-tool="2"]` | `#f3` |  | 1 | `#tb1 > .tb-button` | Körper einfügen | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-062 | Tool button 3 Bearbeiten | `element` | `#tb1 .tb-button[data-tool="3"]` | `#f3` |  | 2 | `#tb1 > .tb-button` | Bearbeiten | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-063 | Tool button 4 Farbe ändern | `element` | `#tb1 .tb-button[data-tool="4"]` | `#f3` |  | 3 | `#tb1 > .tb-button` | Farbe ändern | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-064 | Tool button 5 Raytrace | `element` | `#tb1 .tb-button[data-tool="5"]` | `#f3` |  | 4 | `#tb1 > .tb-button` | Raytrace | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-065 | Tool button 6 3D-Zoom | `element` | `#tb1 .tb-button[data-tool="6"]` | `#f3` |  | 5 | `#tb1 > .tb-button` | 3D-Zoom | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-066 | Tool button 7 Ausgabe | `element` | `#tb1 .tb-button[data-tool="7"]` | `#f3` |  | 6 | `#tb1 > .tb-button` | Ausgabe | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-067 | Tool button 8 Beenden | `element` | `#tb1 .tb-button[data-tool="8"]` | `#f3` |  | 7 | `#tb1 > .tb-button` | Beenden | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-068 | Tool button 9 Dia-Show | `element` | `#tb1 .tb-button[data-tool="9"]` | `#f3` |  | 8 | `#tb1 > .tb-button` | Dia-Show | modern classic |  |  |  |  | The tool tip of 1.3. |
| P-069 | Tool button 10 Rückgängig | `element` | `#tb1 .tb-button[data-tool="10"]` | `#f3` |  | 9 | `#tb1 > .tb-button` | Rückgängig (Strg+Z) | modern classic |  |  |  |  | A blank button in 1.3, new in 2.0 (Q-77). |
| P-070 | Tool button 11 Wiederholen | `element` | `#tb1 .tb-button[data-tool="11"]` | `#f3` |  | 10 | `#tb1 > .tb-button` | Wiederholen (Strg+Y) | modern classic |  |  |  |  | A blank button in 1.3, new in 2.0 (Q-77). |
| P-071a | Tool button 12 Darstellung: Modern oder Klassisch | `element` | `#tb1 .tb-button[data-tool="12"]` | `#f3` |  | 11 | `#tb1 > .tb-button` | Darstellung: Modern oder Klassisch | modern classic |  |  |  |  | A blank button in 1.3, new in 2.0 (Q-77). |
| P-071b | Tool button 13 Hilfe | `element` | `#tb1 .tb-button[data-tool="13"]` | `#f3` |  | 12 | `#tb1 > .tb-button` | Hilfe (?) | modern classic |  |  |  |  | A blank button in 1.3, new in 2.0 (Q-77). F3 is 500 px high at every screen, so the classic window cuts the last button off, as the tool bar of 1.3, 460 px high, did. |
| P-072 | Body button 1 Kugel | `element` | `#tb2 .tb-button[data-body="Kugel"]` | `#f2` |  | 0 | `#tb2 > .tb-button` | Kugel | modern classic |  |  |  |  |  |
| P-073 | Body button 2 Kegel | `element` | `#tb2 .tb-button[data-body="Kegel"]` | `#f2` |  | 1 | `#tb2 > .tb-button` | Kegel | modern classic |  |  |  |  | F2 shows one body at 800 by 600 and five at 1024 by 768 in the classic look (Q-14). |
| P-074 | Body button 3 Zylinder | `element` | `#tb2 .tb-button[data-body="Zylinder"]` | `#f2` |  | 2 | `#tb2 > .tb-button` | Zylinder | modern classic |  |  |  |  | F2 shows one body at 800 by 600 and five at 1024 by 768 in the classic look (Q-14). |
| P-075 | Body button 4 Würfel | `element` | `#tb2 .tb-button[data-body="Würfel"]` | `#f2` |  | 3 | `#tb2 > .tb-button` | Würfel | modern classic |  |  |  |  | F2 shows one body at 800 by 600 and five at 1024 by 768 in the classic look (Q-14). |
| P-076 | Body button 5 Quader | `element` | `#tb2 .tb-button[data-body="Quader"]` | `#f2` |  | 4 | `#tb2 > .tb-button` | Quader | modern classic |  |  |  |  | F2 shows one body at 800 by 600 and five at 1024 by 768 in the classic look (Q-14). |
| P-077 | Body button 6 Pyramide | `element` | `#tb2 .tb-button[data-body="Pyramide"]` | `#f2` |  | 5 | `#tb2 > .tb-button` | Pyramide | modern classic |  |  |  |  | F2 shows one body at 800 by 600 and five at 1024 by 768 in the classic look (Q-14). |
| P-078 | Body button 7 Prisma | `element` | `#tb2 .tb-button[data-body="Prisma"]` | `#f2` |  | 6 | `#tb2 > .tb-button` | Prisma | modern classic |  |  |  |  | F2 shows one body at 800 by 600 and five at 1024 by 768 in the classic look (Q-14). |
| P-079 | Body button 8 Disc | `element` | `#tb2 .tb-button[data-body="Disc"]` | `#f2` |  | 7 | `#tb2 > .tb-button` | Disc | modern classic |  |  |  |  | A blank button in 1.3, an icon in 2.0 (Q-68). F2 shows one body at 800 by 600 and five at 1024 by 768 in the classic look (Q-14). |
| P-080 | Body button 9 Ebene | `element` | `#tb2 .tb-button[data-body="Ebene"]` | `#f2` |  | 8 | `#tb2 > .tb-button` | Ebene | modern classic |  |  |  |  | A blank button in 1.3. Inserts nothing in this version (Q-69). F2 shows one body at 800 by 600 and five at 1024 by 768 in the classic look (Q-14). |
| P-081 | Visible height of the body bar | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 70 §16 | One body at 800 by 600 and five at 1024 by 768 in the classic look, no scroll bar. |
| P-090 | Label x | `element` | `#lx` | `#f5` |  |  |  | x | modern classic | 120 120 255 255 |  |  |  | In Frame2 at 0, 0. The colour #120000 of 1.3 is drawn black (Q-91). |
| P-091 | Field Tx | `element` | `#tx` | `#f5` |  | 0 | `#f5 input, #f5 button, #f5 output` |  | modern classic | 240 120 735 330 |  |  |  | Red digits on black. |
| P-092 | Label y and field Ty | `element` | `#ty` | `#f5` |  | 1 | `#f5 input, #f5 button, #f5 output` |  | modern classic | 1200 120 735 330 |  |  |  | Yellow digits on black. The label y stands at 1080, 120. |
| P-093 | Label z and field Tz | `element` | `#tz` | `#f5` |  | 2 | `#f5 input, #f5 button, #f5 output` |  | modern classic | 2160 120 735 315 |  |  |  | Green digits on black. The label z stands at 2040, 120. |
| P-094 | Label 3D and its buttons | `element` | `#d3-zoomin` | `#f5` |  | 3 | `#f5 input, #f5 button, #f5 output` | < | modern classic | 3240 150 255 250 |  |  |  | In Frame1 at 3000, 0. < zooms in and > zooms out (Q-89), #d3-zoomout follows. |
| P-095 | Label 2D | `element` | `#label2` | `#f5` |  |  |  | 2D | modern classic | 3940 120 255 255 |  |  |  | In Frame6 at 3840, 0. |
| P-096 | Field Tzoom | `element` | `#tzoom` | `#f5` |  | 5 | `#f5 input, #f5 button, #f5 output` |  | modern classic | 4200 120 495 315 |  |  |  | 120 % in the modern look, the raw 1,2 in the classic look (Q-31). |
| P-097 | Buttons < and > of the 2D zoom | `element` | `#d2-zoomin` | `#f5` |  | 6 | `#f5 input, #f5 button, #f5 output` | < | modern classic | 4680 150 255 250 |  |  |  | #d2-zoomout follows. |
| P-098 | Field TStatus | `element` | `#tstatus` | `#f5` |  | 8 | `#f5 input, #f5 button, #f5 output` |  | modern classic | 5160 120 9360 315 |  |  |  | The status texts of the handshake. In the classic look Frame6 keeps the width of Form_Set and runs past the right edge of F5, which cuts the frame and the field off (Q-13). |
| P-099 | Label1 as the name of the view | `element` | `#label1-f5` | `#f5` |  |  |  |  | modern |  |  |  | 90 §5 | Hidden behind TStatus in 1.3 (Q-90), the name of the view under the pointer in the modern look. |
| P-100 | Fields Ebene and Zoom of version 1.2 | `absent` |  |  |  |  |  |  | modern classic |  |  |  |  | Only in the screenshot of 1.2, not built (T-p88b). |
| P-101 | Read only fields of F5 | `state` | `#tx` | `#f5` |  |  |  |  | modern classic |  |  | `['#tx', '#ty', '#tz', '#tzoom'].every((s) => document.querySelector(s).readOnly)` |  | Editable without a handler in 1.3 (Q-93). |
| P-102 | Width of F5 follows Form1 | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 70 §1 | Frame6 ends at the right edge (Q-13). |
| P-105 | SSTab with six tabs in two rows | `element` | `#sstab1` | `#f4` |  |  |  |  | modern classic | 0 0 3675 8295 |  |  | 60 §4 | Körper, Oberfläche and Ausgabe in the front row, Bilder, Kamera and Einstellung behind. |
| P-106 | Tab switches from outside | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2, 80 §6, 80 §12 | Body bar and tool 2 to Körper, tool 9 to Bilder, Bilder › Beenden to Körper. |
| P-107 | Tool tips in F4 | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §4 | A few controls carry a tool tip in 2.0 (F4-Q20). |
| P-108 | Order of the keyboard in F4 | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 70 §10 | The order of the layout (F4-Q19). |
| P-109 | Size of F4 | `behaviour` |  |  |  |  |  |  | classic |  |  |  | 70 §1 | The register stays 245 by 553 px in the classic look (F4-Q18). |
| P-110a | Frame OBJEKTE | `element` | `#frame8` | `#sstab1` | koerper |  |  | OBJEKTE: | modern classic | 120 720 3255 1935 |  |  |  |  |
| P-111a | List CB2 | `element` | `#cb2` | `#frame8` | koerper |  |  |  | modern classic | 60 240 3075 1230 |  |  |  | 0 Raster from the start, the lines of Scene.list. |
| P-112 | Click on a line of the list | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §5 |  |
| P-113 | Click on 0 Raster | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 90 §5 | Ändern and Löschen refuse it (F4-Q35). |
| P-114a | Frame GEOMETRIEDATEN | `element` | `#frame1` | `#sstab1` | koerper |  |  | GEOMETRIEDATEN: | modern classic | 120 2640 3255 4875 |  |  |  | Teal #008080 by default, #00C0C0 by setting, legend white on teal and black on cyan (R-39). |
| P-115 | Combo CB1 | `element` | `#cb1` | `#frame1` | koerper |  |  |  | modern classic | 120 240 3015 315 |  |  |  | Editable, Quader at the start, bold in the classic look. |
| P-116 | Entry Kugel of CB1 | `menu-entry` | `#cb1 .c-combo-list > [data-entry="Kugel"]` |  | koerper | 0 | `#cb1 .c-combo-list > .c-list-row` | Kugel | modern classic |  | `list:#cb1 .c-combo-arrow` |  |  | Kegel, Zylinder, Würfel, Quader, Pyramide, Prisma and Disc follow at 1 to 7. |
| P-117 | Entry CSG-Vereinigung of CB1 | `menu-entry` | `#cb1 .c-combo-list > [data-entry="CSG-Vereinigung"]` |  | koerper | 8 | `#cb1 .c-combo-list > .c-list-row` | CSG-Vereinigung | modern classic |  | `list:#cb1 .c-combo-arrow` |  |  |  |
| P-118 | Entry CSG-Differenz of CB1 | `menu-entry` | `#cb1 .c-combo-list > [data-entry="CSG-Differenz"]` |  | koerper | 9 | `#cb1 .c-combo-list > .c-list-row` | CSG-Differenz | modern classic |  | `list:#cb1 .c-combo-arrow` |  |  |  |
| P-119 | Entry CSG-Durchschnitt of CB1 | `menu-entry` | `#cb1 .c-combo-list > [data-entry="CSG-Durchschnitt"]` |  | koerper | 10 | `#cb1 .c-combo-list > .c-list-row` | CSG-Durchschnitt | modern classic |  | `list:#cb1 .c-combo-arrow` |  |  | The whole name, which 1.3 cut to CSG-Durchschnit (F4-Q57). |
| P-120a | Entry CSG-Summe of CB1 | `menu-entry` | `#cb1 .c-combo-list > [data-entry="CSG-Summe"]` |  | koerper | 11 | `#cb1 .c-combo-list > .c-list-row` | CSG-Summe | modern classic |  | `list:#cb1 .c-combo-arrow` |  |  |  |
| P-121 | Entry CSG-Ende of CB1 | `menu-entry` | `#cb1 .c-combo-list > [data-entry="CSG-Ende"]` |  | koerper | 12 | `#cb1 .c-combo-list > .c-list-row` | CSG-Ende | modern classic |  | `list:#cb1 .c-combo-arrow` |  |  |  |
| P-122 | Entry #Neu of CB1 | `menu-entry` | `#cb1 .c-combo-list > [data-entry="#Neu"]` |  | koerper | 13 | `#cb1 .c-combo-list > .c-list-row` | #Neu | modern classic |  | `list:#cb1 .c-combo-arrow` |  |  | A declaration named Werkstück1 and on, no CSG-Summe (F4-Q50). |
| P-123 | Entry Neu_Ende of CB1 | `menu-entry` | `#cb1 .c-combo-list > [data-entry="Neu_Ende"]` |  | koerper | 14 | `#cb1 .c-combo-list > .c-list-row` | Neu_Ende | modern classic |  | `list:#cb1 .c-combo-arrow` |  |  | The names of the new bodies follow. |
| P-124 | A declared name as an entry | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §4 | Places the new body again as an instance. |
| P-125 | Labels L1 of the mask | `element` | `#l1-1` | `#frame1` | koerper |  |  | Eckpunkt (hinten,unten,links)(x,y,z) | modern classic | 360 600 2775 255 |  |  |  | The mask of Quader at the start. L1(4), L1(6) and L1(7) follow the same rows. |
| P-126 | Fields T1(1) to T1(3), the position | `element` | `#t1-1` | `#frame1` | koerper |  |  |  | modern classic | 360 840 675 285 |  |  |  | Yellow free, green locked. T1(2) and T1(3) at 1440 and 2400. |
| P-127 | Fields T1(4) to T1(6), the size | `element` | `#t1-4` | `#frame1` | koerper |  |  |  | modern classic | 360 1440 675 285 |  |  |  |  |
| P-128 | Fields T1(7) to T1(9), the rotation | `element` | `#t1-7` | `#frame1` | koerper |  |  |  | modern classic | 360 2040 675 285 |  |  |  | Red digits. |
| P-129 | Row 4, L1(10) and T1(10), the inner radius | `element` | `#t1-10` | `#frame1` | koerper |  |  |  | modern classic | 360 2880 675 285 | `entry:Disc` |  |  | Shown with the mask Disc only. |
| P-130a | Rows 5 and 6, Name and Gruppe | `element` | `#t1-11` | `#frame1` | koerper |  |  |  | modern classic |  |  |  | 80 §18 | New in the empty rows of 1.3, the field Name and the combo Gruppe #t1-12 (F4-Q23). |
| P-131 | Button Einfügen | `element` | `#btn-einf` | `#frame7-0` | koerper | 0 | `#frame7-0 > .c-button` | Einfügen | modern classic | 120 240 975 375 |  |  |  |  |
| P-132 | Button Ändern | `element` | `#btn-change` | `#frame7-0` | koerper | 1 | `#frame7-0 > .c-button` | Ändern | modern classic | 1200 240 975 375 |  |  |  |  |
| P-133 | Button Löschen | `element` | `#btn-clear` | `#frame7-0` | koerper | 2 | `#frame7-0 > .c-button` | Löschen | modern classic | 2280 240 855 375 |  |  |  |  |
| P-134 | Frame Frame7(0) of the three buttons | `element` | `#frame7-0` | `#sstab1` | koerper |  |  |  | modern classic | 120 7440 3255 735 |  |  |  |  |
| P-135 | Start of the marking, Start_Mark | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | Also after a choice in CB1 (F4-Q66). |
| P-136 | Phase 1, first click | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | z-, x- or y-Koordinate markieren. |
| P-137 | Phase 1, click in another view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | Grösse angeben oder markieren. |
| P-138 | Phase 2, first size click | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | Tiefe, Breite or Höhe markieren (Q-42), the Kreuzriss writes x and z (Q-41). |
| P-139a | Phase 2, click in another view | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | Sizes may be negative (F4-Q67). |
| P-139b | No insert without Einfügen | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §2 | Enter inserts as well, a preview follows the fields. |
| P-139c | Status after Einfügen | `message` |  |  |  |  |  | Eingefügt: <Name> | modern classic |  |  |  | 60 §15 | Two seconds in the status field. |
| P-140 | Mask Kugel | `state` | `#l1-1` | `#frame1` | koerper |  |  | Kugelmittelpunkt (x,y,z) | modern classic |  | `entry:Kugel` |  |  | L1(4) Radius, T1(5) and T1(6) hidden. |
| P-141 | Mask Kegel | `state` | `#l1-1` | `#frame1` | koerper |  |  | Mittelpunkt der Grundfläche (x,y,z) | modern classic |  | `entry:Kegel` |  |  | L1(4) Radius, L1(6) Höhe. |
| P-142 | Mask Zylinder | `state` | `#l1-1` | `#frame1` | koerper |  |  | Mittelpunkt der Grundfläche (x,y,z) | modern classic |  | `entry:Zylinder` |  |  | L1(4) Radius, L1(6) Höhe. |
| P-143 | Mask Würfel | `state` | `#l1-1` | `#frame1` | koerper |  |  | Eckpunkt (hinten,unten,links) (x,y,z) | modern classic |  | `entry:Würfel` |  |  | L1(4) Kantenlänge. |
| P-144 | Mask Quader | `state` | `#l1-4` | `#frame1` | koerper |  |  | Kantenlängen x y z | modern classic |  | `entry:Quader` |  |  | L1(1) Eckpunkt (hinten,unten,links)(x,y,z). |
| P-145 | Mask Pyramide | `state` | `#l1-6` | `#frame1` | koerper |  |  | Höhe | modern classic |  | `entry:Pyramide` |  |  | L1(4) Kantenlängen x y. |
| P-146 | Mask Prisma | `state` | `#l1-4` | `#frame1` | koerper |  |  | Kantenlängen x y | modern classic |  | `entry:Prisma` |  |  | No caption in 1.3 (F4-Q22). |
| P-147 | Mask Disc | `state` | `#l1-10` | `#frame1` | koerper |  |  | innerer Radius | modern classic |  | `entry:Disc` |  |  | L1(1) Mittelpunkt (x,y,z), T1(10) shown. |
| P-148 | Mask of the CSG entries | `state` | `#geo-hint` | `#frame1` | koerper |  |  | Gruppe: alles bis CSG-Ende gehört dazu. Die Werte bewegen, skalieren und drehen die Glieder. | modern classic |  | `entry:CSG-Vereinigung` |  |  | Rows 1 to 3 move, scale and turn the members. #Neu, CSG-Ende and Neu_Ende have hints of their own. |
| P-149 | Mask of a declared name | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §4 | Bezugspunkt, Skalierung and the rotation (F4-Q60). |
| P-150a | Unknown text in CB1 | `message` |  |  |  |  |  | Unbekannter Körper: <text> | modern classic |  |  |  | 60 §15 | Known names match whatever their case (F4-Q41). |
| P-150b | Default values of a mask | `state` | `#t1-4` | `#frame1` | koerper |  |  |  | modern classic |  |  | `[1, 2, 3, 7, 8, 9].every((n) => document.querySelector('#t1-' + n).value === '0') && [4, 5, 6].every((n) => document.querySelector('#t1-' + n).value === '1')` |  | 0 0 0, 1 1 1, 0 0 0 at the start, T1(10) is reset as well (F4-Q61). |
| P-151a | The empty tab Oberfläche | `element` | `[data-page="oberflaeche"] .surface-hint` | `#sstab1` | oberflaeche |  |  | Farbe und Textur: Fenster „Farben/Texturen“ unter diesem Fenster. | modern |  |  |  |  | Empty in 1.3 and in the classic look, a hint and a swatch in the modern look. |
| P-152a | Frame5 and Text1 | `element` | `#text1` | `#sstab1` | ausgabe |  |  |  | modern classic | 240 960 3075 4455 |  |  |  | Text1 lies in Frame5 at 120, 240, Frame5 at 120, 720. Edits stay until the next Übersetzen. |
| P-153 | Hidden template T_incl | `state` | `#t-incl` | `#sstab1` | ausgabe |  |  |  | modern classic |  |  | `document.querySelector('#t-incl').value.trim().split('\n').length === 6` |  | The six include lines of the export (F4-Q73). |
| P-154 | Field TfName | `element` | `#tfname` | `#sstab1` | ausgabe |  |  |  | modern classic | 120 5640 3255 285 |  |  |  | A typed .pov is not doubled (F4-Q70). |
| P-155 | Button Übersetzen | `element` | `#bpov-comp` | `#sstab1` | ausgabe |  |  | Übersetzen | modern classic | 300 6360 1335 495 |  |  |  | In Frame9(0) at 180, 240. |
| P-156 | Button Ausgeben | `element` | `#bpov-save` | `#sstab1` | ausgabe |  |  | Ausgeben | modern classic | 1920 6360 1275 495 |  |  |  | In Frame9(0) at 1800, 240. Disabled until Übersetzen. |
| P-157 | Header and body of the POV file | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 30 §8, 80 §8 |  |
| P-158 | Command line of POV-Ray | `element` | `#pov-command` | `#sstab1` | ausgabe |  |  |  | modern classic |  |  |  | 80 §8 | The command line of RayTrace, built from the paths of tab Einstellung. |
| P-160 | File list File1 | `element` | `#file1` | `#sstab1` | bilder |  |  |  | modern classic | 120 840 3255 4575 |  |  |  | The pictures the browser keeps, the first preselected (F4-Q77). |
| P-161 | Field TDatei | `element` | `#tdatei` | `#sstab1` | bilder |  |  |  | modern classic | 120 5640 3255 285 |  |  |  |  |
| P-162 | Button Anzeigen | `element` | `#bbild-anz` | `#frame9-1` | bilder | 0 | `#frame9-1 > .c-button` | Anzeigen | modern classic | 120 240 1335 495 |  |  |  |  |
| P-163 | Button Beenden | `element` | `#bbild-beenden` | `#frame9-1` | bilder | 1 | `#frame9-1 > .c-button` | Beenden | modern classic | 1800 240 1335 495 |  |  |  | Also closes the Dia-Show (F4-Q81). |
| P-164 | Picture box Cmdia | `element` | `#cmdia` | `#sstab1` | bilder |  |  | … | modern classic | 960 6120 360 240 |  |  |  | The button that adds pictures, in the place of the orphan (F4-Q11). |
| P-165 | Frame Frame9(1) | `element` | `#frame9-1` | `#sstab1` | bilder |  |  |  | modern classic | 120 6120 3255 855 |  |  |  |  |
| P-170 | Label noch in der Testphase!! | `element` | `#label1-kamera` | `#sstab1` | kamera |  |  | noch in der Testphase!! | modern classic | 360 1080 2295 735 |  |  |  |  |
| P-171 | Frame Frame6 | `element` | `#frame6` | `#sstab1` | kamera |  |  | modern: Drehung und Zoom, classic: Frame6 | modern classic | 120 3120 3255 2295 |  |  |  |  |
| P-172 | HS(4) and HST(4), the 3D zoom | `element` | `#hs-4` | `#frame6` | kamera |  |  |  | modern classic | 360 480 975 255 |  |  |  | The field #hst-4 stands at 1440, 480, the label #lhs-4 is new. |
| P-173 | HS(1) and HST(1), the turn about x | `element` | `#hs-1` | `#frame6` | kamera |  |  |  | modern classic | 360 1080 975 255 |  |  |  | The field #hst-1 stands at 1440, 1080, the label #lhs-1 is new. |
| P-174 | HS(2) and HST(2), the turn about y | `element` | `#hs-2` | `#frame6` | kamera |  |  |  | modern classic | 360 1440 975 255 |  |  |  | The field #hst-2 stands at 1440, 1440, the label #lhs-2 is new. |
| P-175 | HS(3) and HST(3), the turn about z | `element` | `#hs-3` | `#frame6` | kamera |  |  |  | modern classic | 360 1800 975 255 |  |  |  | The field #hst-3 stands at 1440, 1800, the label #lhs-3 is new. |
| P-176 | Button Start | `element` | `#start` | `#sstab1` | kamera |  |  | modern: Start, classic: Command1 | modern classic | 360 5640 975 375 |  |  |  |  |
| P-177 | Button Command2 | `element` | `#command2` | `#sstab1` | kamera |  |  | modern: Stopp, classic: Command2 | modern classic | 2160 5640 975 375 |  |  |  |  |
| P-178 | Frame7(1) and Einfügen | `element` | `#btn1-1` | `#sstab1` | kamera |  |  | Einfügen | modern classic | 300 6360 1335 495 |  |  |  | In Frame7(1) at 180, 240. Takes the camera of the Schrägriss. |
| P-179 | Löschen of tab Kamera | `element` | `#btn2-1` | `#sstab1` | kamera |  |  | Löschen | modern classic | 1920 6360 1335 495 |  |  |  | In Frame7(1) at 1800, 240. Resets the camera of the export. |
| P-180 | Timer2 of 100 ms | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §9 | Runs only while the turn runs (F4-Q87). |
| P-181 | Turn survives a refresh | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §9 | A double click on Stopp resets it. |
| P-185a | Field Tpasswd and label Passwort | `element` | `#tpasswd` | `#sstab1` | einstellung |  |  |  | modern classic | 180 840 1635 285 |  |  |  | The label #lpasswd stands to the right at 2040, 900. # for each character in the classic look. |
| P-186 | Frame Dateiverwaltung | `element` | `#frame10` | `#sstab1` | einstellung |  |  | Dateiverwaltung: | modern classic | 120 1260 3255 3135 |  |  |  |  |
| P-187 | Stammverzeichnis 3D-Baukasten, TBau_Home | `element` | `#tbau-home` | `#frame10` | einstellung |  |  |  | modern classic | 120 480 3015 285 |  |  |  | Disabled until the password 2002. |
| P-188 | Stammverzeichnis POV, Tpov_Home | `element` | `#tpov-home` | `#frame10` | einstellung |  |  |  | modern classic | 120 1080 3015 285 |  |  |  | Disabled until the password 2002. |
| P-189 | Stammverzeichnis POV-Bsp, TBsp_Home | `element` | `#tbsp-home` | `#frame10` | einstellung |  |  |  | modern classic | 120 1800 3015 285 |  |  |  | Disabled until the password 2002. |
| P-190a | StandardName POV-Ausgabe, TBsp_Def | `element` | `#tbsp-def` | `#frame10` | einstellung |  |  |  | modern classic | 120 2520 3015 285 |  |  |  | Disabled until the password 2002. |
| P-191 | Button Bildschirmeinstellungen | `element` | `#bscreen` | `#sstab1` | einstellung |  |  | Bildschirmeinstellungen | modern classic | 360 5640 2775 555 |  |  |  | In Frame2 at 240, 600. |
| P-192 | Button Übernehmen | `element` | `#bdatei-change` | `#sstab1` | einstellung |  |  | Übernehmen | modern classic | 360 6360 1335 495 |  |  |  | In Frame2 at 240, 1320. |
| P-193 | Button Standard | `element` | `#bdatei-def` | `#sstab1` | einstellung |  |  | Standard | modern classic | 1920 6360 1215 495 |  |  |  | In Frame2 at 1800, 1320. |
| P-194 | Persistence of the settings | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 60 §11 | localStorage bausteine.einstellung. |
| P-195 | Frames Frame3 and Frame4 | `absent` |  |  |  |  |  |  | modern classic |  |  |  |  | Never visible in 1.3, not built (F4-Q2). |
| P-200 | Window Farben/Texturen | `element` | `#f6` |  |  |  |  |  | modern classic |  |  |  |  | Under F4 at y 580 in the classic look. |
| P-200a | The record of F6 in the EXE | `element` | `#frame11` | `#f6` |  |  |  | TEXTUR | modern classic | 0 0 3615 735 |  |  |  | Frame1 of F6. The client is 3660 by 1290 twips, the frame FARBE stands at 0, 720 with 3615 by 555 (R-38). |
| P-201 | Frame FARBE | `element` | `#frame-farbe` | `#f6` |  |  |  | FARBE | modern classic | 0 720 3615 555 |  |  |  | Frame11 of F6, grey until a body is selected, then its colour. |
| P-202 | Button Farbe | `element` | `#bcolor` | `#frame-farbe` |  |  |  | Farbe | modern classic | 1320 120 975 375 |  |  |  |  |
| P-203a | Combo CB3 of the frame TEXTUR | `element` | `#cb3` | `#frame11` |  |  |  |  | modern classic | 120 240 3375 315 |  |  |  | Keine and the 43 textures, disabled while 0 Raster is selected. |
| P-203b | Tool tip of CB3 | `tooltip` | `#cb3` | `#frame11` |  |  |  | Textur auswählen | modern classic |  |  |  |  | The only tool tip of 1.3 outside the two bars (R-38). |
| P-204a | Content of the texture list | `state` | `#cb3` | `#frame11` |  |  |  |  | modern classic |  |  | `(() => { const o = document.querySelector('#cb3').options; return o.length === 44 && o[0].text === 'Keine' && o[1].text === 'Chrome_Metal'; })()` |  | Keine and the 43 names of 1.3 in their order. |
| P-151 | Basic colours of the colour dialog | `element` | `#farben .farben-grund` | `#farben` |  |  |  |  | modern classic |  |  |  | 80 §11 | The 48 basic colours of Windows and 16 custom colours, the modern look adds a free picker. |
| P-152 | Button Farben definieren of the colour dialog | `element` | `#farben-define` | `#farben` |  |  |  | Farben definieren >> | modern classic |  |  |  | 70 §12 | Enabled in 2.0, disabled in the screenshot (C-10). |
| P-190 | Dia-Show F9 | `behaviour` | `#f9` |  |  |  |  |  | modern classic |  |  |  | 80 §12, 70 §14 | Centred and fitted in the modern look, unscaled at the top left in the classic look. |
| P-191a | Button < of the Dia-Show | `state` | `#bbild-rueck` | `#f9` |  |  |  | < | modern classic |  |  | `document.querySelector('#f9 .f9-buttons > :nth-child(1)').id === 'bbild-rueck' && document.querySelector('#bbild-rueck').textContent.trim() === '<'` | 80 §12 | Inside the screen at the bottom right (Q-98). |
| P-192a | Button > of the Dia-Show | `state` | `#bbild-weiter` | `#f9` |  |  |  | > | modern classic |  |  | `document.querySelector('#f9 .f9-buttons > :nth-child(2)').id === 'bbild-weiter' && document.querySelector('#bbild-weiter').textContent.trim() === '>'` | 80 §12 | Inside the screen at the bottom right (Q-98). |
| P-193a | Button End of the Dia-Show | `state` | `#bbild-ende` | `#f9` |  |  |  | End | modern classic |  |  | `document.querySelector('#f9 .f9-buttons > :nth-child(3)').id === 'bbild-ende' && document.querySelector('#bbild-ende').textContent.trim() === 'End'` | 80 §12 | Inside the screen at the bottom right (Q-98). |
| P-194a | Start of the Dia-Show | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §12 | Tool 9, tab Bilder, Anzeigen. |
| P-195a | Splash card | `element` | `#splash .splash-origin` |  |  |  |  | nach 3D-Baukasten 1.3 von Herbert Kleber (2002) | modern classic |  | `act:info` |  |  | 3D-Bausteine, Version 2.0 and Florian Kleber 2026, no template lines of frmSplash (Q-104). |
| P-196 | Program icon | `element` | `#form1 .win-icon` | `#form1` |  |  |  |  | modern classic |  |  |  | 60 §12 | The torus, the cube and the cone of tool button 2 as SVG. |
| P-197 | Timer1 of 100 ms | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §7 | No timer, the zoom field changes with the zoom. |
| P-198 | Timer2 of 100 ms | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 80 §9 | See P-180. |
| P-199 | Start state | `state` |  |  |  |  |  |  | modern classic |  |  | `bausteine.app.zoomf === 12 && document.querySelector('#cb1-edit').value === 'Quader' && document.querySelector('#bpov-save').disabled && bausteine.app.lines[0].text === '0 Raster' && document.querySelector('#sstab1 .tab[data-tab="koerper"]').getAttribute('aria-selected') === 'true'` | 60 §8 | At the start of the page: tab Körper, CB1 Quader, zoom 1.2, Ausgeben disabled, 0 Raster in the list. |
| P-220 | Default body after the start | `state` | `#cb1-edit` | `#cb1` | koerper |  |  |  | modern classic |  |  | `document.querySelector('#cb1-edit').value === 'Quader'` | 60 §8 | Quader, and Würfel with its mask after the last delete (F4-Q27, F4-Q28). |
| P-221 | Default values | `state` | `#t1-1` | `#frame1` | koerper |  |  |  | modern classic |  |  | `[1, 2, 3, 7, 8, 9].every((n) => document.querySelector('#t1-' + n).value === '0') && [4, 5, 6].every((n) => document.querySelector('#t1-' + n).value === '1')` | 60 §8 | Position 0 0 0, size 1 1 1, rotation 0 0 0. |
| P-222 | Colour of a new body | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 90 §5 | Ten colours in turn (F4-Q31). |
| P-223 | Limits | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 20 §11, 50 §11 | 512 items in a scene, 256 scenes. |
| P-224 | Number formats | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 70 §8 | Comma and point accepted, comma shown (F4-Q62). |
| P-225 | Length of a name | `state` | `#t1-11` | `#frame1` | koerper |  |  |  | modern classic |  |  | `document.querySelector('#t1-11').maxLength === 60` | 50 §4 | Up to 60 characters, where 1.3 cut at 15 (F4-Q57). |
| P-226 | Order of the rotations | `behaviour` |  |  |  |  |  |  | modern classic |  |  |  | 10 §2, 30 §3 | One order in views, ray tracer and export (F4-Q65). |
| P-227 | Debug.Print leftovers | `absent` |  |  |  |  |  |  | modern classic |  |  |  |  | No output for debugging in 2.0 (Q-48). |
| P-228 | Texts of the message boxes | `message` |  |  |  |  |  | Wollen Sie wirklich alle Objekte entfernen? | modern classic |  |  |  | 80 §1, 60 §15 | FRAGE, Programm beenden? and CSG_Ende fehlt - wird angefügt as in 1.3. |
| P-229 | Keys of the Dia-Show | `key` | `#f9` |  |  |  |  |  | modern classic |  |  |  | 80 §12 | Enter ends the show as in 1.3, Esc, the arrow keys and Space are new. |
| P-230 | Dialog Bildschirmeinstellungen | `element` | `#screen-dialog` |  |  |  |  |  | modern classic |  | `act:bildschirm` |  |  | Look, theme, inverted views, virtual screen, snap step and frame colour, no raster setting (R-43). |
