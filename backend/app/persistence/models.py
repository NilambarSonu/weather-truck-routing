import uuid
from django.db import models
from django.utils import timezone
from datetime import timedelta


class TripPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    algo_version = models.CharField(max_length=32, default="1.0.0")
    weather_provider = models.CharField(max_length=64, default="openmeteo")
    request_data = models.JSONField()
    result_data = models.JSONField()

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=7)
        super().save(*args, **kwargs)

    class Meta:
        db_table = "trip_plans"
        ordering = ["-created_at"]
