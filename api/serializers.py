from rest_framework import serializers
from .models import (
    Product, Supplier, SupplierProduct,
    ImportJob, ImportHistory
)


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'


class SupplierDetailSerializer(serializers.ModelSerializer):
    products_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Supplier
        fields = '__all__'
    
    def get_products_count(self, obj):
        return obj.supplier_products.count()


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = '__all__'


class ProductDetailSerializer(serializers.ModelSerializer):
    supplier_count = serializers.SerializerMethodField()
    suppliers = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = '__all__'
    
    def get_supplier_count(self, obj):
        return obj.supplier_products.count()
    
    def get_suppliers(self, obj):
        supplier_products = obj.supplier_products.all().select_related('supplier')[:5]
        return [
            {
                'id': sp.supplier.id,
                'name': sp.supplier.name,
                'cost': float(sp.cost),
                'moq': sp.moq,
                'lead_time': sp.lead_time,
                'match_method': sp.match_method,
            }
            for sp in supplier_products
        ]


class SupplierProductSerializer(serializers.ModelSerializer):
    supplier_name = serializers.SerializerMethodField()
    product_title = serializers.SerializerMethodField()
    
    class Meta:
        model = SupplierProduct
        fields = '__all__'
    
    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None
    
    def get_product_title(self, obj):
        return obj.product.title if obj.product else None


class ImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportJob
        fields = '__all__'


class ImportHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportHistory
        fields = '__all__' 