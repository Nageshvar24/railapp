from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole

from .models import TrainStop, recalc_distances
from .serializers import TrainStopSerializer


def get_active_stop(pk):
    """Returns the stop if it exists and is not soft-deleted, else None."""
    return TrainStop.objects.select_related("train").filter(pk=pk, is_deleted=False).first()


NOT_FOUND = {"detail": "Station not found."}


# READ (list) -> GET /api/stations/list/?train=<id>
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def station_list(request):
    stops = TrainStop.objects.filter(is_deleted=False).select_related("train")
    train = request.query_params.get("train")
    if train and train.isdigit():
        stops = stops.filter(train_id=int(train))
    return Response(TrainStopSerializer(stops, many=True).data)


# STATION NAMES (user dropdown) -> GET /api/stations/names/
# Returns every unique station that the admin added to an active train.
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def station_names(request):
    rows = (
        TrainStop.objects.filter(
            is_deleted=False,
            train__is_deleted=False,
            train__is_active=True,
        )
        .values("station_code", "station_name")
        .order_by("station_name")
    )
    # keep one entry per station code
    unique = {}
    for r in rows:
        unique.setdefault(r["station_code"], r["station_name"])
    return Response(
        [{"station_code": code, "station_name": name} for code, name in unique.items()]
    )


# READ (one) -> GET /api/stations/detail/<id>/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def station_detail(request, pk):
    stop = get_active_stop(pk)
    if not stop:
        return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
    return Response(TrainStopSerializer(stop).data)


# CREATE -> POST /api/stations/add/
@api_view(["POST"])
@permission_classes([IsAdminRole])
def station_add(request):
    serializer = TrainStopSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# UPDATE -> PUT / PATCH /api/stations/update/<id>/
@api_view(["PUT", "PATCH"])
@permission_classes([IsAdminRole])
def station_update(request, pk):
    stop = get_active_stop(pk)
    if not stop:
        return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
    serializer = TrainStopSerializer(stop, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# SOFT DELETE -> DELETE /api/stations/delete/<id>/
@api_view(["DELETE"])
@permission_classes([IsAdminRole])
def station_delete(request, pk):
    stop = get_active_stop(pk)
    if not stop:
        return Response(NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
    stop.soft_delete()
    # the total distance of the remaining stations changes
    recalc_distances(stop.train_id)
    return Response({"detail": "Station deleted."}, status=status.HTTP_200_OK)