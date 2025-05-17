from rest_framework import serializers
from .models import (
    Product, Supplier, SupplierProduct,
    ImportJob, ImportHistory, ProfitFormula
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
        from .serializers import SupplierProductSerializer
        suppliers = obj.supplier_products.all().select_related('supplier')[:5]
        return SupplierProductSerializer(suppliers, many=True).data


class SupplierProductSerializer(serializers.ModelSerializer):
    supplier_name = serializers.SerializerMethodField()
    product_title = serializers.SerializerMethodField()
    
    class Meta:
        model = SupplierProduct
        fields = '__all__'
    
    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None
    
    def get_product_title(self, obj):
        return obj.product.title if obj.product else obj.product_name


class ImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportJob
        fields = '__all__'


class ImportHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportHistory
        fields = '__all__'


class ProfitFormulaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfitFormula
        fields = ['id', 'name', 'formula_items', 'is_default', 'user', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at'] 