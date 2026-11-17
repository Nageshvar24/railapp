from django.urls import path

from .views import (
    admin_booking_list,
    admin_booking_stats,
    admin_refund_edit,
    admin_refund_list,
    admin_refund_process,
    booking_cancel,
    booking_cancel_preview,
    booking_create,
    booking_detail,
    booking_list,
    refund_reapply,
)

urlpatterns = [
    path("create/", booking_create),
    path("my/", booking_list),
    path("detail/<str:pnr>/", booking_detail),
    path("cancel-preview/<str:pnr>/", booking_cancel_preview),
    path("cancel/<str:pnr>/", booking_cancel),
    path("refund-reapply/<str:pnr>/", refund_reapply),
    path("admin/all/", admin_booking_list),
    path("admin/stats/", admin_booking_stats),
    path("admin/refunds/", admin_refund_list),
    path("admin/refunds/<int:pk>/process/", admin_refund_process),
    path("admin/refunds/<int:pk>/edit/", admin_refund_edit),
]