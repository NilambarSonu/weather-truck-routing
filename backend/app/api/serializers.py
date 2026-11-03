from datetime import datetime, timezone, timedelta
from rest_framework import serializers
from timezonefinder import TimezoneFinder
import zoneinfo
from app.domain.models import Place, TripRequest, SamplingConfig
from app.domain.geometry import haversine_point, METERS_PER_MILE

tf = TimezoneFinder()


class PlaceSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=256)
    lat = serializers.FloatField(min_value=-90.0, max_value=90.0)
    lon = serializers.FloatField(min_value=-180.0, max_value=180.0)


class SamplingSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["auto", "fixed"], default="auto")
    interval_mi = serializers.FloatField(required=False, default=25.0)

    def validate(self, data):
        if data.get("mode") == "fixed":
            interval = data.get("interval_mi", 25.0)
            if interval not in (10.0, 25.0, 50.0):
                raise serializers.ValidationError({"interval_mi": "Fixed sampling must be 10, 25, or 50 miles."})
        return data


class TripPlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_local = serializers.CharField(
        help_text="Origin-local ISO datetime e.g. 2026-11-04T08:00"
    )
    load_lb = serializers.IntegerField(
        min_value=1,
        max_value=80000,
        help_text="Cargo weight in pounds (1 - 80,000 lb)",
    )
    sampling = SamplingSerializer(required=False, default=dict)
    options = serializers.DictField(required=False, default=dict)

    def validate(self, data):
        origin_data = data["origin"]
        dest_data = data["destination"]

        # Invariant: origin and destination at least 1 mile apart
        dist_m = haversine_point(
            origin_data["lat"], origin_data["lon"], dest_data["lat"], dest_data["lon"]
        )
        if dist_m < METERS_PER_MILE:
            raise serializers.ValidationError(
                "Origin and destination must be at least 1 mile apart."
            )

        # Parse local departure time and resolve origin timezone
        dep_str = data["departure_local"]
        tz_name = tf.timezone_at(lng=origin_data["lon"], lat=origin_data["lat"]) or "UTC"
        try:
            loc_tz = zoneinfo.ZoneInfo(tz_name)
        except Exception:
            loc_tz = timezone.utc

        try:
            # Parse ISO datetime
            naive_dt = datetime.fromisoformat(dep_str.replace("Z", ""))
            if naive_dt.tzinfo is None:
                local_dt = naive_dt.replace(tzinfo=loc_tz)
            else:
                local_dt = naive_dt.astimezone(loc_tz)

            depart_utc = local_dt.astimezone(timezone.utc)
        except Exception as e:
            raise serializers.ValidationError(
                {"departure_local": f"Invalid date/time format: {dep_str}. Expected ISO-8601 (e.g. 2026-11-04T08:00)."}
            )

        # Allow departures within past 30 min up to 16 days ahead
        now_utc = datetime.now(timezone.utc)
        if depart_utc < now_utc - timedelta(minutes=30):
            raise serializers.ValidationError(
                {"departure_local": "Departure time cannot be in the past."}
            )
        if depart_utc > now_utc + timedelta(days=16):
            raise serializers.ValidationError(
                {"departure_local": "Forecast models support departures up to 16 days in advance."}
            )

        data["departure_utc"] = depart_utc
        data["origin_tz"] = tz_name
        return data

    def to_domain(self) -> TripRequest:
        val = self.validated_data
        orig = Place(**val["origin"])
        dest = Place(**val["destination"])
        samp_data = val.get("sampling", {})
        sampling = SamplingConfig(
            mode=samp_data.get("mode", "auto"),
            interval_mi=float(samp_data.get("interval_mi", 25.0)),
        )
        return TripRequest(
            origin=orig,
            destination=dest,
            departure_utc=val["departure_utc"],
            origin_tz=val["origin_tz"],
            load_lb=val["load_lb"],
            sampling=sampling,
            options=val.get("options", {}),
        )
