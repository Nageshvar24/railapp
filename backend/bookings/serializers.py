from rest_framework import serializers

from trains.models import TrainClass

from .models import Booking, Passenger, Refund
from .services import (
    MAX_REMARK_LENGTH,
    MIN_REMARK_LENGTH,
    can_cancel,
    refund_can_edit,
    refund_can_reapply,
)

MAX_PASSENGERS = 6


def check_remark_length(value, what):
    """Shared length check for the admin reject reason and the user re-apply remark."""
    value = (value or "").strip()
    if len(value) < MIN_REMARK_LENGTH:
        raise serializers.ValidationError(
            f"Please write at least {MIN_REMARK_LENGTH} characters for the {what} "
            f"(you wrote {len(value)})."
        )
    return value


# ---------- input ----------
class PassengerInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    age = serializers.IntegerField(min_value=1, max_value=120)
    gender = serializers.ChoiceField(choices=Passenger.Gender.values)


class BookingCreateSerializer(serializers.Serializer):
    train = serializers.IntegerField()
    from_code = serializers.CharField(max_length=10)
    to_code = serializers.CharField(max_length=10)
    travel_date = serializers.DateField()
    class_code = serializers.ChoiceField(choices=TrainClass.ClassCode.values)
    payment_method = serializers.ChoiceField(choices=Booking.PaymentMethod.values)
    passengers = PassengerInputSerializer(many=True, allow_empty=False)

    def validate_passengers(self, value):
        if len(value) > MAX_PASSENGERS:
            raise serializers.ValidationError(
                f"You can book at most {MAX_PASSENGERS} passengers at a time."
            )
        return value


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class RefundProcessSerializer(serializers.Serializer):
    """Used for both the first decision and later edits of a decision."""

    action = serializers.ChoiceField(choices=["approve", "reject"])
    remark = serializers.CharField(
        max_length=MAX_REMARK_LENGTH, required=False, allow_blank=True, default=""
    )

    def validate(self, attrs):
        if attrs["action"] == "reject":
            try:
                attrs["remark"] = check_remark_length(attrs["remark"], "rejection reason")
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({"detail": exc.detail[0]})
        return attrs


class RefundReapplySerializer(serializers.Serializer):
    remark = serializers.CharField(max_length=MAX_REMARK_LENGTH)

    def validate_remark(self, value):
        return check_remark_length(value, "remark")


# ---------- output ----------
class PassengerSerializer(serializers.ModelSerializer):
    seat = serializers.SerializerMethodField()

    class Meta:
        model = Passenger
        fields = ["id", "name", "age", "gender", "coach", "seat_number", "seat"]

    def get_seat(self, obj):
        return f"{obj.coach} / {obj.seat_number}"


class BookingSerializer(serializers.ModelSerializer):
    departure_time = serializers.TimeField(format="%H:%M", read_only=True)
    arrival_time = serializers.TimeField(format="%H:%M", read_only=True)
    base_fare = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    taxes = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    total_amount = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    passengers = PassengerSerializer(many=True, read_only=True)
    can_cancel = serializers.SerializerMethodField()
    refund_status = serializers.SerializerMethodField()
    refund_amount = serializers.SerializerMethodField()
    refund_admin_remark = serializers.SerializerMethodField()
    refund_user_remark = serializers.SerializerMethodField()
    refund_reapply_count = serializers.SerializerMethodField()
    refund_can_reapply = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "pnr", "train", "train_number", "train_name",
            "from_code", "from_name", "to_code", "to_name",
            "departure_time", "arrival_time", "travel_date", "class_code",
            "payment_method", "base_fare", "taxes", "total_amount",
            "status", "created_at", "passengers",
            "can_cancel", "refund_status", "refund_amount",
            "refund_admin_remark", "refund_user_remark",
            "refund_reapply_count", "refund_can_reapply",
        ]

    def _refund(self, obj):
        return getattr(obj, "refund", None)

    def get_can_cancel(self, obj):
        return can_cancel(obj)

    def get_refund_status(self, obj):
        r = self._refund(obj)
        return r.status if r else None

    def get_refund_amount(self, obj):
        r = self._refund(obj)
        return float(r.refund_amount) if r else None

    def get_refund_admin_remark(self, obj):
        r = self._refund(obj)
        return r.admin_remark if r else ""

    def get_refund_user_remark(self, obj):
        r = self._refund(obj)
        return r.user_remark if r else ""

    def get_refund_reapply_count(self, obj):
        r = self._refund(obj)
        return r.reapply_count if r else 0

    def get_refund_can_reapply(self, obj):
        r = self._refund(obj)
        return refund_can_reapply(r) if r else False


class AdminBookingSerializer(BookingSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + ["username", "email", "full_name", "journey_date"]


class RefundSerializer(serializers.ModelSerializer):
    """Flat shape used by the admin Refund page."""

    pnr = serializers.CharField(source="booking.pnr", read_only=True)
    username = serializers.CharField(source="booking.user.username", read_only=True)
    email = serializers.CharField(source="booking.user.email", read_only=True)
    train_number = serializers.CharField(source="booking.train_number", read_only=True)
    train_name = serializers.CharField(source="booking.train_name", read_only=True)
    from_code = serializers.CharField(source="booking.from_code", read_only=True)
    to_code = serializers.CharField(source="booking.to_code", read_only=True)
    travel_date = serializers.DateField(source="booking.travel_date", read_only=True)
    class_code = serializers.CharField(source="booking.class_code", read_only=True)
    payment_method = serializers.CharField(source="booking.payment_method", read_only=True)
    total_amount = serializers.DecimalField(
        source="booking.total_amount", max_digits=10, decimal_places=2,
        coerce_to_string=False, read_only=True,
    )
    cancellation_charge = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, read_only=True
    )
    refund_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, read_only=True
    )
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Refund
        fields = [
            "id", "pnr", "username", "email",
            "train_number", "train_name", "from_code", "to_code",
            "travel_date", "class_code", "payment_method",
            "total_amount", "cancellation_charge", "refund_amount",
            "reason", "status", "requested_at", "processed_at",
            "admin_remark", "user_remark", "reapply_count", "reapplied_at",
            "decision_edit_count", "last_edited_at", "can_edit",
        ]

    def get_can_edit(self, obj):
        return refund_can_edit(obj)