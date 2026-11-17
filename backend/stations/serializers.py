import re

from rest_framework import serializers

from .models import TrainStop, recalc_distances, stop_window

TIME_FORMAT = "%H:%M"
TIME_INPUT_FORMATS = ["%H:%M", "%H:%M:%S"]


class TrainStopSerializer(serializers.ModelSerializer):
    arrival_time = serializers.TimeField(
        format=TIME_FORMAT, input_formats=TIME_INPUT_FORMATS, required=False, allow_null=True
    )
    departure_time = serializers.TimeField(
        format=TIME_FORMAT, input_formats=TIME_INPUT_FORMATS, required=False, allow_null=True
    )
    # Distance from the previous station: any value (0 or more) is allowed
    leg_km = serializers.IntegerField(min_value=0, required=False, default=0)

    class Meta:
        model = TrainStop
        fields = [
            "id", "train", "stop_order", "station_name", "station_code",
            "arrival_time", "departure_time", "halt_minutes",
            "day", "leg_km", "distance_km", "platform",
        ]
        # distance_km (total from source) is calculated automatically from leg_km
        read_only_fields = ["id", "halt_minutes", "distance_km"]

    def validate_station_code(self, value):
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{2,10}", value):
            raise serializers.ValidationError("Station code must be 2-10 letters or digits.")
        return value

    def validate(self, attrs):
        inst = self.instance
        get = lambda k, default=None: attrs.get(k, getattr(inst, k, default))

        train = get("train")
        order = get("stop_order")
        arr, dep = get("arrival_time"), get("departure_time")
        day, code = get("day", 1), get("station_code")

        if order == 1 and dep is None:
            raise serializers.ValidationError({"departure_time": "Starting station needs a departure time."})
        if order > 1 and arr is None:
            raise serializers.ValidationError({"arrival_time": "Arrival time is required."})
        if arr is None and dep is None:
            raise serializers.ValidationError({"arrival_time": "Enter arrival or departure time."})
        if arr and dep and arr == dep:
            raise serializers.ValidationError({"departure_time": "Departure must be after arrival (halt cannot be 0)."})

        # the starting station has no previous station, so its leg distance is always 0
        if order == 1:
            attrs["leg_km"] = 0

        # only active (not soft-deleted) stations of this train
        others = TrainStop.objects.filter(train=train, is_deleted=False)
        if inst:
            others = others.exclude(pk=inst.pk)

        if others.filter(stop_order=order).exists():
            raise serializers.ValidationError({"stop_order": f"Stop number {order} already exists."})
        if others.filter(station_code=code).exists():
            raise serializers.ValidationError({"station_code": "This station is already in the route."})

        cur_a, cur_d = stop_window(arr, dep, day)
        prev = others.filter(stop_order__lt=order).order_by("-stop_order").first()
        nxt = others.filter(stop_order__gt=order).order_by("stop_order").first()

        if prev:
            _, prev_d = stop_window(prev.arrival_time, prev.departure_time, prev.day)
            if cur_a is not None and prev_d is not None and cur_a < prev_d:
                raise serializers.ValidationError({"arrival_time": f"Arrival cannot be before departure from {prev.station_code}. Check the day."})
        if nxt:
            nxt_a, _ = stop_window(nxt.arrival_time, nxt.departure_time, nxt.day)
            if cur_d is not None and nxt_a is not None and cur_d > nxt_a:
                raise serializers.ValidationError({"departure_time": f"Departure cannot be after arrival at {nxt.station_code}."})
        return attrs

    # After every save, the total distance of all stations of the train is calculated again
    def create(self, validated_data):
        stop = super().create(validated_data)
        recalc_distances(stop.train_id)
        stop.refresh_from_db(fields=["distance_km"])
        return stop

    def update(self, instance, validated_data):
        stop = super().update(instance, validated_data)
        recalc_distances(stop.train_id)
        stop.refresh_from_db(fields=["distance_km"])
        return stop