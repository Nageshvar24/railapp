from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from trains.models import Train


def stop_window(arrival, departure, day):
    """Returns (absolute_arrival, absolute_departure) in minutes from journey start."""
    base = (day - 1) * 1440
    a = base + arrival.hour * 60 + arrival.minute if arrival else None
    if arrival and departure:
        halt = ((departure.hour * 60 + departure.minute) - (arrival.hour * 60 + arrival.minute)) % 1440
        d = a + halt
    elif departure:
        d = base + departure.hour * 60 + departure.minute
    else:
        d = None
    return a, d


class TrainStop(models.Model):
    train = models.ForeignKey(Train, on_delete=models.CASCADE, related_name="stops")
    stop_order = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    station_name = models.CharField(max_length=150)
    station_code = models.CharField(max_length=10)
    arrival_time = models.TimeField(null=True, blank=True)    # empty at the first station
    departure_time = models.TimeField(null=True, blank=True)  # empty at the last station
    halt_minutes = models.PositiveSmallIntegerField(default=0, editable=False)
    day = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    # Distance from the PREVIOUS station (entered by the admin, any value is allowed)
    leg_km = models.PositiveIntegerField(default=0)
    # Total distance from the source. Calculated automatically from leg_km (see recalc_distances)
    distance_km = models.PositiveIntegerField(default=0)
    platform = models.CharField(max_length=5, blank=True, default="")

    # soft delete
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "train_stops"
        ordering = ["stop_order"]

    def __str__(self):
        return f"{self.train.train_number} #{self.stop_order} {self.station_code}"

    def save(self, *args, **kwargs):
        if self.arrival_time and self.departure_time:
            a = self.arrival_time.hour * 60 + self.arrival_time.minute
            d = self.departure_time.hour * 60 + self.departure_time.minute
            self.halt_minutes = (d - a) % 1440
        else:
            self.halt_minutes = 0
        super().save(*args, **kwargs)

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save()


def recalc_distances(train_id):
    """
    Sets distance_km (total from source) of every active stop of the train
    by adding up leg_km in stop order.
    """
    total = 0
    changed = []
    stops = TrainStop.objects.filter(train_id=train_id, is_deleted=False).order_by("stop_order")
    for s in stops:
        total += s.leg_km
        if s.distance_km != total:
            s.distance_km = total
            changed.append(s)
    if changed:
        TrainStop.objects.bulk_update(changed, ["distance_km"])