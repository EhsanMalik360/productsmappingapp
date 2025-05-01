// Mock data for the application

// Products
export const mockProducts = [
  {
    id: '1',
    title: 'Wireless Bluetooth Headphones XD-500',
    ean: '8901234567890',
    brand: 'TechGear',
    salePrice: 79.99,
    unitsSold: 1250,
    amazonFee: 11.99,
    buyBoxPrice: 75.99,
    category: 'Electronics',
    rating: 4.7,
    reviewCount: 423,
    suppliers: ['1', '2', '3', '4', '5']
  },
  {
    id: '2',
    title: 'Premium Coffee Grinder HG-200',
    ean: '8901234567891',
    brand: 'HomeStyle',
    salePrice: 45.49,
    unitsSold: 879,
    amazonFee: 6.82,
    buyBoxPrice: 42.99,
    category: 'Kitchen',
    rating: 4.5,
    reviewCount: 356,
    suppliers: ['6', '7']
  },
  {
    id: '3',
    title: 'Adjustable Dumbbell Set 20kg',
    ean: '8901234567892',
    brand: 'FitPro',
    salePrice: 129.99,
    unitsSold: 356,
    amazonFee: 19.49,
    buyBoxPrice: 124.99,
    category: 'Sports',
    rating: 4.8,
    reviewCount: 178,
    suppliers: ['8', '9', '10']
  },
  {
    id: '4',
    title: 'Portable Bluetooth Speaker XS-100',
    ean: '8901234567893',
    brand: 'TechGear',
    salePrice: 35.99,
    unitsSold: 2145,
    amazonFee: 5.40,
    buyBoxPrice: 32.99,
    category: 'Electronics',
    rating: 4.3,
    reviewCount: 528,
    suppliers: ['1', '3']
  },
  {
    id: '5',
    title: 'Professional Hair Dryer Pro-X',
    ean: '8901234567894',
    brand: 'BeautyBox',
    salePrice: 89.95,
    unitsSold: 723,
    amazonFee: 13.49,
    buyBoxPrice: 84.95,
    category: 'Beauty',
    rating: 4.6,
    reviewCount: 289,
    suppliers: ['11']
  }
];

// Suppliers
export const mockSuppliers = [
  {
    id: '1',
    name: 'TechSupply Inc.',
    products: [
      { ean: '8901234567890', cost: 42.50, moq: 20, leadTime: '3 days', paymentTerms: 'Net 30' },
      { ean: '8901234567893', cost: 18.25, moq: 25, leadTime: '3 days', paymentTerms: 'Net 30' }
    ]
  },
  {
    id: '2',
    name: 'Global Electronics',
    products: [
      { ean: '8901234567890', cost: 45.20, moq: 50, leadTime: '7 days', paymentTerms: 'Net 45' }
    ]
  },
  {
    id: '3',
    name: 'AudioSource',
    products: [
      { ean: '8901234567890', cost: 44.10, moq: 25, leadTime: '5 days', paymentTerms: 'Net 30' },
      { ean: '8901234567893', cost: 19.75, moq: 30, leadTime: '5 days', paymentTerms: 'Net 30' }
    ]
  },
  {
    id: '4',
    name: 'EastCoast Distributors',
    products: [
      { ean: '8901234567890', cost: 46.90, moq: 100, leadTime: '10 days', paymentTerms: 'Net 60' }
    ]
  },
  {
    id: '5',
    name: 'PrimeParts Ltd.',
    products: [
      { ean: '8901234567890', cost: 48.75, moq: 10, leadTime: '2 days', paymentTerms: 'Net 15' }
    ]
  },
  {
    id: '6',
    name: 'Kitchen Wholesale',
    products: [
      { ean: '8901234567891', cost: 23.75, moq: 30, leadTime: '4 days', paymentTerms: 'Net 30' }
    ]
  },
  {
    id: '7',
    name: 'HomeGoodSuppliers',
    products: [
      { ean: '8901234567891', cost: 25.50, moq: 15, leadTime: '6 days', paymentTerms: 'Net 30' }
    ]
  },
  {
    id: '8',
    name: 'Sports Supply Co.',
    products: [
      { ean: '8901234567892', cost: 72.50, moq: 10, leadTime: '6 days', paymentTerms: 'Net 45' }
    ]
  },
  {
    id: '9',
    name: 'FitnessDirect',
    products: [
      { ean: '8901234567892', cost: 78.25, moq: 5, leadTime: '3 days', paymentTerms: 'Net 15' }
    ]
  },
  {
    id: '10',
    name: 'GymEquipment Pro',
    products: [
      { ean: '8901234567892', cost: 75.80, moq: 8, leadTime: '5 days', paymentTerms: 'Net 30' }
    ]
  },
  {
    id: '11',
    name: 'BeautyWholesalers',
    products: [
      { ean: '8901234567894', cost: 48.75, moq: 20, leadTime: '4 days', paymentTerms: 'Net 30' }
    ]
  }
];

// Sales Data for Charts
export const monthlySalesData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
  data: [25000, 32000, 30000, 42000, 51000, 48000, 58000, 62000, 70000, 75000]
};

// Brand Profit Data for Charts
export const brandsProfitData = {
  labels: ['TechGear', 'HomeStyle', 'FitPro', 'BeautyBox', 'KidJoy'],
  data: [342580, 215930, 173420, 156780, 98450]
};

// Profit Distribution Data
export const profitDistributionData = {
  labels: ['0-10%', '11-20%', '21-30%', '31-40%', '41-50%', '51-60%', '>60%'],
  data: [42, 186, 378, 425, 168, 54, 5]
};