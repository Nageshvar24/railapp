from django.urls import path

from .views import (
    train_add,
    train_delete,
    train_detail,
    train_list,
    train_search,
    train_stats,
    train_update,
)

urlpatterns = [
    path("list/", train_list),
    path("search/", train_search),
    path("stats/", train_stats),
    path("detail/<int:pk>/", train_detail),
    path("add/", train_add),
    path("update/<int:pk>/", train_update),
    path("delete/<int:pk>/", train_delete),
]