import secrets
import string
from datetime import datetime, time, timedelta, timezone as dt_timezone
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, ValidationError

from stations.models import TrainStop
from trains.models import Train, TrainClass

from .models import Booking, Passenger, Refund

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
GST_RATE = Decimal("0.05")

# Smallest fare for a very short trip (never more than the full route fare)
MIN_FARE = Decimal("20")

# How many times a user may apply again for one rejected refund
MAX_REAPPLY = 1

# Length limits for the admin reject reason and the user re-apply remark
MIN_REMARK_LENGTH = 5
MAX_REMARK_LENGTH = 200

# Seats in one coach and the coach letter for every class
SEATS_PER_COACH = {"SL": 72, "3A": 64, "2A": 46, "1A": 24, "CC": 78}
COACH_PREFIX = {"SL": "S", "3A": "B", "2A": "A", "1A": "H", "CC": "C"}

# ---- cancellation rules ----
IST = dt_timezone(timedelta(hours=5, minutes=30))  # Train times are Indian Standard Time
# Flat cancellation charge per passenger
FLAT_CHARGE = {
    "SL": Decimal("120"),
    "3A": Decimal("180"),
    "2A": Decimal("200"),
    "1A": Decimal("240"),
    "CC": Decimal("180"),
}


class BookingError(APIException):
    """400 error with a plain string: {"detail": "message"}."""

    status_code = 400
    default_code = "invalid"


