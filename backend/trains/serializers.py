import re
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import Train, TrainClass

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TIME_FORMAT = "%H:%M"
TIME_INPUT_FORMATS = ["%H:%M", "%H:%M:%S"]


class TrainClassSerializer(serializers.ModelSerializer):
    fare = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.01"),
        coerce_to_string=False,
    )

    class Meta:
        model = TrainClass
        fields = ["id", "class_code", "total_seats", "fare"]
        read_only_fields = ["id"]


class TrainSerializer(serializers.ModelSerializer):
    departure_time = serializers.TimeField(format=TIME_FORMAT, input_formats=TIME_INPUT_FORMATS)
    arrival_time = serializers.TimeField(format=TIME_FORMAT, input_formats=TIME_INPUT_FORMATS)
    arrival_day = serializers.IntegerField(min_value=1, max_value=10, required=False, default=1)
    running_days = serializers.ListField(
        child=serializers.ChoiceField(choices=DAYS), allow_empty=False
    )
    classes = TrainClassSerializer(many=True)

    class Meta:
        model = Train
        fields = [
            "id",
            "train_number",
            "train_name",
            "train_type",
            "source",
            "destination",
            "departure_time",
            "arrival_time",
            "arrival_day",
            "duration",
            "running_days",
            "classes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        # duration is calculated automatically
        read_only_fields = ["id", "duration", "created_at", "updated_at"]

    # ---------- field validation ----------
    def validate_train_number(self, value):
        value = value.strip()
        if not re.fullmatch(r"\d{4,5}", value):
            raise serializers.ValidationError("Train number must be 4 or 5 digits.")

        # unique among active (not soft-deleted) trains only
        same = Train.objects.filter(train_number=value, is_deleted=False)
        if self.instance:
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError("A train with this number already exists.")
        return value

    def validate_running_days(self, value):
        # Remove duplicates and keep week order
        return [d for d in DAYS if d in set(value)]

    def validate_classes(self, value):
        if not value:
            raise serializers.ValidationError("Add at least one class.")
        codes = [c["class_code"] for c in value]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError("Each class can be added only once.")
        return value

    # ---------- object validation ----------
    def validate(self, attrs):
        source = attrs.get("source", getattr(self.instance, "source", ""))
        destination = attrs.get("destination", getattr(self.instance, "destination", ""))
        if source.strip().lower() == destination.strip().lower():
            raise serializers.ValidationError(
                {"destination": "Source and destination must be different."}
            )

        departure = attrs.get("departure_time", getattr(self.instance, "departure_time", None))
        arrival = attrs.get("arrival_time", getattr(self.instance, "arrival_time", None))
        arrival_day = attrs.get("arrival_day", getattr(self.instance, "arrival_day", 1))

        # On the same day (day 1) the arrival must be after the departure.
        # For a later arrival day any time is fine.
        if departure and arrival and arrival_day == 1 and arrival <= departure:
            raise serializers.ValidationError(
                {
                    "arrival_time": "For same day arrival, the arrival time must be after "
                    "the departure time. Select a later arrival day."
                }
            )
        return attrs

    # ---------- create / update ----------
    @transaction.atomic
    def create(self, validated_data):
        classes = validated_data.pop("classes")
        train = Train.objects.create(**validated_data)
        TrainClass.objects.bulk_create(
            [TrainClass(train=train, **c) for c in classes]
        )
        return train

    @transaction.atomic
    def update(self, instance, validated_data):
        classes = validated_data.pop("classes", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if classes is not None:
            existing = {c.class_code: c for c in instance.classes.all()}
            incoming_codes = set()

            for c in classes:
                code = c["class_code"]
                incoming_codes.add(code)
                if code in existing:
                    obj = existing[code]
                    obj.total_seats = c["total_seats"]
                    obj.fare = c["fare"]
                    obj.save()
                else:
                    TrainClass.objects.create(train=instance, **c)

            instance.classes.exclude(class_code__in=incoming_codes).delete()

        return instance