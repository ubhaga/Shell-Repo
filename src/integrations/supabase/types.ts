export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      bank_statement_lines: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          matched_terminal: string
          month: string
          raw_line: string
          transaction_date: string
          upload_date: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          matched_terminal?: string
          month: string
          raw_line?: string
          transaction_date?: string
          upload_date?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          matched_terminal?: string
          month?: string
          raw_line?: string
          transaction_date?: string
          upload_date?: string
        }
        Relationships: []
      }
      daily_cashups: {
        Row: {
          cashier_name: string
          created_at: string
          date: string
          entered_by: string
          id: string
          locked: boolean
          month: string
          notes: string
          opt: Json
          opt_shift_number: number
          shop: Json
          shop_shift_number: number
          updated_at: string
        }
        Insert: {
          cashier_name?: string
          created_at?: string
          date: string
          entered_by?: string
          id?: string
          locked?: boolean
          month: string
          notes?: string
          opt?: Json
          opt_shift_number?: number
          shop?: Json
          shop_shift_number?: number
          updated_at?: string
        }
        Update: {
          cashier_name?: string
          created_at?: string
          date?: string
          entered_by?: string
          id?: string
          locked?: boolean
          month?: string
          notes?: string
          opt?: Json
          opt_shift_number?: number
          shop?: Json
          shop_shift_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      manager_daily_entries: {
        Row: {
          bank_charges: number
          banking: number
          branch_day_end_total: number
          branch_day_end_vat: number
          cash_connect_opening_balance: number
          cash_deposited_cash_connect: number
          cash_deposited_easypay: number
          cash_reconc_notes: string
          cashup_id: string
          cc_bag_closure_cash_connect: number
          cc_bag_closure_coins: number
          cc_bag_closure_easypay: number
          coins_opening_balance: number
          created_at: string
          daily_coins: number
          date: string
          easypay_opening_balance: number
          eft_invoices: Json
          entered_by: string
          explanations: string
          id: string
          invoice_notes: string
          locked: boolean
          payout_invoices: Json
          transfer_from_coins: number
          updated_at: string
        }
        Insert: {
          bank_charges?: number
          banking?: number
          branch_day_end_total?: number
          branch_day_end_vat?: number
          cash_connect_opening_balance?: number
          cash_deposited_cash_connect?: number
          cash_deposited_easypay?: number
          cash_reconc_notes?: string
          cashup_id?: string
          cc_bag_closure_cash_connect?: number
          cc_bag_closure_coins?: number
          cc_bag_closure_easypay?: number
          coins_opening_balance?: number
          created_at?: string
          daily_coins?: number
          date: string
          easypay_opening_balance?: number
          eft_invoices?: Json
          entered_by?: string
          explanations?: string
          id?: string
          invoice_notes?: string
          locked?: boolean
          payout_invoices?: Json
          transfer_from_coins?: number
          updated_at?: string
        }
        Update: {
          bank_charges?: number
          banking?: number
          branch_day_end_total?: number
          branch_day_end_vat?: number
          cash_connect_opening_balance?: number
          cash_deposited_cash_connect?: number
          cash_deposited_easypay?: number
          cash_reconc_notes?: string
          cashup_id?: string
          cc_bag_closure_cash_connect?: number
          cc_bag_closure_coins?: number
          cc_bag_closure_easypay?: number
          coins_opening_balance?: number
          created_at?: string
          daily_coins?: number
          date?: string
          easypay_opening_balance?: number
          eft_invoices?: Json
          entered_by?: string
          explanations?: string
          id?: string
          invoice_notes?: string
          locked?: boolean
          payout_invoices?: Json
          transfer_from_coins?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_data: {
        Row: {
          data: Json
          id: string
          key: string
          updated_at: string
        }
        Insert: {
          data?: Json
          id?: string
          key: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      monthly_branch_figures: {
        Row: {
          branch_net_sales: number
          branch_total_invoices_capital: number
          branch_total_invoices_vat: number
          branch_total_payouts: number
          branch_total_receipts: number
          created_at: string
          entered_by: string
          id: string
          month: string
          notes: string
          updated_at: string
        }
        Insert: {
          branch_net_sales?: number
          branch_total_invoices_capital?: number
          branch_total_invoices_vat?: number
          branch_total_payouts?: number
          branch_total_receipts?: number
          created_at?: string
          entered_by?: string
          id?: string
          month: string
          notes?: string
          updated_at?: string
        }
        Update: {
          branch_net_sales?: number
          branch_total_invoices_capital?: number
          branch_total_invoices_vat?: number
          branch_total_payouts?: number
          branch_total_receipts?: number
          created_at?: string
          entered_by?: string
          id?: string
          month?: string
          notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      speedpoint_manual_matches: {
        Row: {
          bank_amount: number
          bank_batch: string
          bank_date: string
          bank_description: string
          bank_line_idx: number
          bank_terminal: string
          cashup_date: string
          created_at: string
          id: string
          month: string
          terminal: string
        }
        Insert: {
          bank_amount?: number
          bank_batch?: string
          bank_date?: string
          bank_description?: string
          bank_line_idx: number
          bank_terminal?: string
          cashup_date: string
          created_at?: string
          id?: string
          month: string
          terminal: string
        }
        Update: {
          bank_amount?: number
          bank_batch?: string
          bank_date?: string
          bank_description?: string
          bank_line_idx?: number
          bank_terminal?: string
          cashup_date?: string
          created_at?: string
          id?: string
          month?: string
          terminal?: string
        }
        Relationships: []
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
