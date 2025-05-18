from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    Product, Supplier, SupplierProduct,
    ImportJob, ImportHistory, UserProfile
)


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['role', 'is_active']


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    password = serializers.CharField(write_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'password', 'profile']
        read_only_fields = ['id']
    
    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        return user
    
    def update(self, instance, validated_data):
        if 'password' in validated_data:
            password = validated_data.pop('password')
            instance.set_password(password)
        return super().update(instance, validated_data)


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES, default='user')
    
    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password', 'role']
    
    def create(self, validated_data):
        role = validated_data.pop('role')
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        UserProfile.objects.create(user=user, role=role)
        return user


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