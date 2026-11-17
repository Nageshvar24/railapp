from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from stations.models import TrainStop
from trains.models import Train

from .models import Booking, Passenger, Refund
from .serializers import (
    AdminBookingSerializer,
    BookingCreateSerializer,
    BookingSerializer,
    CancelSerializer,
    RefundProcessSerializer,
    RefundReapplySerializer,
    RefundSerializer,
)
from .services import (
    cancel_booking,
    cancel_preview,
    create_booking,
    edit_refund_decision,
    process_refund,
    reapply_refund,
)

User = get_user_model()


# CREATE -> POST /api/bookings/create/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def booking_create(request):
    serializer = BookingCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    booking = create_booking(request.user, serializer.validated_data)
    return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)


# LIST (my bookings) -> GET /api/bookings/my/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def booking_list(request):
    bookings = (
        Booking.objects.filter(user=request.user)
        .select_related("refund")
        .prefetch_related("passengers")
    )
    return Response(BookingSerializer(bookings, many=True).data)


# DETAIL (one ticket) -> GET /api/bookings/detail/<pnr>/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def booking_detail(request, pnr):
    booking = (
        Booking.objects.filter(pnr=pnr.upper(), user=request.user)
        .select_related("refund")
        .prefetch_related("passengers")
        .first()
    )
    if not booking:
        return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(BookingSerializer(booking).data)


# CANCEL PREVIEW -> GET /api/bookings/cancel-preview/<pnr>/
# Tells the user the cancellation charge and the refund before they confirm.
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def booking_cancel_preview(request, pnr):
    return Response(cancel_preview(request.user, pnr))


# CANCEL -> POST /api/bookings/cancel/<pnr>/   body: {"reason": "..."}
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def booking_cancel(request, pnr):
    serializer = CancelSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    booking, refund = cancel_booking(request.user, pnr, serializer.validated_data["reason"])
    return Response({
        "detail": "Ticket cancelled.",
        "pnr": booking.pnr,
        "status": booking.status,
        "cancellation_charge": float(refund.cancellation_charge),
        "refund_amount": float(refund.refund_amount),
        "refund_status": refund.status,
    })


# REFUND RE-APPLY (user) -> POST /api/bookings/refund-reapply/<pnr>/   body: {"remark": "..."}
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def refund_reapply(request, pnr):
    serializer = RefundReapplySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    refund = reapply_refund(request.user, pnr, serializer.validated_data["remark"])
    return Response({
        "detail": "Refund requested again.",
        "pnr": pnr.upper(),
        "refund_status": refund.status,
        "refund_amount": float(refund.refund_amount),
    })


# ADMIN: all bookings -> GET /api/bookings/admin/all/?search=&status=&limit=
@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_booking_list(request):
    qs = Booking.objects.select_related("user", "refund").prefetch_related("passengers")
    p = request.query_params

    search = p.get("search", "").strip()
    if search:
        qs = qs.filter(
            Q(pnr__icontains=search)
            | Q(user__username__icontains=search)
            | Q(user__email__icontains=search)
            | Q(train_number__icontains=search)
            | Q(train_name__icontains=search)
        )
    if p.get("status") in ("CONFIRMED", "CANCELLED"):
        qs = qs.filter(status=p["status"])

    total = qs.count()
    if p.get("limit", "").isdigit():
        qs = qs[: int(p["limit"])]

    data = AdminBookingSerializer(qs, many=True).data
    return Response({"total": total, "results": data})


# ADMIN: refund requests -> GET /api/bookings/admin/refunds/?search=&status=
# The "summary" always covers ALL refunds, so the cards stay correct while filtering.
@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_refund_list(request):
    qs = Refund.objects.select_related("booking", "booking__user")
    p = request.query_params

    search = p.get("search", "").strip()
    if search:
        qs = qs.filter(
            Q(booking__pnr__icontains=search)
            | Q(booking__user__username__icontains=search)
            | Q(booking__user__email__icontains=search)
            | Q(booking__train_number__icontains=search)
            | Q(booking__train_name__icontains=search)
        )
    if p.get("status") in Refund.Status.values:
        qs = qs.filter(status=p["status"])

    agg = Refund.objects.aggregate(
        total=Count("id"),
        pending_count=Count("id", filter=Q(status=Refund.Status.PENDING)),
        pending_amount=Sum("refund_amount", filter=Q(status=Refund.Status.PENDING)),
        done_count=Count("id", filter=Q(status=Refund.Status.REFUNDED)),
        done_amount=Sum("refund_amount", filter=Q(status=Refund.Status.REFUNDED)),
        rejected_count=Count("id", filter=Q(status=Refund.Status.REJECTED)),
    )
    summary = {
        "total": agg["total"],
        "pending_count": agg["pending_count"],
        "pending_amount": float(agg["pending_amount"] or 0),
        "done_count": agg["done_count"],
        "done_amount": float(agg["done_amount"] or 0),
        "rejected_count": agg["rejected_count"],
    }

    return Response({
        "total": qs.count(),
        "summary": summary,
        "results": RefundSerializer(qs, many=True).data,
    })


# ADMIN: approve / reject -> POST /api/bookings/admin/refunds/<id>/process/
# body: {"action": "approve" | "reject", "remark": "..."}  (remark is required when rejecting)
@api_view(["POST"])
@permission_classes([IsAdminRole])
def admin_refund_process(request, pk):
    serializer = RefundProcessSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    refund = process_refund(pk, request.user, data["action"], data["remark"])
    return Response(RefundSerializer(refund).data)


# ADMIN: edit an earlier decision -> POST /api/bookings/admin/refunds/<id>/edit/
# body: {"action": "approve" | "reject", "remark": "..."}  (remark is required when rejecting)
@api_view(["POST"])
@permission_classes([IsAdminRole])
def admin_refund_edit(request, pk):
    serializer = RefundProcessSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    refund = edit_refund_decision(pk, request.user, data["action"], data["remark"])
    return Response(RefundSerializer(refund).data)


# ADMIN: dashboard numbers -> GET /api/bookings/admin/stats/
@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_booking_stats(request):
    bookings = Booking.objects.all()
    confirmed = bookings.filter(status=Booking.Status.CONFIRMED)
    today = timezone.localdate()

    revenue = confirmed.aggregate(s=Sum("total_amount"))["s"] or 0
    stations = (
        TrainStop.objects.filter(is_deleted=False, train__is_deleted=False)
        .values("station_code")
        .distinct()
        .count()
    )

    return Response({
        "total_trains": Train.objects.filter(is_deleted=False).count(),
        "total_stations": stations,
        "total_users": User.objects.filter(role="user").count(),
        "total_bookings": bookings.count(),
        "bookings_today": bookings.filter(created_at__date=today).count(),
        "confirmed": confirmed.count(),
        "cancelled": bookings.filter(status=Booking.Status.CANCELLED).count(),
        "total_passengers": Passenger.objects.filter(
            booking__status=Booking.Status.CONFIRMED
        ).count(),
        "pending_refunds": Refund.objects.filter(status=Refund.Status.PENDING).count(),
        "revenue": float(revenue),
    })