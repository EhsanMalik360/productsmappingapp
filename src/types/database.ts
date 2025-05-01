export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
          title: string
          ean: string
          brand: string
          sale_price: number
          units_sold: number
          amazon_fee: number
          buy_box_price: number
          category: string | null
          rating: number | null
          review_count: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          title: string
          ean: string
          brand: string
          sale_price: number
          units_sold?: number
          amazon_fee: number
          buy_box_price?: number
          category?: string | null
          rating?: number | null
          review_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          ean?: string
          brand?: string
          sale_price?: number
          units_sold?: number
          amazon_fee?: number
          buy_box_price?: number
          category?: string | null
          rating?: number | null
          review_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      suppliers: {
        Row: {
          id: string
          name: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string | null
          updated_at?: string | null
        }
      }
      supplier_products: {
        Row: {
          id: string
          supplier_id: string | null
          product_id: string | null
          ean: string
          cost: number
          moq: number | null
          lead_time: string | null
          payment_terms: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          supplier_id?: string | null
          product_id?: string | null
          ean: string
          cost: number
          moq?: number | null
          lead_time?: string | null
          payment_terms?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          supplier_id?: string | null
          product_id?: string | null
          ean?: string
          cost?: number
          moq?: number | null
          lead_time?: string | null
          payment_terms?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      import_history: {
        Row: {
          id: string
          type: string
          file_name: string
          status: string
          total_records: number
          successful_records: number
          failed_records: number
          error_message: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          type: string
          file_name: string
          status: string
          total_records: number
          successful_records: number
          failed_records: number
          error_message?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          type?: string
          file_name?: string
          status?: string
          total_records?: number
          successful_records?: number
          failed_records?: number
          error_message?: string | null
          created_at?: string
          created_by?: string | null
        }
      }
      custom_attributes: {
        Row: {
          id: string
          name: string
          type: string
          default_value: any
          required: boolean
          for_type: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: string
          default_value?: any
          required?: boolean
          for_type: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          default_value?: any
          required?: boolean
          for_type?: string
          created_at?: string
          updated_at?: string
        }
      }
      custom_attribute_values: {
        Row: {
          id: string
          attribute_id: string
          entity_id: string
          value: any
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          attribute_id: string
          entity_id: string
          value?: any
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          attribute_id?: string
          entity_id?: string
          value?: any
          created_at?: string
          updated_at?: string
        }
      }
      settings: {
        Row: {
          id: string
          key: string
          value: Json
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          key: string
          value: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          key?: string
          value?: Json
          created_at?: string | null
          updated_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}