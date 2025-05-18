from django.contrib import admin
from .models import (
    Product, Supplier, SupplierProduct,
    ImportJob, ImportHistory
)


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at', 'updated_at')
    search_fields = ('name',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('title', 'brand', 'ean', 'mpn', 'sale_price', 'units_sold')
    list_filter = ('brand',)
    search_fields = ('title', 'brand', 'ean', 'mpn')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(SupplierProduct)
class SupplierProductAdmin(admin.ModelAdmin):
    list_display = ('supplier', 'product', 'cost', 'moq', 'lead_time', 'match_method')
    list_filter = ('supplier', 'match_method')
    search_fields = ('product__title', 'product__ean', 'product__mpn', 'ean')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(ImportJob)
class ImportJobAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'type', 'status', 'progress', 'created_at')
    list_filter = ('type', 'status')
    search_fields = ('file_name',)
    readonly_fields = ('id', 'created_at', 'started_at', 'completed_at', 'progress')
    fieldsets = (
        (None, {
            'fields': ('id', 'user', 'file_name', 'file_size', 'file_path', 'type')
        }),
        ('Status', {
            'fields': ('status', 'status_message', 'progress', 'total_rows')
        }),
        ('Configuration', {
            'fields': ('field_mapping', 'match_options', 'batch_size')
        }),
        ('Dates', {
            'fields': ('created_at', 'started_at', 'completed_at')
        }),
        ('Results', {
            'fields': ('results',)
        }),
    )


@admin.register(ImportHistory)
class ImportHistoryAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'type', 'status', 'total_records', 'successful_records', 'failed_records', 'created_at')
    list_filter = ('type', 'status')
    search_fields = ('file_name', 'error_message')
    readonly_fields = ('created_at',)
