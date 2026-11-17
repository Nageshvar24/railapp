from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Train(models.Model):
    class TrainType(models.TextChoices):
        RAJDHANI = "Rajdhani", "Rajdhani"
        SHATABDI = "Shatabdi", "Shatabdi"
        VANDE_BHARAT = "Vande Bharat", "Vande Bharat"
        DURONTO = "Duronto", "Duronto"
        SUPERFAST = "Superfast", "Superfast"
        EXPRESS = "Express", "Express"
        MAIL = "Mail", "Mail"
        PASSENGER = "Passenger", "Passenger"

    # not unique at DB level (soft delete); checked in the serializer for active trains
    train_number = models.CharField(max_length=5)
    train_name = models.CharField(max_length=150)
    train_type = models.CharField(max_length=20, choices=TrainType.choices)
    source = models.CharField(max_length=150)
    destination = models.CharField(max_length=150)
    departure_time = models.TimeField()
    arrival_time = models.TimeField()
    # Journey day on which the train arrives: 1 = same day, 2 = next day, 3 = day after...
    arrival_day = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(10)]
    )
    # Calculated automatically (e.g. "15h 50m" or "2d 22h 10m")
    duration = models.CharField(max_length=30, blank=True, default="", editable=False)
    # List of day names, e.g. ["Mon", "Wed", "Fri"]
    running_days = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # soft delete
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "trains"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.train_number} - {self.train_name}"

    def calculate_duration(self):
        if not (self.departure_time and self.arrival_time):
            return ""
        dep = self.departure_time.hour * 60 + self.departure_time.minute
        arr = self.arrival_time.hour * 60 + self.arrival_time.minute
        total = (self.arrival_day - 1) * 24 * 60 + (arr - dep)
        if total <= 0:
            return ""
        days, rest = divmod(total, 24 * 60)
        hours, minutes = divmod(rest, 60)
        if days:
            return f"{days}d {hours}h {minutes}m"
        return f"{hours}h {minutes}m"

    def save(self, *args, **kwargs):
        self.duration = self.calculate_duration()
        super().save(*args, **kwargs)

    def soft_delete(self):
        now = timezone.now()
        # the stations of this train are removed too
        self.stops.filter(is_deleted=False).update(is_deleted=True, deleted_at=now)
        self.is_deleted = True
        self.deleted_at = now
        self.save()


class TrainClass(models.Model):
    class ClassCode(models.TextChoices):
        SLEEPER = "SL", "Sleeper (SL)"
        AC_3_TIER = "3A", "AC 3 Tier (3A)"
        AC_2_TIER = "2A", "AC 2 Tier (2A)"
        AC_FIRST = "1A", "AC First (1A)"
        CHAIR_CAR = "CC", "Chair Car (CC)"

    train = models.ForeignKey(Train, on_delete=models.CASCADE, related_name="classes")
    class_code = models.CharField(max_length=2, choices=ClassCode.choices)
    total_seats = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    class Meta:
        db_table = "train_classes"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["train", "class_code"], name="unique_class_per_train"
            )
        ]

    def __str__(self):
        return f"{self.train.train_number} - {self.class_code}"