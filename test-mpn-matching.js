/**
 * Test MPN Matching Logic
 * 
 * This script tests the MPN matching functionality by directly querying
 * the database for products and supplier products with MPNs.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL or key is missing. Make sure the .env file contains VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to normalize MPNs
const normalizeMpn = (mpn) => {
  if (!mpn) return '';
  return mpn.toString().toLowerCase().trim().replace(/[-\s_]+/g, '');
};

// Test function that queries the database
async function testMpnMatching() {
  console.log('\n=== MPN Matching Test ===\n');
  
  // Query supplier products with MPNs that should match
  console.log('Fetching supplier products with MPNs...');
  const { data: supplierProducts, error: spError } = await supabase
    .from('supplier_products')
    .select('id, mpn, product_id, match_method')
    .not('mpn', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(20);
  
  if (spError) {
    console.error('Error fetching supplier products:', spError);
    return;
  }
  
  console.log(`Found ${supplierProducts.length} supplier products with MPNs`);
  
  // Query products with MPNs
  console.log('\nFetching products with MPNs...');
  const { data: products, error: pError } = await supabase
    .from('products')
    .select('id, title, mpn, custom_mpn')
    .not('mpn', 'is', null)
    .limit(100);
  
  if (pError) {
    console.error('Error fetching products:', pError);
    return;
  }
  
  console.log(`Found ${products.length} products with MPNs`);
  
  // Create a lookup map for products by normalized MPN
  console.log('\nCreating normalized MPN lookup...');
  const productsByMpn = {};
  
  products.forEach(product => {
    if (product.mpn) {
      const normalizedMpn = normalizeMpn(product.mpn);
      if (normalizedMpn) {
        productsByMpn[normalizedMpn] = product;
      }
    }
    
    if (product.custom_mpn) {
      const normalizedCustomMpn = normalizeMpn(product.custom_mpn);
      if (normalizedCustomMpn) {
        productsByMpn[normalizedCustomMpn] = product;
      }
    }
  });
  
  console.log(`Created lookup map with ${Object.keys(productsByMpn).length} unique normalized MPNs`);
  
  // Test MPN matching
  console.log('\n=== Testing MPN Matching ===\n');
  let matchCount = 0;
  let mismatchCount = 0;
  
  // Display a table header
  console.log('Supplier MPN | Normalized MPN | Match Status | Product Title');
  console.log('-------------|---------------|--------------|---------------');
  
  for (const sp of supplierProducts) {
    if (sp.mpn) {
      const normalizedMpn = normalizeMpn(sp.mpn);
      const matchedProduct = productsByMpn[normalizedMpn];
      
      if (matchedProduct) {
        matchCount++;
        console.log(`${sp.mpn.substring(0, 12).padEnd(12)} | ${normalizedMpn.substring(0, 12).padEnd(12)} | MATCH ✅      | ${matchedProduct.title?.substring(0, 30)}`);
      } else {
        mismatchCount++;
        console.log(`${sp.mpn.substring(0, 12).padEnd(12)} | ${normalizedMpn.substring(0, 12).padEnd(12)} | NO MATCH ❌   | -`);
      }
    }
  }
  
  console.log('\n=== Results ===');
  console.log(`Total supplier products tested: ${supplierProducts.length}`);
  console.log(`MPNs matched: ${matchCount}`);
  console.log(`MPNs not matched: ${mismatchCount}`);
  console.log(`Match rate: ${Math.round((matchCount / supplierProducts.length) * 100)}%`);
  
  // Find and display MPNs that should match but don't
  console.log('\n=== Investigating Near Matches ===');
  
  for (const sp of supplierProducts) {
    if (sp.mpn && !sp.product_id) {
      const normalizedMpn = normalizeMpn(sp.mpn);
      
      // Look for similar MPNs in the products
      const similarMpns = products.filter(p => {
        const pNormalized = normalizeMpn(p.mpn || '');
        const pCustomNormalized = normalizeMpn(p.custom_mpn || '');
        
        // Check for partial matches or off-by-one characters
        return (
          pNormalized.includes(normalizedMpn) || 
          normalizedMpn.includes(pNormalized) ||
          pCustomNormalized.includes(normalizedMpn) || 
          normalizedMpn.includes(pCustomNormalized)
        );
      });
      
      if (similarMpns.length > 0) {
        console.log(`\nSupplier MPN "${sp.mpn}" (normalized: "${normalizedMpn}") has similar products:`);
        similarMpns.forEach(p => {
          console.log(`  - Product "${p.title}" MPN: "${p.mpn}", Custom MPN: "${p.custom_mpn}"`);
        });
      }
    }
  }
}

// Run the test
testMpnMatching()
  .catch(err => console.error('Test error:', err))
  .finally(() => process.exit(0)); 