# Generated by Django 5.0.1 on 2025-05-15 10:53

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='importjob',
            name='match_column_mapping',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
