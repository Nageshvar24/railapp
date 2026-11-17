from django.contrib.auth.models import AbstractUser
from django.db import models
class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN ="admin", "Admin"
        USER = "user", "User"
    email=models.EmailField(unique=True)
    full_name=models.CharField(max_length=150,blank=True)
    role=models.CharField(max_length=10,choices=Role.choices,default=Role.USER)
    plain_password = models.CharField(max_length=128, blank=True, default="")
    last_logout = models.DateTimeField(null=True, blank=True)


    class Meta:
        db_table="users"

    def save(self,*args,**kwargs):
        if self.is_superuser:
            self.role=self.Role.ADMIN
        super().save(*args,**kwargs)            