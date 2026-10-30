# Drawing Dashboard

Web replacement for `Daily_Update_27-10-2026.xlsx`. Open the URL and you are on the
dashboard - no login or signup. Every change is saved to the database immediately.

## Run it

```bash
pip install -r requirements.txt
python manage.py migrate                      # only needed on a fresh database
python manage.py runserver 0.0.0.0:8000       # then open http://<this-pc>:8000/
```

`db.sqlite3` already contains the imported workbook (296 daily updates), so it works
straight away. Anyone on the same network can use `http://<server-ip>:8000/`.

To re-import the Excel file from scratch (this deletes current records):

```bash
python manage.py import_excel data/Daily_Update_29-10-2026.xlsx --replace
```

## What is in it

| Section | Source sheet | Fields |
|---|---|---|
| Daily Updates | Daily Update | All 21 columns: S.No, Date, DWG No, Drawn By, Software Name, Item, Model No, Customer Name, Project/PO, SQ Number, Note, Status, Sales Person, DWG Approved By, Submitted Date, DWG Issued For, DWG Status, Factory DWG Status, File Path, Price, Remarks* |
| Factory Drawings | Factory Drawing | Received date, Item, Specification, Factory, End User, Forwarded By/To, Subject, Location, Note |
| Projects | Projects | Client, Project/PO, Sections |

\* The last column of the sheet had no header; it holds short comments and is called **Remarks**.

- Add / edit / delete from any section. Click a row to open it.
- Search, filter (status, drawn by, software, sales person, month), sort by any column.
- **Columns** menu shows or hides any of the 21 fields. **Export** downloads the
  current (filtered) view as an `.xlsx`.
- Dropdowns use the lists from the sheet's `Sheet1` tab plus every value already used;
  Customer and Sales Person suggest as you type but accept new names.
- New records are pre-filled with today's date, the next S.No for the month, and the
  next **DWG No in ACCU-XXXX format** (auto-generated from the highest existing number).
- Existing DWG numbers have been normalized to `ACCU-XXXX` (e.g. `1689` → `ACCU-1689`,
  `Accu-1454` → `ACCU-1454`). Re-import also applies the same normalization.
  Run `python manage.py normalize_dwg_no` anytime to re-apply.

## Import notes

- Month header rows (DEC, JAN, ...) are not records; they were used to repair dates.
  Excel had read many typed dd/mm dates as mm/dd (12 Feb became 2 Dec); these were
  corrected using the month the row sits under.
- Merged cells in the sheet (Rev B / Rev C continuation rows) were filled down so each
  row stands on its own.
- Text in Date cells that is not a date (e.g. "Check Accu-1501...") moved to Note;
  the impossible date `31/09/2025` (DWG 1577) is kept as written.
- Blank spacer rows and the stray `Aravindh`-only rows were skipped.

## Production notes

Set `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY=<random>` and `DJANGO_ALLOWED_HOSTS=<host>`.
Static files are served by WhiteNoise. To use MySQL/PostgreSQL, change `DATABASES` in
`config/settings.py` and run `migrate` + `import_excel`.