def money(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def clean_remark(text, what):
    """Trims the text and checks the minimum length. `what` is used in the error message."""
    text = (text or "").strip()
    if len(text) < MIN_REMARK_LENGTH:
        raise BookingError(
            f"Please write at least {MIN_REMARK_LENGTH} characters for the {what} "
            f"(you wrote {len(text)})."
        )
    return text[:MAX_REMARK_LENGTH]


def journey_start_date(travel_date, from_day):
    """Date on which the train started its journey (FROM stop day 1 = same date)."""
    return travel_date - timedelta(days=from_day - 1)


def seats_booked(train_id, class_code, journey_date):
    return Passenger.objects.filter(
        booking__train_id=train_id,
        booking__class_code=class_code,
        booking__journey_date=journey_date,
        booking__status=Booking.Status.CONFIRMED,
    ).count()


def seats_left(train_class, journey_date):
    booked = seats_booked(train_class.train_id, train_class.class_code, journey_date)
    return max(train_class.total_seats - booked, 0)


# =====================================================================
# Fare (based on distance travelled)
# =====================================================================
def route_total_km(train_id):
    """Total distance of the whole route (the last active stop)."""
    total = TrainStop.objects.filter(train_id=train_id, is_deleted=False).aggregate(
        m=Max("distance_km")
    )["m"]
    return total or 0


def segment_fare(full_fare, from_stop, to_stop, total_km):
    """
    Fare for ONE passenger between two stops.

    full_fare is the fare of the whole route (first stop to last stop), so the fare
    is cut in proportion to the km travelled:

        fare = full_fare x (km between the two stops) / (total km of the route)

    The result is rounded to whole rupees, is never less than MIN_FARE and
    never more than the full route fare.
    """
    full = Decimal(full_fare)
    km = to_stop.distance_km - from_stop.distance_km
    if total_km <= 0 or km <= 0 or km >= total_km:
        return full
    fare = (full * km / Decimal(total_km)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return min(full, max(fare, MIN_FARE))


def calc_fare(unit_fare, count):
    """Returns (base, taxes, total) for the given number of passengers."""
    base = (Decimal(unit_fare) * count).quantize(Decimal("0.01"))
    taxes = (base * GST_RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return base, taxes, base + taxes


def seat_label(class_code, seat_index):
    """Converts a seat index into (coach, seat number), e.g. 70 in 3A -> ('B2', 6)."""
    per_coach = SEATS_PER_COACH[class_code]
    coach_no = (seat_index - 1) // per_coach + 1
    seat_no = (seat_index - 1) % per_coach + 1
    return f"{COACH_PREFIX[class_code]}{coach_no}", seat_no


def generate_pnr():
    alphabet = string.ascii_uppercase + string.digits
    while True:
        pnr = "".join(secrets.choice(alphabet) for _ in range(10))
        if not Booking.objects.filter(pnr=pnr).exists():
            return pnr


@transaction.atomic
def create_booking(user, data):
    """Validates the request, allocates seats and creates the booking."""
    train = Train.objects.filter(pk=data["train"], is_deleted=False, is_active=True).first()
    if not train:
        raise ValidationError({"detail": "Train not found or not available."})

    src = data["from_code"].strip().upper()
    dst = data["to_code"].strip().upper()
    if src == dst:
        raise ValidationError({"detail": "From and To cannot be same."})

    stops = {
        s.station_code: s
        for s in TrainStop.objects.filter(
            train=train, is_deleted=False, station_code__in=[src, dst]
        )
    }
    a, b = stops.get(src), stops.get(dst)
    if not a or not b or a.stop_order >= b.stop_order:
        raise ValidationError({"detail": "This train does not run between the selected stations."})

    travel_date = data["travel_date"]
    if travel_date < timezone.localdate():
        raise ValidationError({"travel_date": "Travel date cannot be in the past."})

    journey_date = journey_start_date(travel_date, a.day)
    if DAY_NAMES[journey_date.weekday()] not in train.running_days:
        raise ValidationError({"travel_date": "This train does not run on the selected date."})

    # Lock the class row so two users cannot get the same seat
    train_class = (
        TrainClass.objects.select_for_update()
        .filter(train=train, class_code=data["class_code"])
        .first()
    )
    if not train_class:
        raise ValidationError({"class_code": "This class is not available on the train."})

    passengers = data["passengers"]
    left = seats_left(train_class, journey_date)
    if len(passengers) > left:
        raise ValidationError({"detail": f"Only {left} seat(s) left in this class."})

    # Fare depends on the distance between the FROM and TO stations
    unit_fare = segment_fare(train_class.fare, a, b, route_total_km(train.id))
    base, taxes, total = calc_fare(unit_fare, len(passengers))

    booking = Booking.objects.create(
        pnr=generate_pnr(),
        user=user,
        train=train,
        train_number=train.train_number,
        train_name=train.train_name,
        from_code=a.station_code,
        from_name=a.station_name,
        to_code=b.station_code,
        to_name=b.station_name,
        departure_time=a.departure_time,
        arrival_time=b.arrival_time,
        travel_date=travel_date,
        journey_date=journey_date,
        class_code=train_class.class_code,
        payment_method=data["payment_method"],
        base_fare=base,
        taxes=taxes,
        total_amount=total,
    )

    # Allocate the lowest free seats
    taken = set(
        Passenger.objects.filter(
            booking__train=train,
            booking__class_code=train_class.class_code,
            booking__journey_date=journey_date,
            booking__status=Booking.Status.CONFIRMED,
        ).values_list("seat_index", flat=True)
    )
    free_seats = (i for i in range(1, train_class.total_seats + 1) if i not in taken)

    rows = []
    for p in passengers:
        index = next(free_seats)
        coach, number = seat_label(train_class.class_code, index)
        rows.append(
            Passenger(
                booking=booking,
                name=p["name"].strip(),
                age=p["age"],
                gender=p["gender"],
                seat_index=index,
                coach=coach,
                seat_number=number,
            )
        )
    Passenger.objects.bulk_create(rows)
    return booking


# =====================================================================
# Cancellation and refund
# =====================================================================
def departure_datetime(booking):
    """Moment the train leaves the passenger's boarding station (IST)."""
    return datetime.combine(booking.travel_date, booking.departure_time or time(0, 0), tzinfo=IST)


def hours_before_departure(booking, now=None):
    now = now or timezone.now()
    return (departure_datetime(booking) - now).total_seconds() / 3600


def can_cancel(booking):
    return booking.status == Booking.Status.CONFIRMED and hours_before_departure(booking) > 0


def calc_refund(booking, now=None):
    """
    Returns the cancellation charge and refund for this booking.

    More than 48 hours before departure : flat charge per passenger
    12 to 48 hours                      : 25% of the base fare (not less than the flat charge)
    4 to 12 hours                       : 50% of the base fare (not less than the flat charge)
    Less than 4 hours                   : no refund
    """
    hours = hours_before_departure(booking, now)
    if hours <= 0:
        raise BookingError("The train has already departed. This ticket cannot be cancelled.")

    base = Decimal(booking.base_fare)
    total = Decimal(booking.total_amount)
    flat = FLAT_CHARGE.get(booking.class_code, Decimal("120")) * booking.passengers.count()

    if hours > 48:
        charge, rule = min(flat, base), "More than 48 hours before departure: flat charge per passenger"
    elif hours > 12:
        charge, rule = min(max(flat, base * Decimal("0.25")), base), "12 to 48 hours before departure: 25% of the fare"
    elif hours > 4:
        charge, rule = min(max(flat, base * Decimal("0.50")), base), "4 to 12 hours before departure: 50% of the fare"
    else:
        charge, rule = total, "Less than 4 hours before departure: no refund"

    charge = money(charge)
    refund = money(max(total - charge, Decimal("0")))
    return {
        "total_amount": float(total),
        "cancellation_charge": float(charge),
        "refund_amount": float(refund),
        "rule": rule,
        "_charge": charge,
        "_refund": refund,
    }


def get_user_booking(user, pnr, lock=False):
    qs = Booking.objects.filter(pnr=pnr.strip().upper(), user=user)
    if lock:
        qs = qs.select_for_update()
    booking = qs.first()
    if not booking:
        raise NotFound("Booking not found.")
    return booking


def cancel_preview(user, pnr):
    """Shows what the user will get back, without changing anything."""
    booking = get_user_booking(user, pnr)
    if booking.status == Booking.Status.CANCELLED:
        raise BookingError("This ticket is already cancelled.")
    info = calc_refund(booking)
    return {k: v for k, v in info.items() if not k.startswith("_")}


@transaction.atomic
def cancel_booking(user, pnr, reason=""):
    """Cancels the ticket (seats become free) and creates a PENDING refund request."""
    booking = get_user_booking(user, pnr, lock=True)
    if booking.status == Booking.Status.CANCELLED:
        raise BookingError("This ticket is already cancelled.")

    info = calc_refund(booking)

    booking.status = Booking.Status.CANCELLED
    booking.cancelled_at = timezone.now()
    booking.save(update_fields=["status", "cancelled_at"])

    refund = Refund.objects.create(
        booking=booking,
        cancellation_charge=info["_charge"],
        refund_amount=info["_refund"],
        reason=(reason or "").strip()[:255],
        # Nothing to pay back, so there is nothing for the admin to approve
        status=Refund.Status.PENDING if info["_refund"] > 0 else Refund.Status.REJECTED,
        processed_at=None if info["_refund"] > 0 else timezone.now(),
    )
    return booking, refund


def refund_can_reapply(refund):
    """
    The user may apply again only when the admin rejected the refund with a reason
    and the user has not used the re-apply chance yet.
    """
    return (
        refund.status == Refund.Status.REJECTED
        and bool(refund.admin_remark)  # An automatic rejection (zero refund) has no remark
        and refund.refund_amount > 0
        and refund.reapply_count < MAX_REAPPLY
    )


def refund_can_edit(refund):
    """
    The admin may change a decision that was already made.
    Pending refunds use the normal approve / reject buttons, and an automatic
    rejection (zero refund) was never an admin decision, so it cannot be edited.
    """
    return refund.status != Refund.Status.PENDING and refund.refund_amount > 0


@transaction.atomic
def process_refund(refund_id, admin_user, action, remark=""):
    """Admin approves (REFUNDED) or rejects (REJECTED) a pending refund."""
    refund = (
        Refund.objects.select_for_update()
        .select_related("booking", "booking__user")
        .filter(pk=refund_id)
        .first()
    )
    if not refund:
        raise NotFound("Refund request not found.")
    if refund.status != Refund.Status.PENDING:
        raise BookingError("This refund has already been processed.")

    if action == "reject":
        remark = clean_remark(remark, "rejection reason")
    else:
        # The remark is optional when approving
        remark = (remark or "").strip()[:MAX_REMARK_LENGTH]

    refund.status = Refund.Status.REFUNDED if action == "approve" else Refund.Status.REJECTED
    refund.admin_remark = remark
    refund.processed_at = timezone.now()
    refund.processed_by = admin_user
    refund.save(update_fields=["status", "admin_remark", "processed_at", "processed_by"])
    return refund


@transaction.atomic
def edit_refund_decision(refund_id, admin_user, action, remark=""):
    """Admin changes an earlier decision (approve <-> reject) or only updates the remark."""
    refund = (
        Refund.objects.select_for_update()
        .select_related("booking", "booking__user")
        .filter(pk=refund_id)
        .first()
    )
    if not refund:
        raise NotFound("Refund request not found.")
    if not refund_can_edit(refund):
        raise BookingError("This refund decision cannot be edited.")

    if action == "reject":
        remark = clean_remark(remark, "rejection reason")
    else:
        # The remark is optional when approving
        remark = (remark or "").strip()[:MAX_REMARK_LENGTH]

    new_status = Refund.Status.REFUNDED if action == "approve" else Refund.Status.REJECTED
    if new_status == refund.status and remark == refund.admin_remark:
        raise BookingError("Nothing was changed.")

    now = timezone.now()
    refund.status = new_status
    refund.admin_remark = remark
    refund.processed_at = now
    refund.processed_by = admin_user
    refund.decision_edit_count += 1
    refund.last_edited_at = now
    refund.save(
        update_fields=[
            "status", "admin_remark", "processed_at", "processed_by",
            "decision_edit_count", "last_edited_at",
        ]
    )
    return refund


@transaction.atomic
def reapply_refund(user, pnr, remark):
    """The user asks again for a rejected refund (allowed only MAX_REAPPLY times)."""
    booking = get_user_booking(user, pnr)
    refund = Refund.objects.select_for_update().filter(booking=booking).first()
    if not refund:
        raise NotFound("Refund request not found.")
    if not refund_can_reapply(refund):
        raise BookingError("You cannot apply for this refund again.")

    remark = clean_remark(remark, "remark")

    # The admin remark is kept, so the admin can still see the earlier rejection reason
    refund.status = Refund.Status.PENDING
    refund.user_remark = remark
    refund.reapply_count += 1
    refund.reapplied_at = timezone.now()
    refund.processed_at = None
    refund.processed_by = None
    refund.save(
        update_fields=[
            "status", "user_remark", "reapply_count",
            "reapplied_at", "processed_at", "processed_by",
        ]
    )
    return refund