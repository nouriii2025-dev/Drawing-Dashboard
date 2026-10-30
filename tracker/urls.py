from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/summary/", views.summary),
    path("api/options/", views.options),
    path("api/updates/defaults/", views.update_defaults),
    path("api/updates/export/", views.export_updates),
    path(
        "master-data/",
        views.master_data_page,
        name="master-data"
    ),

    path(
        "api/master-data/",
        views.master_data_api,
        name="master-data-api"
    ),

    path(
        "api/master-data/<int:pk>/",
        views.master_data_item,
        name="master-data-item"
    ),
    path("api/<str:resource>/", views.collection),
    path("api/<str:resource>/<int:pk>/", views.item),
]
