// Generated from the Supabase project "MARGEN DATA". Regenerate after every schema change
// (Supabase CLI: `supabase gen types typescript --project-id bndicnojuvuknmmpgjgw`); don't edit by hand.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      athletes: {
        Row: {
          country: string | null;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          state: string | null;
        };
        Insert: {
          country?: string | null;
          created_at?: string;
          first_name: string;
          id?: string;
          last_name: string;
          state?: string | null;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          state?: string | null;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          postal_code: string | null;
          state: string | null;
        };
        Insert: {
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          first_name: string;
          id?: string;
          last_name: string;
          postal_code?: string | null;
          state?: string | null;
        };
        Update: {
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          postal_code?: string | null;
          state?: string | null;
        };
        Relationships: [];
      };
      factories: {
        Row: {
          contact_name: string;
          country: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
        };
        Insert: {
          contact_name: string;
          country?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          contact_name?: string;
          country?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      items: {
        Row: {
          created_at: string;
          id: string;
          item_code: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          item_code: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_code?: string;
          name?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          country: string | null;
          created_at: string;
          email: string | null;
          first_name: string;
          id: string;
          last_name: string;
          notes: string | null;
          organization_name: string | null;
          phone: string | null;
          source: string | null;
          state: string | null;
          status: string;
        };
        Insert: {
          country?: string | null;
          created_at?: string;
          email?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
          notes?: string | null;
          organization_name?: string | null;
          phone?: string | null;
          source?: string | null;
          state?: string | null;
          status?: string;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
          notes?: string | null;
          organization_name?: string | null;
          phone?: string | null;
          source?: string | null;
          state?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      note_dismissals: {
        Row: {
          dismissed_at: string;
          note_id: string;
          user_id: string;
        };
        Insert: {
          dismissed_at?: string;
          note_id: string;
          user_id?: string;
        };
        Update: {
          dismissed_at?: string;
          note_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "note_dismissals_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_dismissals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          athlete_id: string | null;
          body: string;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          factory_id: string | null;
          id: string;
          organization_id: string | null;
        };
        Insert: {
          athlete_id?: string | null;
          body: string;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          factory_id?: string | null;
          id?: string;
          organization_id?: string | null;
        };
        Update: {
          athlete_id?: string | null;
          body?: string;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          factory_id?: string | null;
          id?: string;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notes_athlete_id_fkey";
            columns: ["athlete_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_factory_id_fkey";
            columns: ["factory_id"];
            isOneToOne: false;
            referencedRelation: "factories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_events: {
        Row: {
          action: string;
          changed_at: string;
          changed_by: string | null;
          changes: Json;
          id: string;
          margen_order_id: string;
          order_id: string;
        };
        Insert: {
          action: string;
          changed_at?: string;
          changed_by?: string | null;
          changes?: Json;
          id?: string;
          margen_order_id: string;
          order_id: string;
        };
        Update: {
          action?: string;
          changed_at?: string;
          changed_by?: string | null;
          changes?: Json;
          id?: string;
          margen_order_id?: string;
          order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_events_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          item_id: string;
          order_id: string;
          quantity: number;
          size: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          item_id: string;
          order_id: string;
          quantity: number;
          size: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_id?: string;
          order_id?: string;
          quantity?: number;
          size?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
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
          actual_ship_date: string | null;
          created_at: string;
          estimated_ship_date: string | null;
          factory_id: string | null;
          factory_order_id: string | null;
          id: string;
          margen_order_id: string;
          order_status: string;
          organization_id: string | null;
          production_status: string | null;
          shipping_method: string | null;
          tracking_number: string | null;
        };
        Insert: {
          actual_ship_date?: string | null;
          created_at?: string;
          estimated_ship_date?: string | null;
          factory_id?: string | null;
          factory_order_id?: string | null;
          id?: string;
          margen_order_id: string;
          order_status?: string;
          organization_id?: string | null;
          production_status?: string | null;
          shipping_method?: string | null;
          tracking_number?: string | null;
        };
        Update: {
          actual_ship_date?: string | null;
          created_at?: string;
          estimated_ship_date?: string | null;
          factory_id?: string | null;
          factory_order_id?: string | null;
          id?: string;
          margen_order_id?: string;
          order_status?: string;
          organization_id?: string | null;
          production_status?: string | null;
          shipping_method?: string | null;
          tracking_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_factory_id_fkey";
            columns: ["factory_id"];
            isOneToOne: false;
            referencedRelation: "factories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_contacts: {
        Row: {
          contact_id: string;
          created_at: string;
          is_default: boolean;
          organization_id: string;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          is_default?: boolean;
          organization_id: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          is_default?: boolean;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_contacts_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_contacts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          country: string | null;
          created_at: string;
          id: string;
          name: string;
          state: string | null;
        };
        Insert: {
          country?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          state?: string | null;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          state?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          factory_id: string | null;
          first_name: string | null;
          id: string;
          role: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          factory_id?: string | null;
          first_name?: string | null;
          id: string;
          role?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          factory_id?: string | null;
          first_name?: string | null;
          id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_factory_id_fkey";
            columns: ["factory_id"];
            isOneToOne: false;
            referencedRelation: "factories";
            referencedColumns: ["id"];
          },
        ];
      };
      scrapbooks: {
        Row: {
          body: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          body?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scrapbooks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      user_last_sign_ins: {
        Args: never;
        Returns: {
          id: string;
          last_sign_in_at: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
