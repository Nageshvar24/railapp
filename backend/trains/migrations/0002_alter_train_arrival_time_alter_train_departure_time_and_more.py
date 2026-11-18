
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('trains', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='train',
            name='arrival_time',
            field=models.TimeField(),
        ),
        migrations.AlterField(
            model_name='train',
            name='departure_time',
            field=models.TimeField(),
        ),
        migrations.AlterField(
            model_name='train',
            name='duration',
            field=models.CharField(
                blank=True,
                default='',
                editable=False,
                max_length=30
            ),
        ),
    ]
