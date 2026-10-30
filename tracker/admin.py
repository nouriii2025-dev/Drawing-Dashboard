from django.contrib import admin
from .models import *


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

@admin.register(MasterData)
class MasterDataAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "category",
        "value",
        "created_at",
    )

    list_filter = (
        "category",
    )

    search_fields = (
        "value",
    )

    ordering = (
        "category",
        "value",
    )


