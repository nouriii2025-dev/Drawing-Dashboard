
from django.db import migrations, models


SEEDS = {
    "status": [
        "Ongoing",
        "Done",
        "Pending",
        "Rev B",
        "Rev C",
        "Canceld",
    ],

    "drawn_by": [
        "Aravindh",
        "Machhindra",
    ],

    "software": [
        "AD",
        "AD/SD",
        "SD",
    ],

    "sales_person": [
        "Prab",
        "Sumedha Angolkar",
        "Sumedha Angolkar/Machhindra Walunj",
        "Huzefa Santrampurwala, Admin Abhijith",
        "Mateen Lakhani",
        "Aparna Sunitha",
        "Gleiza Alberca",
        "Shweta Kadam",
        "Krishnaraj Thorat",
        "Shakeel",
        "Avanti Jamjade",
        "Muhammed Nihal",
        "Siddhesh Shelar",
        "Abhijith Gopinathan",
        "Huzefa Santrampurwala,Shreyash Khandekar",
        "Lalit Vishwakarma",
        "Ramu Nepuane",
        "Atharva Shingare",
        "Nihal",
        "Mohammed Santrampurwala",
        "Huzefa Santrampurwala",
        "Prabin Prakash",
        "Ajaz khan",
        "Sumedha Angolkar+Huzefa Santrampurwala",
        "Mustafa Raja",
        "Namrata Basak",
        "Shreyash Khandekar",
        "Riaz Santrampurwala",
        "Fazil",
        "Mohamed Rishan",
        "Gladys Ann Estanol",
        "Yashraj Bakare",
    ],
}


def seed_master_data(apps, schema_editor):

    MasterData = apps.get_model("tracker", "MasterData")
    DailyUpdate = apps.get_model("tracker", "DailyUpdate")

    for category, values in SEEDS.items():

        existing_values = (
            DailyUpdate.objects
            .exclude(**{category: ""})
            .values_list(category, flat=True)
            .distinct()
        )

        all_values = list(values) + list(existing_values)

        for value in all_values:

            value = (value or "").strip()

            if value:
                MasterData.objects.get_or_create(
                    category=category,
                    value=value
                )


class Migration(migrations.Migration):

    dependencies = [
        ("tracker", "0004_delete_masterdata"),
    ]

    operations = [
        migrations.CreateModel(
            name="MasterData",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID"
                    )
                ),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("status", "Status"),
                            ("drawn_by", "Drawn By"),
                            ("software", "Software"),
                            ("sales_person", "Sales Person"),
                        ],
                        db_index=True,
                        max_length=30
                    )
                ),
                ("value", models.CharField(max_length=200)),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True)
                ),
            ],
            options={
                "ordering": ["category", "value"],
            },
        ),

        migrations.AddConstraint(
            model_name="masterdata",
            constraint=models.UniqueConstraint(
                fields=("category", "value"),
                name="unique_master_category_value"
            ),
        ),

        migrations.RunPython(
            seed_master_data,
            migrations.RunPython.noop
        ),
    ]
