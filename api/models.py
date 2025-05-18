from django.db import models
from django.contrib.auth.models import User
import uuid


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField(null=False, blank=False)
    ean = models.TextField(null=False, blank=False, unique=True)
    mpn = models.TextField(null=True, blank=True)
    asin = models.TextField(null=True, blank=True)
    upc = models.TextField(null=True, blank=True)
    brand = models.TextField(null=False, blank=False)
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, null=False, blank=False)
    units_sold = models.IntegerField(default=0)
    amazon_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    fba_fees = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    referral_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    buy_box_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    buy_box_seller_name = models.TextField(null=True, blank=True)
    category = models.TextField(null=True, blank=True)
    rating = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    review_count = models.IntegerField(default=0)
    bought_past_month = models.IntegerField(default=0)
    estimated_monthly_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    fba_sellers = models.IntegerField(default=0)
    amazon_instock_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    dominant_seller_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    live_offers_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.ean})"

    class Meta:
        db_table = 'products'


class Supplier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField(null=False, blank=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'suppliers'


class SupplierProduct(models.Model):
    """
    Represents a product offered by a supplier with cost information
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='products')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, related_name='suppliers', null=True, blank=True)
    ean = models.CharField(max_length=255, blank=True, null=True)
    mpn = models.CharField(max_length=255, blank=True, null=True)
    product_name = models.CharField(max_length=255, blank=True, null=True)
    supplier_stock = models.IntegerField(default=0)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    moq = models.IntegerField(default=1)
    lead_time = models.CharField(max_length=255, default='3 days')
    payment_terms = models.CharField(max_length=255, default='Net 30')
    match_method = models.CharField(max_length=20, default='manual')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'supplier_products'
        # This constraint works only when product_id is not NULL
        # For unmatched products, we rely on the id field being unique
        constraints = [
            models.UniqueConstraint(
                fields=['supplier', 'product'],
                name='unique_supplier_product',
                condition=models.Q(product__isnull=False)
            )
        ]
        
    def __str__(self):
        if self.product:
            return f"{self.supplier.name} - {self.product.title}"
        else:
            return f"{self.supplier.name} - {self.product_name or 'Unmatched Product'}"


class ImportJob(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    TYPE_CHOICES = [
        ('supplier', 'Supplier'),
        ('product', 'Product'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    file_name = models.TextField(null=False, blank=False)
    file_size = models.BigIntegerField(null=False, blank=False)
    file_path = models.TextField(null=False, blank=False)
    type = models.TextField(choices=TYPE_CHOICES, null=False, blank=False)
    status = models.TextField(choices=STATUS_CHOICES, null=False, blank=False)
    status_message = models.TextField(null=True, blank=True)
    progress = models.IntegerField(default=0)
    field_mapping = models.JSONField(null=True, blank=True)
    match_options = models.JSONField(null=True, blank=True)
    match_column_mapping = models.JSONField(null=True, blank=True)
    batch_size = models.IntegerField(default=100)
    total_rows = models.IntegerField(null=True, blank=True)
    results = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'import_jobs'
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['status']),
            models.Index(fields=['type']),
        ]

    def __str__(self):
        return f"{self.type} import: {self.file_name} ({self.status})"


class ImportHistory(models.Model):
    TYPE_CHOICES = [
        ('Amazon Data', 'Amazon Data'),
        ('Supplier Data', 'Supplier Data'),
        ('product', 'Product'),
        ('supplier', 'Supplier'),
    ]
    
    STATUS_CHOICES = [
        ('Completed', 'Completed'),
        ('Failed', 'Failed'),
        ('In Progress', 'In Progress'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('processing', 'Processing'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.TextField(choices=TYPE_CHOICES, null=False, blank=False)
    file_name = models.TextField(null=False, blank=False)
    file_size = models.BigIntegerField(null=True, blank=True)
    status = models.TextField(choices=STATUS_CHOICES, null=False, blank=False)
    total_records = models.IntegerField(default=0)
    successful_records = models.IntegerField(default=0)
    failed_records = models.IntegerField(default=0)
    total_rows = models.IntegerField(null=True, blank=True)
    processed_rows = models.IntegerField(null=True, blank=True)
    error_count = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'import_history'

    def __str__(self):
        return f"{self.type} import: {self.file_name} ({self.status})" 