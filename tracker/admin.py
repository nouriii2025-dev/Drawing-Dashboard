from django.contrib import admin
from .models import DailyUpdate


@admin.register(DailyUpdate)
class DailyUpdateAdmin(admin.ModelAdmin):
    list_display = (
        "sno",
        "date",
        "dwg_no",
        "item",
        "customer",
        "status",
        "sales_person",
    )

    search_fields = (
        "dwg_no",
        "item",
        "customer",
        "project_po",
    )

    list_filter = (
        "status",
        "drawn_by",
        "software",
        "sales_person",
    )


