export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          kind: string;
          name: string;
          position: number;
          restaurant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name: string;
          position?: number;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name?: string;
          position?: number;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_items: {
        Row: {
          promo_starts_at: string | null;
          promo_ends_at: string | null;
          model_3d_url: string | null;
          model_usdz_url: string | null;
          portion_description: string | null;
          ar_scale_verified: boolean;
          category_id: string;
          created_at: string;
          description: string | null;
          dietary_tags: string[];
          id: string;
          image_url: string | null;
          is_available: boolean;
          is_promo: boolean;
          name: string;
          original_price: number | null;
          position: number;
          price: number;
          promo_label: string | null;
          restaurant_id: string;
          updated_at: string;
        };
        Insert: {
          promo_starts_at?: string | null;
          promo_ends_at?: string | null;
          model_3d_url?: string | null;
          model_usdz_url?: string | null;
          portion_description?: string | null;
          ar_scale_verified?: boolean;
          category_id: string;
          created_at?: string;
          description?: string | null;
          dietary_tags?: string[];
          id?: string;
          image_url?: string | null;
          is_available?: boolean;
          is_promo?: boolean;
          name: string;
          original_price?: number | null;
          position?: number;
          price?: number;
          promo_label?: string | null;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          promo_starts_at?: string | null;
          promo_ends_at?: string | null;
          model_3d_url?: string | null;
          model_usdz_url?: string | null;
          portion_description?: string | null;
          ar_scale_verified?: boolean;
          category_id?: string;
          created_at?: string;
          description?: string | null;
          dietary_tags?: string[];
          id?: string;
          image_url?: string | null;
          is_available?: boolean;
          is_promo?: boolean;
          name?: string;
          original_price?: number | null;
          position?: number;
          price?: number;
          promo_label?: string | null;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      modifier_groups: {
        Row: {
          created_at: string;
          id: string;
          is_required: boolean;
          max_select: number;
          menu_item_id: string;
          min_select: number;
          name: string;
          position: number;
          restaurant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_required?: boolean;
          max_select?: number;
          menu_item_id: string;
          min_select?: number;
          name: string;
          position?: number;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_required?: boolean;
          max_select?: number;
          menu_item_id?: string;
          min_select?: number;
          name?: string;
          position?: number;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modifier_groups_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
        ];
      };
      modifier_options: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          name: string;
          position: number;
          price_delta: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          name: string;
          position?: number;
          price_delta?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          name?: string;
          position?: number;
          price_delta?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "modifier_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          product_id_snapshot: string | null;
          category_id_snapshot: string | null;
          category_name_snapshot: string | null;
          department_snapshot: string | null;
          created_at: string;
          id: string;
          menu_item_id: string | null;
          modifiers_snapshot: Json;
          name_snapshot: string;
          notes: string | null;
          order_id: string;
          price_snapshot: number;
          quantity: number;
        };
        Insert: {
          product_id_snapshot?: string | null;
          category_id_snapshot?: string | null;
          category_name_snapshot?: string | null;
          department_snapshot?: string | null;
          created_at?: string;
          id?: string;
          menu_item_id?: string | null;
          modifiers_snapshot?: Json;
          name_snapshot: string;
          notes?: string | null;
          order_id: string;
          price_snapshot: number;
          quantity?: number;
        };
        Update: {
          product_id_snapshot?: string | null;
          category_id_snapshot?: string | null;
          category_name_snapshot?: string | null;
          department_snapshot?: string | null;
          created_at?: string;
          id?: string;
          menu_item_id?: string | null;
          modifiers_snapshot?: Json;
          name_snapshot?: string;
          notes?: string | null;
          order_id?: string;
          price_snapshot?: number;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          preparing_at: string | null;
          ready_at: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          tracking_token_hash: string | null;
          archived: boolean;
          kitchen_hidden: boolean;
          cover_charge: number | null;
          created_at: string;
          created_by_name: string | null;
          currency: string;
          customer_name: string | null;
          customer_phone: string | null;
          delivered_at: string | null;
          delivered_by_name: string | null;
          id: string;
          notes: string | null;
          restaurant_id: string;
          service_fee: number;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          table_id: string | null;
          table_label: string | null;
          updated_at: string;
        };
        Insert: {
          preparing_at?: string | null;
          ready_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          tracking_token_hash?: string | null;
          archived?: boolean;
          kitchen_hidden?: boolean;
          cover_charge?: number | null;
          created_at?: string;
          created_by_name?: string | null;
          currency?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivered_at?: string | null;
          delivered_by_name?: string | null;
          id?: string;
          notes?: string | null;
          restaurant_id: string;
          service_fee?: number;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          table_id?: string | null;
          table_label?: string | null;
          updated_at?: string;
        };
        Update: {
          preparing_at?: string | null;
          ready_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          tracking_token_hash?: string | null;
          archived?: boolean;
          kitchen_hidden?: boolean;
          cover_charge?: number | null;
          created_at?: string;
          created_by_name?: string | null;
          currency?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivered_at?: string | null;
          delivered_by_name?: string | null;
          id?: string;
          notes?: string | null;
          restaurant_id?: string;
          service_fee?: number;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          table_id?: string | null;
          table_label?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "venue_tables";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          has_seen_onboarding: boolean;
          id: string;
          plan_type: string;
          trial_ends_at: string;
          updated_at: string;
          welcome_email_sent_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          has_seen_onboarding?: boolean;
          id: string;
          plan_type?: string;
          trial_ends_at?: string;
          updated_at?: string;
          welcome_email_sent_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          has_seen_onboarding?: boolean;
          id?: string;
          plan_type?: string;
          trial_ends_at?: string;
          updated_at?: string;
          welcome_email_sent_at?: string | null;
        };
        Relationships: [];
      };
      restaurants: {
        Row: {
          menu_appearance: Json;
          banner_cta_label: string | null;
          banner_description: string | null;
          banner_enabled: boolean;
          banner_image_url: string | null;
          banner_title: string | null;
          brand_accent_color: string | null;
          brand_button_color: string | null;
          brand_card_color: string | null;
          brand_color: string;
          brand_header_color: string | null;
          brand_text_color: string | null;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          kitchen_open: boolean;
          bar_open: boolean;
          require_table_code: boolean;
          operating_hours: Json | null;
          hours_enabled_at: string;
          logo_url: string | null;
          name: string;
          owner_id: string;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          menu_appearance?: Json;
          banner_cta_label?: string | null;
          banner_description?: string | null;
          banner_enabled?: boolean;
          banner_image_url?: string | null;
          banner_title?: string | null;
          brand_accent_color?: string | null;
          brand_button_color?: string | null;
          brand_card_color?: string | null;
          brand_color?: string;
          brand_header_color?: string | null;
          brand_text_color?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          kitchen_open?: boolean;
          bar_open?: boolean;
          require_table_code?: boolean;
          operating_hours?: Json | null;
          hours_enabled_at?: string;
          logo_url?: string | null;
          name: string;
          owner_id: string;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          menu_appearance?: Json;
          banner_cta_label?: string | null;
          banner_description?: string | null;
          banner_enabled?: boolean;
          banner_image_url?: string | null;
          banner_title?: string | null;
          brand_accent_color?: string | null;
          brand_button_color?: string | null;
          brand_card_color?: string | null;
          brand_color?: string;
          brand_header_color?: string | null;
          brand_text_color?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          kitchen_open?: boolean;
          bar_open?: boolean;
          require_table_code?: boolean;
          operating_hours?: Json | null;
          hours_enabled_at?: string;
          logo_url?: string | null;
          name?: string;
          owner_id?: string;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_members: {
        Row: {
          pin_hash: string | null;
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          pin: string | null;
          restaurant_id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          pin_hash?: string | null;
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          pin?: string | null;
          restaurant_id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          pin_hash?: string | null;
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          pin?: string | null;
          restaurant_id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_members_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          restaurant_id: string;
          staff_id: string;
          token: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          restaurant_id: string;
          staff_id: string;
          token: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          restaurant_id?: string;
          staff_id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_sessions_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_sessions_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_members";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          last_event_created: number;
          plan_type: string | null;
          cancel_at_period_end: boolean | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          environment: string;
          id: string;
          price_id: string | null;
          product_id: string | null;
          status: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          last_event_created?: number;
          plan_type?: string | null;
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          environment?: string;
          id?: string;
          price_id?: string | null;
          product_id?: string | null;
          status?: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          last_event_created?: number;
          plan_type?: string | null;
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          environment?: string;
          id?: string;
          price_id?: string | null;
          product_id?: string | null;
          status?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      venue_tables: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          operational: boolean;
          position: number;
          restaurant_id: string;
          short_code: string;
          active_service_id?: string | null;
          service_started_at?: string | null;
          service_state?: "free" | "active" | "bill_requested";
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          position?: number;
          restaurant_id: string;
          short_code: string;
          active_service_id?: string | null;
          service_started_at?: string | null;
          service_state?: "free" | "active" | "bill_requested";
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          position?: number;
          restaurant_id?: string;
          short_code?: string;
          active_service_id?: string | null;
          service_started_at?: string | null;
          service_state?: "free" | "active" | "bill_requested";
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_tables_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      waiter_calls: {
        Row: {
          is_test: boolean;
          created_at: string;
          customer_name: string | null;
          id: string;
          kind: string;
          message: string | null;
          resolved: boolean;
          resolved_at: string | null;
          restaurant_id: string;
          table_label: string | null;
        };
        Insert: {
          is_test?: boolean;
          created_at?: string;
          customer_name?: string | null;
          id?: string;
          kind?: string;
          message?: string | null;
          resolved?: boolean;
          resolved_at?: string | null;
          restaurant_id: string;
          table_label?: string | null;
        };
        Update: {
          is_test?: boolean;
          created_at?: string;
          customer_name?: string | null;
          id?: string;
          kind?: string;
          message?: string | null;
          resolved?: boolean;
          resolved_at?: string | null;
          restaurant_id?: string;
          table_label?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      platform_growth_overview: { Args: { p_days?: number }; Returns: Json };
      is_platform_owner: { Args: Record<string, never>; Returns: boolean };
      is_platform_admin: { Args: Record<string, never>; Returns: boolean };
      select_operational_tables: {
        Args: { p_restaurant_id: string; p_table_ids: string[] };
        Returns: undefined;
      };
      restaurant_table_is_operational: {
        Args: { p_restaurant_id: string; p_table_label: string };
        Returns: boolean;
      };
      get_my_entitlement: { Args: Record<string, never>; Returns: Json };
      platform_list_restaurants: {
        Args: { p_search?: string; p_status?: string; p_page?: number };
        Returns: Json;
      };
      platform_restaurant_detail: { Args: { p_restaurant_id: string }; Returns: Json };
      platform_change_entitlement: {
        Args: {
          p_restaurant_id: string;
          p_action: string;
          p_plan: string | null;
          p_days: number | null;
          p_reason: string;
          p_expected_version: number;
        };
        Returns: Json;
      };
      get_service_status: { Args: { p_restaurant_id: string }; Returns: Json };
      submit_internal_order: {
        Args: {
          p_table_id: string;
          p_request_token: string;
          p_items: Json;
          p_staff_token?: string | null;
          p_created_by?: string | null;
        };
        Returns: string;
      };
      recover_public_order: {
        Args: { p_restaurant_id: string; p_tracking_token: string };
        Returns: Json;
      };
      recover_internal_order: {
        Args: { p_table_id: string; p_request_token: string; p_staff_token?: string | null };
        Returns: string | null;
      };
      start_table_service: {
        Args: { p_table_id: string; p_staff_token?: string | null };
        Returns: string;
      };
      get_table_events: {
        Args: { p_table_id: string; p_staff_token?: string | null };
        Returns: Json;
      };
      transition_order: {
        Args: {
          p_order_id: string;
          p_expected_status: string;
          p_next_status: string;
          p_staff_token?: string | null;
          p_delivered_by?: string | null;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      hide_completed_orders: { Args: { p_restaurant_id: string }; Returns: number };
      submit_public_order: {
        Args: {
          p_restaurant_id: string;
          p_table_label: string | null;
          p_customer_name: string | null;
          p_customer_phone: string | null;
          p_currency: string;
          p_items: Json;
          p_tracking_token: string;
          p_table_code: string | null;
        };
        Returns: Json;
      };
      submit_public_call: {
        Args: {
          p_restaurant_id: string;
          p_table_label: string;
          p_customer_name: string | null;
          p_message: string | null;
          p_kind: string;
          p_table_code: string | null;
        };
        Returns: Json;
      };
      release_table: {
        Args: {
          p_restaurant_id: string | null;
          p_table_label: string;
          p_staff_token?: string | null;
          p_service_fee?: number;
          p_cover_charge?: number;
        };
        Returns: string[];
      };
      table_order_code: {
        Args: { p_table_id: string; p_staff_token?: string | null; p_rotate?: boolean };
        Returns: Json;
      };
      public_waiter_call: {
        Args: {
          p_restaurant_id: string;
          p_table_label: string;
          p_customer_name: string | null;
          p_message: string | null;
          p_kind: string;
          p_table_code: string | null;
        };
        Returns: undefined;
      };
      sync_closing_notifications: { Args: Record<string, never>; Returns: undefined };
      list_closing_notifications: { Args: Record<string, never>; Returns: Json };
      closing_summary: { Args: { p_notification_id: string }; Returns: Json };
      resolve_restaurant_slug: { Args: { p_slug: string }; Returns: string | null };
      manage_menu_items: {
        Args: { p_restaurant_id: string; p_action: string; p_rows: Json; p_patch?: Json };
        Returns: number;
      };
      menu_live_prices: { Args: { p_restaurant_id: string }; Returns: Json };
      get_order_status: { Args: { p_order_id: string; p_token: string }; Returns: string | null };
      owner_place_order: {
        Args: {
          p_restaurant_id: string;
          p_table_id: string;
          p_items: Json;
          p_created_by_name: string;
        };
        Returns: string;
      };
      staff_place_order: {
        Args: { p_token: string; p_table_id: string; p_items: Json };
        Returns: string;
      };
      apply_billing_event: {
        Args: {
          p_event_id: string;
          p_created: number;
          p_environment: string;
          p_subscription: Json;
        };
        Returns: undefined;
      };

      get_restaurant_plan: { Args: { p_slug: string }; Returns: string };
      place_order: {
        Args: {
          p_tracking_token: string;
          p_table_code?: string;
          p_currency: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_items: Json;
          p_restaurant_id: string;
          p_table_label: string | null;
        };
        Returns: string;
      };
      staff_archive_orders: {
        Args: { p_order_ids: string[]; p_token: string };
        Returns: undefined;
      };
      staff_list_calls: { Args: { p_token: string }; Returns: Json };
      staff_list_members: { Args: { p_token: string }; Returns: Json };
      staff_list_orders: { Args: { p_token: string }; Returns: Json };
      staff_list_tables: { Args: { p_token: string }; Returns: Json };
      staff_login: {
        Args: { p_pin: string; p_slug: string };
        Returns: {
          name: string;
          restaurant_name: string;
          restaurant_slug: string;
          role: string;
          staff_id: string;
          token: string;
        }[];
      };
      staff_logout: { Args: { p_token: string }; Returns: undefined };
      staff_resolve_call: {
        Args: { p_call_id: string; p_token: string };
        Returns: undefined;
      };
      staff_session_info: {
        Args: { p_token: string };
        Returns: {
          name: string;
          restaurant_id: string;
          role: string;
          staff_id: string;
        }[];
      };
      staff_update_order_status: {
        Args: {
          p_order_id: string;
          p_staff_name?: string | null;
          p_status: string;
          p_token: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      order_status: "pending" | "accepted" | "preparing" | "ready" | "served" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      order_status: ["pending", "accepted", "preparing", "ready", "served", "cancelled"],
    },
  },
} as const;
