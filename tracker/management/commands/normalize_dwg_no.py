"""Normalize DWG No values to the ACCU-XXXX format.

    python manage.py normalize_dwg_no
    python manage.py normalize_dwg_no --dry-run

Rules:
  - Pure digits (e.g. 1689)          -> ACCU-1689
  - Accu-/ACCU- prefix (any case)    -> ACCU-XXXX (digits kept; optional letter suffix kept as A/B/C)
  - ACCU-1448 A / ACCU-1448B         -> ACCU-1448A
  - Ranges, Rev B, blanks, "-"       -> left unchanged
"""
import re

from django.core.management.base import BaseCommand
from django.db import transaction

from tracker.models import DailyUpdate


# ACCU-1234, Accu-1234, Accu.1234, ACCU-1234A, ACCU-1234 A, 1234, 1234A
PATTERN = re.compile(
    r"^(?:ACCU[-\s.]*)?(\d{3,5})\s*([A-Za-z])?\s*$",
    re.IGNORECASE,
)


def normalize(value: str) -> str | None:
    """Return new ACCU-XXXX form, or None if value should be left alone."""
    if not value:
        return None
    s = value.strip()
    if not s or s in ("-", "—"):
        return None
    # Already perfect
    if re.fullmatch(r"ACCU-\d{3,5}[A-Z]?", s):
        return None
    m = PATTERN.match(s)
    if not m:
        return None
    num, letter = m.group(1), (m.group(2) or "").upper()
    return f"ACCU-{num}{letter}"


class Command(BaseCommand):
    help = "Normalize existing DWG No values to ACCU-XXXX."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Show changes without saving.")

    @transaction.atomic
    def handle(self, dry_run=False, **opts):
        changed = 0
        for obj in DailyUpdate.objects.exclude(dwg_no="").iterator():
            new = normalize(obj.dwg_no)
            if new and new != obj.dwg_no:
                self.stdout.write(f"  {obj.dwg_no!r:30} -> {new}")
                if not dry_run:
                    obj.dwg_no = new
                    obj.save(update_fields=["dwg_no"])
                changed += 1
        if dry_run:
            self.stdout.write(self.style.WARNING(f"Dry run: {changed} would be updated."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Normalized {changed} DWG numbers."))
