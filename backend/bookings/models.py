from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from trains.models import Train


class Booking(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "CONFIRMED", "Confirmed"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMethod(models.TextChoices):
        UPI = "UPI", "UPI"
        CARD = "CARD", "Card"
        NET_BANKING = "NET_BANKING", "Net Banking"

    pnr = models.CharField(max_length=10, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookings"
    )
    train = models.ForeignKey(Train, on_delete=models.PROTECT, related_name="bookings")

    # Snapshot of the train and route, so an old ticket never changes
    train_number = models.CharField(max_length=5)
    train_name = models.CharField(max_length=150)
    from_code = models.CharField(max_length=10)
    from_name = models.CharField(max_length=150)
    to_code = models.CharField(max_length=10)
    to_name = models.CharField(max_length=150)
    departure_time = models.TimeField(null=True, blank=True)
    arrival_time = models.TimeField(null=True, blank=True)

    # Date the passenger boards at the FROM station
    travel_date = models.DateField()
    # Date the train started its journey (used to count seats per run)
    journey_date = models.DateField()

    class_code = models.CharField(max_length=2, choices=Train.classes.rel.related_model.ClassCode.choices)
    payment_method = models.CharField(max_length=15, choices=PaymentMethod.choices)

    base_fare = models.DecimalField(max_digits=10, decimal_places=2)
    taxes = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CONFIRMED)
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "bookings"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["train", "class_code", "journey_date"])]

    def __str__(self):
        return f"{self.pnr} - {self.train_number}"


class Passenger(models.Model):
    class Gender(models.TextChoices):
        MALE = "Male", "Male"
        FEMALE = "Female", "Female"
        OTHER = "Other", "Other"

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="passengers")
    name = models.CharField(max_length=100)
    age = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(120)]
    )
    gender = models.CharField(max_length=10, choices=Gender.choices)

    # seat_index is the seat number counted over the whole class (1..total_seats)
    seat_index = models.PositiveIntegerField()
    coach = models.CharField(max_length=5)
    seat_number = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "booking_passengers"
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} ({self.coach}/{self.seat_number})"


class Refund(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        REFUNDED = "REFUNDED", "Refunded"
        REJECTED = "REJECTED", "Rejected"

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="refund")
    cancellation_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Optional reason the user gave while cancelling the ticket
    reason = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    # Remark written by the admin when rejecting (or approving) the refund
    admin_remark = models.CharField(max_length=500, blank=True, default="")
    # Remark written by the user when applying for the refund again
    user_remark = models.CharField(max_length=500, blank=True, default="")
    # How many times the user has applied again (limited by MAX_REAPPLY)
    reapply_count = models.PositiveSmallIntegerField(default=0)
    reapplied_at = models.DateTimeField(null=True, blank=True)

    # Set when the admin changes an earlier approve / reject decision
    decision_edit_count = models.PositiveSmallIntegerField(default=0)
    last_edited_at = models.DateTimeField(null=True, blank=True)

    requested_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="processed_refunds",
    )

    class Meta:
        db_table = "refunds"
        ordering = ["-requested_at"]

    def __str__(self):
        return f"Refund {self.booking.pnr} - {self.status}"