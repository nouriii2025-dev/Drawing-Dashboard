import datetime
import io
import json
import re

from django.db.models import F, Max, Q
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_http_methods

from .models import DailyUpdate, MasterData

# Values from the lookup lists on the workbook's "Sheet1" tab. They seed the
# dropdowns; anything already in the database is merged in on top.
SHEET_LISTS = {
    "status": ["Ongoing", "Done", "Pending", "Rev B", "Rev C", "Canceld"],
    "software": ["AD", "AD/SD", "SD"],
    "drawn_by": ["Aravindh", "Machhindra"],
    "approved_by": ["Huzefa Santrampurwala", "-", "Mohammed Santrampurwala", "Riaz Santrampurwala"],
    "issued_for": [
        "Submitted for Review", "Issued for Factory", "Submitted for Approval",
        "Submitted for Sample", "AS-BUILT",
    ],
    "dwg_status": ["Awaiting Customer Comments", "Awaiting Customer Approval"],
    "sales_person": [
        "Prab", "Sumedha Angolkar", "Sumedha Angolkar/Machhindra Walunj",
        "Huzefa Santrampurwala, Admin Abhijith", "Mateen Lakhani", "Aparna Sunitha",
        "Gleiza Alberca", "Shweta Kadam", "Krishnaraj Thorat", "Shakeel Aslam",
        "Avanti Jamdade", "Muhammed Nihal", "Siddhesh Shelar", "Abhijith Gopinathan",
        "Huzefa Santrampurwala,Shreyash Khandekar", "Lalit Vishwakarma", "Ramu Nepuane",
        "Atharva Shingare", "Nihal", "Mohammed Santrampurwala", "Huzefa Santrampurwala",
        "Prabin Prakash", "Ajaz khan", "Sumedha Angolkar+Huzefa Santrampurwala",
        "Mustafa Raja", "Namrata Basak", "Shreyash Khandekar", "Riaz Santrampurwala",
        "Fazil", "Mohamed Rishan", "Gladys Ann Estanol", "Shakeel", "Yashraj Bakare",
    ],
}

RESOURCES = {
    "updates": {
        "model": DailyUpdate,
        "search": [
            "dwg_no", "item", "model_no", "customer", "project_po", "sq_number", "note",
            "status", "sales_person", "drawn_by", "software", "approved_by", "issued_for",
            "dwg_status", "factory_dwg_status", "file_path", "price", "remarks", "date_text",
        ],
        "filters": {
            "status": "status", "drawn_by": "drawn_by", "software": "software",
            "sales_person": "sales_person", "period": "period",
        },
    },
}

READ_ONLY = {"id", "position", "period", "created_at", "updated_at"}


def index(request):
    return render(request, "tracker/index.html")

def master_data_page(request):
    return render(request, "tracker/master_data.html")

# ---------- helpers ----------

def editable_fields(model):
    return [f for f in model._meta.fields if f.name not in READ_ONLY]


def serialize(obj):
    out = {"id": obj.pk}
    for f in obj._meta.fields:
        if f.name in ("id", "position", "created_at", "updated_at"):
            continue
        v = getattr(obj, f.name)
        out[f.name] = v.isoformat() if isinstance(v, datetime.date) else v
    return out


def get_cfg(resource):
    cfg = RESOURCES.get(resource)
    if not cfg:
        raise Http404("Unknown resource")
    return cfg


def parse_payload(model, raw):
    """Validate a JSON body against the model; returns (values, errors)."""
    values, errors = {}, {}
    for f in editable_fields(model):
        if f.name not in raw:
            continue
        v = raw[f.name]
        kind = f.get_internal_type()
        try:
            if kind == "DateField":
                values[f.name] = datetime.date.fromisoformat(v) if v else None
            elif kind == "PositiveIntegerField":
                values[f.name] = int(v) if v not in (None, "") else None
                if values[f.name] is not None and values[f.name] < 0:
                    raise ValueError
            else:
                s = "" if v is None else str(v).strip()
                if f.max_length and len(s) > f.max_length:
                    errors[f.name] = f"Too long (max {f.max_length} characters)."
                values[f.name] = s
        except (ValueError, TypeError):
            errors[f.name] = "Invalid value."
    return values, errors


def filtered_queryset(cfg, params):
    qs = cfg["model"].objects.all()
    q = (params.get("q") or "").strip()
    if q:
        for term in q.split():
            cond = Q()
            for field in cfg["search"]:
                cond |= Q(**{f"{field}__icontains": term})
            qs = qs.filter(cond)
    for param, field in cfg["filters"].items():
        val = params.get(param)
        if val:
            qs = qs.filter(**{field: val})
    return qs


