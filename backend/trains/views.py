from datetime import datetime, timedelta

from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from bookings.services import route_total_km, seats_left, segment_fare
from stations.models import TrainStop, stop_window

from .models import Train
from .serializers import TrainSerializer

NOT_FOUND = {"detail": "Train not found."}

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def get_active_train(pk):
    """Returns the train if it exists and is not soft-deleted, else None."""
    return Train.objects.prefetch_related("classes").filter(pk=pk, is_deleted=False).first()


def _hhmm(t):
    """Formats a time object as 'HH:MM' (None stays None)."""
    return t.strftime("%H:%M") if t else None


# READ (list) -> GET /api/trains/list/
# Optional filters: ?search=, ?source=, ?destination=, ?train_type=, ?is_active=true|false
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def train_list(request):
    trains = Train.objects.filter(is_deleted=False).prefetch_related("classes")
    p = request.query_params

    search = p.get("search")
    if search:
        trains = trains.filter(
            Q(train_number__icontains=search) | Q(train_name__icontains=search)
        )
    if p.get("source"):
        trains = trains.filter(source__icontains=p["source"])
    if p.get("destination"):
        trains = trains.filter(destination__icontains=p["destination"])
    if p.get("train_type"):
        trains = trains.filter(train_type=p["train_type"])
    if p.get("is_active") in ("true", "false"):
        trains = trains.filter(is_active=p["is_active"] == "true")

    return Response(TrainSerializer(trains, many=True).data)


# SEARCH (user) -> GET /api/trains/search/?from=NDLS&to=BCT&date=2026-11-10
# "from" and "to" are station codes. A train is returned when:
#   1) both stations are stops of the train, and FROM comes before TO
#   2) the train is active and not deleted
#   3) the train runs on the selected date (if a date is given)
# Every class returns the fare for THIS journey (based on km travelled)
# and how many seats are left for that date.
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def train_search(request):
    src = request.query_params.get("from", "").strip().upper()
    dst = request.query_params.get("to", "").strip().upper()
    date_str = request.query_params.get("date", "").strip()

    if not src or not dst:
        return Response(
            {"detail": "From and To are required."}, status=status.HTTP_400_BAD_REQUEST
        )
    if src == dst:
        return Response(
            {"detail": "From and To cannot be same."}, status=status.HTTP_400_BAD_REQUEST
        )

    travel_date = None
    if date_str:
        try:
            travel_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"detail": "Invalid date."}, status=status.HTTP_400_BAD_REQUEST)

    stops = TrainStop.objects.filter(
        is_deleted=False,
        station_code__in=[src, dst],
        train__is_deleted=False,
        train__is_active=True,
    ).select_related("train")

    # group the stops by train: train_id -> {station_code: stop}
    by_train = {}
    for s in stops:
        by_train.setdefault(s.train_id, {})[s.station_code] = s

    results = []
    for pair in by_train.values():
        a, b = pair.get(src), pair.get(dst)

        # both stations must exist on the train and FROM must come before TO
        if not a or not b or a.stop_order >= b.stop_order:
            continue

        train = a.train

        # the train must run on the day its journey started
        # (journey start date = selected date - (day of the FROM stop - 1))
        journey_date = None
        if travel_date:
            journey_date = travel_date - timedelta(days=a.day - 1)
            if DAY_NAMES[journey_date.weekday()] not in train.running_days:
                continue

        # travel time between the two stations (minutes from journey start)
        _, dep_abs = stop_window(a.arrival_time, a.departure_time, a.day)
        arr_abs, _ = stop_window(b.arrival_time, b.departure_time, b.day)
        duration = ""
        if dep_abs is not None and arr_abs is not None and arr_abs > dep_abs:
            minutes = arr_abs - dep_abs
            duration = f"{minutes // 60}h {minutes % 60}m"

        # total km of the whole route, used to cut the fare by distance
        total_km = route_total_km(train.id)

        results.append({
            "id": train.id,
            "train_number": train.train_number,
            "train_name": train.train_name,
            "train_type": train.train_type,
            "running_days": train.running_days,
            "from": {
                "station_name": a.station_name,
                "station_code": a.station_code,
                "departure_time": _hhmm(a.departure_time),
            },
            "to": {
                "station_name": b.station_name,
                "station_code": b.station_code,
                "arrival_time": _hhmm(b.arrival_time),
                "day_offset": b.day - a.day,  # 1 = arrives the next day
            },
            "duration": duration,
            "distance_km": b.distance_km - a.distance_km,
            "classes": [
                {
                    "class_code": c.class_code,
                    "total_seats": c.total_seats,
                    "fare": float(segment_fare(c.fare, a, b, total_km)),
                    "full_fare": float(c.fare),
                    "seats_left": seats_left(c, journey_date) if journey_date else c.total_seats,
                }
                for c in train.classes.all()
            ],
            "_sort": dep_abs if dep_abs is not None else 0,
        })

    # earliest departure first
    results.sort(key=lambda r: r["_sort"])
    for r in results:
        r.pop("_sort")

    return Response(results)


# READ (one) -> GET /api/trains/detail/<id>/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def train_detail(request, pk):
    train = get_active_train(pk)
    if not train:
        return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
    return Response(TrainSerializer(train).data)


# CREATE -> POST /api/trains/add/
@api_view(["POST"])
@permission_classes([IsAdminRole])
def train_add(request):
    serializer = TrainSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# UPDATE -> PUT / PATCH /api/trains/update/<id>/
@api_view(["PUT", "PATCH"])
@permission_classes([IsAdminRole])
def train_update(request, pk):
    train = get_active_train(pk)
    if not train:
        return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
    serializer = TrainSerializer(train, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# SOFT DELETE -> DELETE /api/trains/delete/<id>/
@api_view(["DELETE"])
@permission_classes([IsAdminRole])
def train_delete(request, pk):
    train = get_active_train(pk)
    if not train:
        return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
    train.soft_delete()
    return Response({"detail": "Train deleted."}, status=status.HTTP_200_OK)


# STATS -> GET /api/trains/stats/
@api_view(["GET"])
@permission_classes([IsAdminRole])
def train_stats(request):
    trains = Train.objects.filter(is_deleted=False)
    total = trains.count()
    active = trains.filter(is_active=True).count()
    return Response({"total": total, "active": active, "inactive": total - active})