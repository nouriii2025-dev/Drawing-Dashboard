from django.db import models


class DailyUpdate(models.Model):
    """One row of the 'Daily Update' sheet (every column of the original file)."""

    position = models.PositiveIntegerField(default=0, db_index=True)  # original sheet order
    sno = models.PositiveIntegerField("S.No", null=True, blank=True)
    date = models.DateField("Date", null=True, blank=True)
    date_text = models.CharField("Date (as written)", max_length=100, blank=True)
    period = models.CharField(max_length=7, blank=True, db_index=True)  # YYYY-MM, derived
    dwg_no = models.CharField("DWG No", max_length=100, blank=True)
    drawn_by = models.CharField("Drawn By", max_length=100, blank=True, db_index=True)
    software = models.CharField("Software Name", max_length=50, blank=True, db_index=True)
    item = models.CharField("Item", max_length=500, blank=True)
    model_no = models.CharField("Model No", max_length=500, blank=True)
    customer = models.CharField("Customer Name", max_length=300, blank=True)
    project_po = models.CharField("Project Name / PO Number", max_length=500, blank=True)
    sq_number = models.CharField("SQ Number / Project", max_length=300, blank=True)
    note = models.TextField("Note", blank=True)
    status = models.CharField("Status", max_length=100, blank=True, db_index=True)
    sales_person = models.CharField("Sales Person Name", max_length=200, blank=True, db_index=True)
    approved_by = models.CharField("DWG Approved By", max_length=200, blank=True)
    submitted_date = models.DateField("Submitted Date", null=True, blank=True)
    issued_for = models.CharField("DWG Issued For", max_length=200, blank=True)
    dwg_status = models.CharField("DWG Status", max_length=200, blank=True)
    factory_dwg_status = models.CharField("Factory DWG Status", max_length=200, blank=True)
    file_path = models.TextField("File Path", blank=True)
    price = models.CharField("Price", max_length=100, blank=True)
    remarks = models.TextField("Remarks", blank=True)  # the unlabeled last column in the sheet

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "id"]

    def save(self, *args, **kwargs):
        if self.date:
            self.period = self.date.strftime("%Y-%m")
        if not self.position:
            last = DailyUpdate.objects.aggregate(m=models.Max("position"))["m"] or 0
            self.position = last + 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.dwg_no} {self.item}".strip()



class MasterData(models.Model):

    CATEGORY_CHOICES = [
        ("status", "Status"),
        ("drawn_by", "Drawn By"),
        ("software", "Software"),
        ("sales_person", "Sales Person"),
    ]

    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        db_index=True
    )

    value = models.CharField(max_length=200)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category", "value"]

        constraints = [
            models.UniqueConstraint(
                fields=["category", "value"],
                name="unique_master_category_value"
            )
        ]

    def __str__(self):
        return f"{self.get_category_display()}: {self.value}"