def apply_sort(model, qs, sort):
    names = {f.name for f in model._meta.fields} - {"created_at", "updated_at"}
    desc = sort.startswith("-")
    name = sort.lstrip("-")
    if name not in names:
        return qs.order_by("-position")
    field = model._meta.get_field(name)
    if field.get_internal_type() in ("DateField", "PositiveIntegerField"):
        expr = F(name).desc(nulls_last=True) if desc else F(name).asc(nulls_last=True)
    else:
        expr = F(name).desc() if desc else F(name).asc()
    return qs.order_by(expr, "-position")


# ---------- generic CRUD ----------

@require_http_methods(["GET", "POST"])
def collection(request, resource):
    cfg = get_cfg(resource)
    model = cfg["model"]

    if request.method == "POST":
        try:
            raw = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON."}, status=400)
        values, errors = parse_payload(model, raw)
        if not any(v not in ("", None) for v in values.values()):
            errors["__all__"] = "Fill in at least one field."
        if errors:
            return JsonResponse({"error": "Please fix the highlighted fields.", "errors": errors}, status=400)
        obj = model.objects.create(**values)
        return JsonResponse(serialize(obj), status=201)

    qs = apply_sort(model, filtered_queryset(cfg, request.GET), request.GET.get("sort", ""))
    try:
        size = min(max(int(request.GET.get("page_size", 50)), 1), 200)
        page = max(int(request.GET.get("page", 1)), 1)
    except ValueError:
        size, page = 50, 1
    count = qs.count()
    pages = max((count + size - 1) // size, 1)
    page = min(page, pages)
    rows = qs[(page - 1) * size: page * size]
    return JsonResponse({
        "count": count, "page": page, "pages": pages, "page_size": size,
        "results": [serialize(o) for o in rows],
    })


@require_http_methods(["GET", "PUT", "DELETE"])
def item(request, resource, pk):
    cfg = get_cfg(resource)
    model = cfg["model"]
    try:
        obj = model.objects.get(pk=pk)
    except model.DoesNotExist:
        return JsonResponse({"error": "Record not found."}, status=404)

    if request.method == "DELETE":
        obj.delete()
        return HttpResponse(status=204)

    if request.method == "PUT":
        try:
            raw = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON."}, status=400)
        values, errors = parse_payload(model, raw)
        if errors:
            return JsonResponse({"error": "Please fix the highlighted fields.", "errors": errors}, status=400)
        for k, v in values.items():
            setattr(obj, k, v)
        obj.save()
    return JsonResponse(serialize(obj))


# ---------- dashboard helpers ----------

def _merge(defaults, existing):
    seen, out = set(), []
    for v in list(defaults) + list(existing):
        v = (v or "").strip()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


@require_GET
def options(request):
    # qs = DailyUpdate.objects
    # distinct = lambda f: sorted(qs.exclude(**{f: ""}).values_list(f, flat=True).distinct(), key=str.lower)
    # data = {key: _merge(SHEET_LISTS.get(key, []), distinct(key)) for key in (
    #     "status", "software", "drawn_by", "approved_by", "issued_for", "dwg_status", "sales_person",
    # )}

    qs = DailyUpdate.objects

    distinct = lambda f: sorted(
        qs.exclude(**{f: ""})
        .values_list(f, flat=True)
        .distinct(),
        key=str.lower
    )

    managed = {
        key: list(
            MasterData.objects
            .filter(category=key)
            .order_by("value")
            .values_list("value", flat=True)
        )
        for key in (
            "status",
            "software",
            "drawn_by",
            "sales_person"
        )
    }

    data = managed.copy()

    data.update({
        key: _merge(
            SHEET_LISTS.get(key, []),
            distinct(key)
        )
        for key in (
            "approved_by",
            "issued_for",
            "dwg_status"
        )
    })

    data["customer"] = _merge(
        [],
        distinct("customer")
    )
    data["customer"] = _merge([], distinct("customer"))
    periods = qs.exclude(period="").values_list("period", flat=True).distinct().order_by("-period")
    data["period"] = [
        {"value": p, "label": datetime.date(int(p[:4]), int(p[5:]), 1).strftime("%b %Y")} for p in periods
    ]
    return JsonResponse(data)


@require_GET
def summary(request):
    qs = DailyUpdate.objects
    this_month = datetime.date.today().strftime("%Y-%m")
    return JsonResponse({
        "total": qs.count(),
        "this_month": qs.filter(period=this_month).count(),
        "this_month_key": this_month,
        "pending": qs.filter(status__iexact="Pending").count(),
        "cancelled": qs.filter(status__istartswith="Cancel").count(),
    })


def _max_dwg_number():
    """Highest numeric part found in any DWG No (supports ACCU-1234, 1234, Accu-1234A, etc.)."""
    max_n = 0
    for number in DailyUpdate.objects.exclude(dwg_no="").values_list("dwg_no", flat=True):
        for m in re.finditer(r"(\d{3,5})", number or ""):
            max_n = max(max_n, int(m.group(1)))
    return max_n


@require_GET
def update_defaults(request):
    """Suggested S.No / DWG No / date for a new Daily Update row.
    DWG No is always generated as ACCU-XXXX (next after the highest existing number).
    """
    today = datetime.date.today()
    top = DailyUpdate.objects.filter(period=today.strftime("%Y-%m")).aggregate(m=Max("sno"))["m"] or 0
    next_n = _max_dwg_number() + 1
    next_dwg = f"ACCU-{next_n}"
    return JsonResponse({"sno": top + 1, "dwg_no": next_dwg, "date": today.isoformat()})


@require_GET
def export_updates(request):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    cfg = RESOURCES["updates"]
    qs = filtered_queryset(cfg, request.GET).order_by("position")
    fields = [f for f in DailyUpdate._meta.fields
              if f.name not in ("id", "position", "period", "created_at", "updated_at", "date_text")]

    wb = Workbook()
    ws = wb.active
    ws.title = "Daily Update"
    ws.append([f.verbose_name for f in fields])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="334155")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for o in qs:
        row = []
        for f in fields:
            v = getattr(o, f.name)
            if f.name == "date" and not v:
                v = o.date_text or None
            row.append(v if v not in ("", None) else None)
        ws.append(row)
    for i, f in enumerate(fields, start=1):
        width = 14 if f.get_internal_type() in ("DateField", "PositiveIntegerField") else 28
        ws.column_dimensions[get_column_letter(i)].width = width
        if f.get_internal_type() == "DateField":
            for c in ws[get_column_letter(i)][1:]:
                c.number_format = "DD-MM-YYYY"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    buf = io.BytesIO()
    wb.save(buf)
    resp = HttpResponse(
        buf.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    resp["Content-Disposition"] = f'attachment; filename="Daily_Update_{datetime.date.today():%d-%m-%Y}.xlsx"'
    return resp


MASTER_CATEGORIES = {
    "status": "Status",
    "drawn_by": "Drawn By",
    "software": "Software",
    "sales_person": "Sales Person",
}


@require_http_methods(["GET", "POST"])
def master_data_api(request):

    if request.method == "GET":

        result = {}

        for key, label in MASTER_CATEGORIES.items():

            result[key] = {
                "label": label,
                "items": list(
                    MasterData.objects
                    .filter(category=key)
                    .order_by("value")
                    .values("id", "value")
                )
            }

        return JsonResponse(result)

    try:
        raw = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse(
            {"error": "Invalid JSON."},
            status=400
        )

    category = str(raw.get("category", "")).strip()
    value = str(raw.get("value", "")).strip()

    if category not in MASTER_CATEGORIES:
        return JsonResponse(
            {"error": "Invalid category."},
            status=400
        )

    if not value:
        return JsonResponse(
            {"error": "Enter a value."},
            status=400
        )

    if len(value) > 200:
        return JsonResponse(
            {"error": "Value is too long."},
            status=400
        )

    if MasterData.objects.filter(
        category=category,
        value__iexact=value
    ).exists():

        return JsonResponse(
            {"error": "This value already exists."},
            status=400
        )

    item = MasterData.objects.create(
        category=category,
        value=value
    )

    return JsonResponse({
        "id": item.id,
        "category": item.category,
        "value": item.value
    }, status=201)


@require_http_methods(["DELETE"])
def master_data_item(request, pk):

    try:
        item = MasterData.objects.get(pk=pk)

    except MasterData.DoesNotExist:
        return JsonResponse(
            {"error": "Value not found."},
            status=404
        )

    usage = DailyUpdate.objects.filter(
        **{item.category: item.value}
    ).count()

    if usage:
        return JsonResponse(
            {
                "error": (
                    f"This value is used by {usage} "
                    "drawing record(s). It cannot be deleted."
                )
            },
            status=409
        )

    item.delete()

    return HttpResponse(status=204)