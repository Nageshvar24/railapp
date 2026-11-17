from django.urls import path

from .views import (
    station_add,
    station_delete,
    station_detail,
    station_list,
    station_names,
    station_update,
)

urlpatterns = [
    path("list/", station_list),
    path("names/", station_names),
    path("detail/<int:pk>/", station_detail),
    path("add/", station_add),
    path("update/<int:pk>/", station_update),
    path("delete/<int:pk>/", station_delete),
]