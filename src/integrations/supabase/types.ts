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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accidents: {
        Row: {
          company_name: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          description: string | null
          driver_name: string | null
          estimated_cost: number | null
          has_insurance: boolean | null
          id: string
          images: string | null
          location: string | null
          notes: string | null
          status: string | null
          third_party: boolean | null
          vehicle_plate: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          driver_name?: string | null
          estimated_cost?: number | null
          has_insurance?: boolean | null
          id?: string
          images?: string | null
          location?: string | null
          notes?: string | null
          status?: string | null
          third_party?: boolean | null
          vehicle_plate?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          driver_name?: string | null
          estimated_cost?: number | null
          has_insurance?: boolean | null
          id?: string
          images?: string | null
          location?: string | null
          notes?: string | null
          status?: string | null
          third_party?: boolean | null
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          action_type: string
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          company_name: string
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string
          id: string
          last_reminder_at: string | null
          notification_sent: boolean | null
          rejection_reason: string | null
          reminder_count: number | null
          requested_by: string | null
          requested_by_name: string | null
          status: string
          updated_at: string
          vehicle_plate: string | null
        }
        Insert: {
          action_type?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          company_name?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          last_reminder_at?: string | null
          notification_sent?: boolean | null
          rejection_reason?: string | null
          reminder_count?: number | null
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string
          updated_at?: string
          vehicle_plate?: string | null
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          company_name?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          last_reminder_at?: string | null
          notification_sent?: boolean | null
          rejection_reason?: string | null
          reminder_count?: number | null
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string
          updated_at?: string
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      call_logs: {
        Row: {
          company_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          direction: string
          duration_sec: number | null
          flow_type: string
          id: string
          outcome: string | null
          phone: string | null
          recording_url: string | null
          status: string
          transcript: string | null
          twilio_call_sid: string | null
          updated_at: string
          vehicle_id: string | null
          vehicle_plate: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          direction?: string
          duration_sec?: number | null
          flow_type?: string
          id?: string
          outcome?: string | null
          phone?: string | null
          recording_url?: string | null
          status?: string
          transcript?: string | null
          twilio_call_sid?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          direction?: string
          duration_sec?: number | null
          flow_type?: string
          id?: string
          outcome?: string | null
          phone?: string | null
          recording_url?: string | null
          status?: string
          transcript?: string | null
          twilio_call_sid?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      campaign_customers: {
        Row: {
          call_status: string | null
          campaign_id: string
          customer_id: string
        }
        Insert: {
          call_status?: string | null
          campaign_id: string
          customer_id: string
        }
        Update: {
          call_status?: string | null
          campaign_id?: string
          customer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_customers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      companions: {
        Row: {
          company_name: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          id_number: string | null
          notes: string | null
          phone: string | null
          status: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          notes?: string | null
          phone?: string | null
          status?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          notes?: string | null
          phone?: string | null
          status?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          alert_days_before: number | null
          company_name: string
          created_at: string | null
          hidden_buttons: string[]
          hide_driver_credentials: boolean
          id: string
          max_vehicles_without_assignment: number
          reminder_1_day: boolean | null
          reminder_30_days: boolean | null
          reminder_7_days: boolean | null
          require_driver_assignment: boolean
          require_insurance_docs: boolean
          require_no_claims: boolean
          updated_at: string | null
          vehicle_approval_required: boolean | null
          whatsapp_button_color: string | null
          whatsapp_button_text: string | null
          whatsapp_enabled: boolean | null
          whatsapp_phone: string | null
        }
        Insert: {
          alert_days_before?: number | null
          company_name: string
          created_at?: string | null
          hidden_buttons?: string[]
          hide_driver_credentials?: boolean
          id?: string
          max_vehicles_without_assignment?: number
          reminder_1_day?: boolean | null
          reminder_30_days?: boolean | null
          reminder_7_days?: boolean | null
          require_driver_assignment?: boolean
          require_insurance_docs?: boolean
          require_no_claims?: boolean
          updated_at?: string | null
          vehicle_approval_required?: boolean | null
          whatsapp_button_color?: string | null
          whatsapp_button_text?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_phone?: string | null
        }
        Update: {
          alert_days_before?: number | null
          company_name?: string
          created_at?: string | null
          hidden_buttons?: string[]
          hide_driver_credentials?: boolean
          id?: string
          max_vehicles_without_assignment?: number
          reminder_1_day?: boolean | null
          reminder_30_days?: boolean | null
          reminder_7_days?: boolean | null
          require_driver_assignment?: boolean
          require_insurance_docs?: boolean
          require_no_claims?: boolean
          updated_at?: string | null
          vehicle_approval_required?: boolean | null
          whatsapp_button_color?: string | null
          whatsapp_button_text?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_phone?: string | null
        }
        Relationships: []
      }
      company_subscriptions: {
        Row: {
          billing_day: number | null
          company_name: string
          created_at: string | null
          id: string
          last_payment_date: string | null
          monthly_price: number | null
          next_payment_date: string | null
          notes: string | null
          payment_method: string | null
          plan_name: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          billing_day?: number | null
          company_name: string
          created_at?: string | null
          id?: string
          last_payment_date?: string | null
          monthly_price?: number | null
          next_payment_date?: string | null
          notes?: string | null
          payment_method?: string | null
          plan_name?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_day?: number | null
          company_name?: string
          created_at?: string | null
          id?: string
          last_payment_date?: string | null
          monthly_price?: number | null
          next_payment_date?: string | null
          notes?: string | null
          payment_method?: string | null
          plan_name?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      custom_alerts: {
        Row: {
          alert_date: string
          alert_type: string
          company_name: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          next_trigger_at: string | null
          recurrence: string | null
          recurrence_interval: number | null
          title: string
          user_id: string
        }
        Insert: {
          alert_date: string
          alert_type?: string
          company_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          next_trigger_at?: string | null
          recurrence?: string | null
          recurrence_interval?: number | null
          title: string
          user_id: string
        }
        Update: {
          alert_date?: string
          alert_type?: string
          company_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          next_trigger_at?: string | null
          recurrence?: string | null
          recurrence_interval?: number | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_agreements: {
        Row: {
          amount_before_vat: number | null
          amount_with_vat: number | null
          company_name: string | null
          created_at: string | null
          customer_id: string
          description: string | null
          id: string
          serial_number: string | null
        }
        Insert: {
          amount_before_vat?: number | null
          amount_with_vat?: number | null
          company_name?: string | null
          created_at?: string | null
          customer_id: string
          description?: string | null
          id?: string
          serial_number?: string | null
        }
        Update: {
          amount_before_vat?: number | null
          amount_with_vat?: number | null
          company_name?: string | null
          created_at?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          serial_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_agreements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_deals: {
        Row: {
          amount: number | null
          company_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          customer_name: string | null
          deal_number: string | null
          description: string | null
          id: string
          open_date: string | null
          status: string
          target_date: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          amount?: number | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          customer_name?: string | null
          deal_number?: string | null
          description?: string | null
          id?: string
          open_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          amount?: number | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          customer_name?: string | null
          deal_number?: string | null
          description?: string | null
          id?: string
          open_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_deals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          agreement_amount_before_vat: number | null
          agreement_amount_with_vat: number | null
          agreement_description: string | null
          agreement_serial_number: string | null
          business_id: string | null
          company_name: string | null
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          customer_number: string | null
          customer_type: string | null
          email: string | null
          fax: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          agreement_amount_before_vat?: number | null
          agreement_amount_with_vat?: number | null
          agreement_description?: string | null
          agreement_serial_number?: string | null
          business_id?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_number?: string | null
          customer_type?: string | null
          email?: string | null
          fax?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          agreement_amount_before_vat?: number | null
          agreement_amount_with_vat?: number | null
          agreement_description?: string | null
          agreement_serial_number?: string | null
          business_id?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_number?: string | null
          customer_type?: string | null
          email?: string | null
          fax?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          company_name: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_name: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      dev_tasks: {
        Row: {
          clarification: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          edited_at: string | null
          id: string
          priority: string
          size: string
          status: string
          summary: string
          task_number: number
        }
        Insert: {
          clarification?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          id?: string
          priority?: string
          size?: string
          status?: string
          summary: string
          task_number?: number
        }
        Update: {
          clarification?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          id?: string
          priority?: string
          size?: string
          status?: string
          summary?: string
          task_number?: number
        }
        Relationships: []
      }
      document_metadata: {
        Row: {
          category: string
          company_name: string | null
          created_at: string | null
          driver_name: string | null
          file_path: string
          id: string
          manufacturer: string | null
          model: string | null
          original_name: string | null
          uploaded_by: string | null
          vehicle_plate: string | null
        }
        Insert: {
          category?: string
          company_name?: string | null
          created_at?: string | null
          driver_name?: string | null
          file_path: string
          id?: string
          manufacturer?: string | null
          model?: string | null
          original_name?: string | null
          uploaded_by?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          category?: string
          company_name?: string | null
          created_at?: string | null
          driver_name?: string | null
          file_path?: string
          id?: string
          manufacturer?: string | null
          model?: string | null
          original_name?: string | null
          uploaded_by?: string | null
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      driver_declarations: {
        Row: {
          company_name: string | null
          created_at: string
          created_by: string | null
          declaration_text: string
          driver_id: string
          driver_name: string
          expires_at: string | null
          id: string
          id_number: string | null
          license_number: string | null
          pdf_url: string | null
          sent_at: string | null
          sent_via: string | null
          signature_url: string | null
          signed_at: string | null
          status: string
          token: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          declaration_text: string
          driver_id: string
          driver_name?: string
          expires_at?: string | null
          id?: string
          id_number?: string | null
          license_number?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          sent_via?: string | null
          signature_url?: string | null
          signed_at?: string | null
          status?: string
          token?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          declaration_text?: string
          driver_id?: string
          driver_name?: string
          expires_at?: string | null
          id?: string
          id_number?: string | null
          license_number?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          sent_via?: string | null
          signature_url?: string | null
          signed_at?: string | null
          status?: string
          token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      driver_health_declarations: {
        Row: {
          company_name: string | null
          created_at: string | null
          created_by: string | null
          declaration_date: string | null
          driver_id: string | null
          driver_name: string | null
          id: string
          id_number: string | null
          license_image_url: string | null
          license_number: string | null
          signature_url: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          declaration_date?: string | null
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          id_number?: string | null
          license_image_url?: string | null
          license_number?: string | null
          signature_url?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          declaration_date?: string | null
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          id_number?: string | null
          license_image_url?: string | null
          license_number?: string | null
          signature_url?: string | null
        }
        Relationships: []
      }
      driver_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          city: string | null
          company_name: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          exam_expiry: string | null
          full_name: string
          id: string
          id_number: string | null
          last_exam_date: string | null
          license_expiry: string | null
          license_image_url: string | null
          license_number: string | null
          license_types: string[] | null
          notes: string | null
          phone: string | null
          status: string | null
          street: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          exam_expiry?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          last_exam_date?: string | null
          license_expiry?: string | null
          license_image_url?: string | null
          license_number?: string | null
          license_types?: string[] | null
          notes?: string | null
          phone?: string | null
          status?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          exam_expiry?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          last_exam_date?: string | null
          license_expiry?: string | null
          license_image_url?: string | null
          license_number?: string | null
          license_types?: string[] | null
          notes?: string | null
          phone?: string | null
          status?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      driving_exams: {
        Row: {
          answers: Json | null
          category_breakdown: Json | null
          company_name: string | null
          completed_at: string | null
          correct_count: number | null
          created_at: string
          created_by: string | null
          driver_id: string
          driver_name: string
          driver_phone: string | null
          exam_type: string
          exam_validity_months: number | null
          expires_at: string | null
          id: string
          manager_note: string | null
          manager_signature_url: string | null
          passed: boolean | null
          passing_score: number
          questions: Json
          score: number | null
          sent_at: string | null
          sent_to: string | null
          sent_via: string | null
          signature_url: string | null
          started_at: string | null
          status: string
          token: string | null
          total_questions: number | null
          updated_at: string
          vehicle_plate: string | null
        }
        Insert: {
          answers?: Json | null
          category_breakdown?: Json | null
          company_name?: string | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string
          created_by?: string | null
          driver_id: string
          driver_name?: string
          driver_phone?: string | null
          exam_type?: string
          exam_validity_months?: number | null
          expires_at?: string | null
          id?: string
          manager_note?: string | null
          manager_signature_url?: string | null
          passed?: boolean | null
          passing_score?: number
          questions?: Json
          score?: number | null
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          signature_url?: string | null
          started_at?: string | null
          status?: string
          token?: string | null
          total_questions?: number | null
          updated_at?: string
          vehicle_plate?: string | null
        }
        Update: {
          answers?: Json | null
          category_breakdown?: Json | null
          company_name?: string | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string
          created_by?: string | null
          driver_id?: string
          driver_name?: string
          driver_phone?: string | null
          exam_type?: string
          exam_validity_months?: number | null
          expires_at?: string | null
          id?: string
          manager_note?: string | null
          manager_signature_url?: string | null
          passed?: boolean | null
          passing_score?: number
          questions?: Json
          score?: number | null
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          signature_url?: string | null
          started_at?: string | null
          status?: string
          token?: string | null
          total_questions?: number | null
          updated_at?: string
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      emergency_categories: {
        Row: {
          auto_message_template: string
          category_icon: string
          category_key: string
          category_label: string
          company_name: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          target_type: string
          target_value: string
          updated_at: string
        }
        Insert: {
          auto_message_template?: string
          category_icon?: string
          category_key?: string
          category_label?: string
          company_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          target_type?: string
          target_value?: string
          updated_at?: string
        }
        Update: {
          auto_message_template?: string
          category_icon?: string
          category_key?: string
          category_label?: string
          company_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          target_type?: string
          target_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      emergency_logs: {
        Row: {
          category_key: string
          category_label: string
          company_name: string
          created_at: string
          id: string
          location: string | null
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_type: string
          target_value: string
          user_id: string
          user_name: string
          vehicle_plate: string | null
        }
        Insert: {
          category_key?: string
          category_label?: string
          company_name?: string
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_type?: string
          target_value?: string
          user_id: string
          user_name?: string
          vehicle_plate?: string | null
        }
        Update: {
          category_key?: string
          category_label?: string
          company_name?: string
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_type?: string
          target_value?: string
          user_id?: string
          user_name?: string
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number | null
          category: string | null
          company_name: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          driver_name: string | null
          id: string
          image_url: string | null
          invoice_date: string | null
          invoice_number: string | null
          notes: string | null
          odometer: number | null
          vehicle_plate: string | null
          vendor: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          driver_name?: string | null
          id?: string
          image_url?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          notes?: string | null
          odometer?: number | null
          vehicle_plate?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          driver_name?: string | null
          id?: string
          image_url?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          notes?: string | null
          odometer?: number | null
          vehicle_plate?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      fault_messages: {
        Row: {
          company_name: string | null
          created_at: string
          fault_id: string
          id: string
          message: string
          user_id: string
          user_name: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          fault_id: string
          id?: string
          message?: string
          user_id: string
          user_name?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          fault_id?: string
          id?: string
          message?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fault_messages_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "faults"
            referencedColumns: ["id"]
          },
        ]
      }
      fault_referrals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          company_name: string | null
          completed: boolean | null
          completed_at: string | null
          created_at: string
          fault_id: string | null
          id: string
          notes: string | null
          provider_name: string
          provider_phone: string | null
          provider_type: string | null
          requested_by: string | null
          requested_by_name: string | null
          service_order_id: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          company_name?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          fault_id?: string | null
          id?: string
          notes?: string | null
          provider_name?: string
          provider_phone?: string | null
          provider_type?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          service_order_id?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          company_name?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          fault_id?: string | null
          id?: string
          notes?: string | null
          provider_name?: string
          provider_phone?: string | null
          provider_type?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          service_order_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fault_referrals_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "faults"
            referencedColumns: ["id"]
          },
        ]
      }
      fault_status_log: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          company_name: string | null
          created_at: string
          fault_id: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          company_name?: string | null
          created_at?: string
          fault_id: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          company_name?: string | null
          created_at?: string
          fault_id?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fault_status_log_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "faults"
            referencedColumns: ["id"]
          },
        ]
      }
      faults: {
        Row: {
          company_name: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          description: string | null
          driver_name: string | null
          fault_type: string | null
          id: string
          images: string | null
          notes: string | null
          serial_id: string | null
          status: string | null
          towing_approved: boolean | null
          towing_approved_at: string | null
          towing_approved_by: string | null
          towing_completed: boolean | null
          towing_completed_at: string | null
          towing_required: boolean | null
          urgency: string | null
          vehicle_id: string | null
          vehicle_plate: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          driver_name?: string | null
          fault_type?: string | null
          id?: string
          images?: string | null
          notes?: string | null
          serial_id?: string | null
          status?: string | null
          towing_approved?: boolean | null
          towing_approved_at?: string | null
          towing_approved_by?: string | null
          towing_completed?: boolean | null
          towing_completed_at?: string | null
          towing_required?: boolean | null
          urgency?: string | null
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          driver_name?: string | null
          fault_type?: string | null
          id?: string
          images?: string | null
          notes?: string | null
          serial_id?: string | null
          status?: string | null
          towing_approved?: boolean | null
          towing_approved_at?: string | null
          towing_approved_by?: string | null
          towing_completed?: boolean | null
          towing_completed_at?: string | null
          towing_required?: boolean | null
          urgency?: string | null
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      info_gap_history: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
          tracking_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
          tracking_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
          tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "info_gap_history_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "info_gap_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      info_gap_tracking: {
        Row: {
          company_name: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          gap_key: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          gap_key: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          gap_key?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      inspection_items: {
        Row: {
          created_at: string | null
          id: string
          inspection_id: string
          item_name: string
          notes: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inspection_id: string
          item_name?: string
          notes?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inspection_id?: string
          item_name?: string
          notes?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "vehicle_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          company_name: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          recipient_id: string
          sender_id: string
          sender_name: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          recipient_id: string
          sender_id: string
          sender_name?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          recipient_id?: string
          sender_id?: string
          sender_name?: string
        }
        Relationships: []
      }
      pickup_appointments: {
        Row: {
          call_log_id: string | null
          company_name: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          location: string | null
          notes: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          source: string
          status: string
          updated_at: string
          vehicle_id: string | null
          vehicle_plate: string | null
        }
        Insert: {
          call_log_id?: string | null
          company_name?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          source?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          call_log_id?: string | null
          company_name?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          source?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      practical_driving_exams: {
        Row: {
          checklist: Json
          company_name: string | null
          created_at: string
          created_by: string | null
          driver_id: string
          driver_id_number: string | null
          driver_name: string
          driver_signature_url: string | null
          exam_date: string
          examiner_name: string
          examiner_signature_url: string | null
          id: string
          notes: string | null
          passed: boolean | null
          status: string
          updated_at: string
          vehicle_plate: string | null
        }
        Insert: {
          checklist?: Json
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          driver_id: string
          driver_id_number?: string | null
          driver_name?: string
          driver_signature_url?: string | null
          exam_date?: string
          examiner_name?: string
          examiner_signature_url?: string | null
          id?: string
          notes?: string | null
          passed?: boolean | null
          status?: string
          updated_at?: string
          vehicle_plate?: string | null
        }
        Update: {
          checklist?: Json
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string
          driver_id_number?: string | null
          driver_name?: string
          driver_signature_url?: string | null
          exam_date?: string
          examiner_name?: string
          examiner_signature_url?: string | null
          id?: string
          notes?: string | null
          passed?: boolean | null
          status?: string
          updated_at?: string
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
          user_number: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          user_number?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          user_number?: string | null
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          start_date: string | null
          target_companies: string[] | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          start_date?: string | null
          target_companies?: string[] | null
          title?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          start_date?: string | null
          target_companies?: string[] | null
          title?: string
        }
        Relationships: []
      }
      route_options: {
        Row: {
          code: string
          company_name: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string
        }
        Insert: {
          code?: string
          company_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          label?: string
        }
        Update: {
          code?: string
          company_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          amount: number | null
          companion: string | null
          company_name: string | null
          created_at: string | null
          created_by: string | null
          customer_name: string | null
          days_of_week: string[] | null
          department: string | null
          destination: string | null
          distance_km: number | null
          driver_name: string | null
          end_time: string | null
          execution_date: string | null
          id: string
          name: string
          notes: string | null
          origin: string | null
          route_group: string | null
          route_number: string | null
          route_vehicle_type: string | null
          route_vehicle_type_custom: string | null
          service_type: string | null
          start_time: string | null
          status: string | null
          stops: string[] | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
          vehicle_plate: string | null
          vehicle_type_pricing: Json | null
        }
        Insert: {
          amount?: number | null
          companion?: string | null
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          days_of_week?: string[] | null
          department?: string | null
          destination?: string | null
          distance_km?: number | null
          driver_name?: string | null
          end_time?: string | null
          execution_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          origin?: string | null
          route_group?: string | null
          route_number?: string | null
          route_vehicle_type?: string | null
          route_vehicle_type_custom?: string | null
          service_type?: string | null
          start_time?: string | null
          status?: string | null
          stops?: string[] | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_plate?: string | null
          vehicle_type_pricing?: Json | null
        }
        Update: {
          amount?: number | null
          companion?: string | null
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          days_of_week?: string[] | null
          department?: string | null
          destination?: string | null
          distance_km?: number | null
          driver_name?: string | null
          end_time?: string | null
          execution_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          origin?: string | null
          route_group?: string | null
          route_number?: string | null
          route_vehicle_type?: string | null
          route_vehicle_type_custom?: string | null
          service_type?: string | null
          start_time?: string | null
          status?: string | null
          stops?: string[] | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_plate?: string | null
          vehicle_type_pricing?: Json | null
        }
        Relationships: []
      }
      service_order_messages: {
        Row: {
          company_name: string | null
          created_at: string
          id: string
          message: string
          order_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: string
          message?: string
          order_id: string
          user_id: string
          user_name?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: string
          message?: string
          order_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          company_name: string | null
          created_at: string | null
          created_by: string | null
          date_time: string | null
          description: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          images: string | null
          imported: boolean
          imported_at: string | null
          imported_source: string | null
          manager_approval: string | null
          manufacturer: string | null
          model: string | null
          notes: string | null
          odometer: number | null
          ordering_user: string | null
          reference_number: string | null
          service_category: string | null
          service_date: string | null
          service_time: string | null
          towing_address: string | null
          towing_contact: string | null
          towing_requested: boolean | null
          towing_time: string | null
          treatment_status: string | null
          urgency: string | null
          vehicle_id: string | null
          vehicle_notes: string | null
          vehicle_plate: string | null
          vehicle_type: string | null
          vendor_name: string | null
          vendor_phone: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date_time?: string | null
          description?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          images?: string | null
          imported?: boolean
          imported_at?: string | null
          imported_source?: string | null
          manager_approval?: string | null
          manufacturer?: string | null
          model?: string | null
          notes?: string | null
          odometer?: number | null
          ordering_user?: string | null
          reference_number?: string | null
          service_category?: string | null
          service_date?: string | null
          service_time?: string | null
          towing_address?: string | null
          towing_contact?: string | null
          towing_requested?: boolean | null
          towing_time?: string | null
          treatment_status?: string | null
          urgency?: string | null
          vehicle_id?: string | null
          vehicle_notes?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date_time?: string | null
          description?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          images?: string | null
          imported?: boolean
          imported_at?: string | null
          imported_source?: string | null
          manager_approval?: string | null
          manufacturer?: string | null
          model?: string | null
          notes?: string | null
          odometer?: number | null
          ordering_user?: string | null
          reference_number?: string | null
          service_category?: string | null
          service_date?: string | null
          service_time?: string | null
          towing_address?: string | null
          towing_contact?: string | null
          towing_requested?: boolean | null
          towing_time?: string | null
          treatment_status?: string | null
          urgency?: string | null
          vehicle_id?: string | null
          vehicle_notes?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
        }
        Relationships: []
      }
      supplier_work_orders: {
        Row: {
          approved_amount: number | null
          company_name: string
          created_at: string
          created_by: string | null
          description: string | null
          execution_date: string | null
          expense_id: string | null
          id: string
          notes: string | null
          order_number: string | null
          ordering_user: string | null
          ordering_user_id: string | null
          status: string
          supplier_id: string
          supplier_name: string | null
          supplier_number: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          approved_amount?: number | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          execution_date?: string | null
          expense_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          ordering_user?: string | null
          ordering_user_id?: string | null
          status?: string
          supplier_id: string
          supplier_name?: string | null
          supplier_number?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          approved_amount?: number | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          execution_date?: string | null
          expense_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          ordering_user?: string | null
          ordering_user_id?: string | null
          status?: string
          supplier_id?: string
          supplier_name?: string | null
          supplier_number?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_work_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          business_id: string | null
          company_name: string
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          entity_type: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          supplier_kind: string
          supplier_number: string | null
          supplier_type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          entity_type?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          supplier_kind?: string
          supplier_number?: string | null
          supplier_type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          entity_type?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          supplier_kind?: string
          supplier_number?: string | null
          supplier_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          action_type: string
          channel: string | null
          company_name: string
          created_at: string
          details: string | null
          entity_id: string | null
          entity_type: string
          id: string
          new_status: string | null
          old_status: string | null
          user_id: string | null
          user_name: string
          vehicle_plate: string | null
        }
        Insert: {
          action_type?: string
          channel?: string | null
          company_name?: string
          created_at?: string
          details?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          user_id?: string | null
          user_name?: string
          vehicle_plate?: string | null
        }
        Update: {
          action_type?: string
          channel?: string | null
          company_name?: string
          created_at?: string
          details?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          user_id?: string | null
          user_name?: string
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      system_update_audit: {
        Row: {
          id: number
          action: string
          triggered_by: string | null
          triggered_by_email: string | null
          status: string
          sha_before: string | null
          sha_after: string | null
          migrations_applied: string[] | null
          log_excerpt: string | null
          error: string | null
          duration_ms: number | null
          started_at: string
          finished_at: string | null
        }
        Insert: {
          id?: number
          action: string
          triggered_by?: string | null
          triggered_by_email?: string | null
          status: string
          sha_before?: string | null
          sha_after?: string | null
          migrations_applied?: string[] | null
          log_excerpt?: string | null
          error?: string | null
          duration_ms?: number | null
          started_at?: string
          finished_at?: string | null
        }
        Update: {
          id?: number
          action?: string
          triggered_by?: string | null
          triggered_by_email?: string | null
          status?: string
          sha_before?: string | null
          sha_after?: string | null
          migrations_applied?: string[] | null
          log_excerpt?: string | null
          error?: string | null
          duration_ms?: number | null
          started_at?: string
          finished_at?: string | null
        }
        Relationships: []
      }
      temporary_drivers: {
        Row: {
          company_name: string | null
          created_at: string
          created_by: string | null
          full_name: string
          handover_id: string | null
          id: string
          id_number: string
          license_expiry: string | null
          license_number: string
          phone: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          handover_id?: string | null
          id?: string
          id_number?: string
          license_expiry?: string | null
          license_number?: string
          phone?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          handover_id?: string | null
          id?: string
          id_number?: string
          license_expiry?: string | null
          license_number?: string
          phone?: string | null
        }
        Relationships: []
      }
      trip_logs: {
        Row: {
          company_name: string | null
          created_at: string
          driver_id: string
          end_address: string | null
          end_lat: number | null
          end_lng: number | null
          ended_at: string | null
          id: string
          notes: string | null
          route_id: string
          start_address: string | null
          start_lat: number | null
          start_lng: number | null
          started_at: string | null
          trip_date: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          driver_id: string
          end_address?: string | null
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          route_id: string
          start_address?: string | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          trip_date?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          driver_id?: string
          end_address?: string | null
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          route_id?: string
          start_address?: string | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          trip_date?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_companions: {
        Row: {
          companion_id: string
          company_name: string | null
          created_at: string
          created_by: string | null
          id: string
          vehicle_id: string
        }
        Insert: {
          companion_id: string
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          vehicle_id: string
        }
        Update: {
          companion_id?: string
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_companions_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "companions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_companions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_exchanges: {
        Row: {
          action_type: string | null
          branch: string | null
          cleanliness: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          damage_details: string | null
          exchange_date: string | null
          exchange_number: string
          exchange_reason: string | null
          exchange_time: string | null
          extra_equipment: string | null
          fuel_level: string | null
          giving_driver_approved: boolean | null
          giving_driver_name: string | null
          giving_driver_notes: string | null
          giving_driver_phone: string | null
          giving_driver_signature: string | null
          handover_date: string | null
          handover_time: string | null
          has_damages: boolean | null
          has_insurance_doc: boolean | null
          has_jack: boolean | null
          has_license_doc: boolean | null
          has_permanent_driver: boolean | null
          has_spare_tire: boolean | null
          has_warning_light: boolean | null
          id: string
          internal_number: string | null
          key_count: number | null
          lat: number | null
          lng: number | null
          location_address: string | null
          manager_approved: boolean | null
          manager_approved_by: string | null
          odometer: number
          permanent_driver_name: string | null
          photo_damage: string | null
          photo_front: string | null
          photo_interior: string | null
          photo_left: string | null
          photo_odometer: string | null
          photo_rear: string | null
          photo_right: string | null
          receiving_driver_approved: boolean | null
          receiving_driver_name: string | null
          receiving_driver_notes: string | null
          receiving_driver_phone: string | null
          receiving_driver_signature: string | null
          receiving_driver_type: string | null
          special_instructions: string | null
          status: string | null
          vehicle_plate: string
          vehicle_type: string | null
          vehicle_type_custom: string | null
          whatsapp_phone: string | null
          whatsapp_status: string | null
        }
        Insert: {
          action_type?: string | null
          branch?: string | null
          cleanliness?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          damage_details?: string | null
          exchange_date?: string | null
          exchange_number?: string
          exchange_reason?: string | null
          exchange_time?: string | null
          extra_equipment?: string | null
          fuel_level?: string | null
          giving_driver_approved?: boolean | null
          giving_driver_name?: string | null
          giving_driver_notes?: string | null
          giving_driver_phone?: string | null
          giving_driver_signature?: string | null
          handover_date?: string | null
          handover_time?: string | null
          has_damages?: boolean | null
          has_insurance_doc?: boolean | null
          has_jack?: boolean | null
          has_license_doc?: boolean | null
          has_permanent_driver?: boolean | null
          has_spare_tire?: boolean | null
          has_warning_light?: boolean | null
          id?: string
          internal_number?: string | null
          key_count?: number | null
          lat?: number | null
          lng?: number | null
          location_address?: string | null
          manager_approved?: boolean | null
          manager_approved_by?: string | null
          odometer?: number
          permanent_driver_name?: string | null
          photo_damage?: string | null
          photo_front?: string | null
          photo_interior?: string | null
          photo_left?: string | null
          photo_odometer?: string | null
          photo_rear?: string | null
          photo_right?: string | null
          receiving_driver_approved?: boolean | null
          receiving_driver_name?: string | null
          receiving_driver_notes?: string | null
          receiving_driver_phone?: string | null
          receiving_driver_signature?: string | null
          receiving_driver_type?: string | null
          special_instructions?: string | null
          status?: string | null
          vehicle_plate?: string
          vehicle_type?: string | null
          vehicle_type_custom?: string | null
          whatsapp_phone?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          action_type?: string | null
          branch?: string | null
          cleanliness?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          damage_details?: string | null
          exchange_date?: string | null
          exchange_number?: string
          exchange_reason?: string | null
          exchange_time?: string | null
          extra_equipment?: string | null
          fuel_level?: string | null
          giving_driver_approved?: boolean | null
          giving_driver_name?: string | null
          giving_driver_notes?: string | null
          giving_driver_phone?: string | null
          giving_driver_signature?: string | null
          handover_date?: string | null
          handover_time?: string | null
          has_damages?: boolean | null
          has_insurance_doc?: boolean | null
          has_jack?: boolean | null
          has_license_doc?: boolean | null
          has_permanent_driver?: boolean | null
          has_spare_tire?: boolean | null
          has_warning_light?: boolean | null
          id?: string
          internal_number?: string | null
          key_count?: number | null
          lat?: number | null
          lng?: number | null
          location_address?: string | null
          manager_approved?: boolean | null
          manager_approved_by?: string | null
          odometer?: number
          permanent_driver_name?: string | null
          photo_damage?: string | null
          photo_front?: string | null
          photo_interior?: string | null
          photo_left?: string | null
          photo_odometer?: string | null
          photo_rear?: string | null
          photo_right?: string | null
          receiving_driver_approved?: boolean | null
          receiving_driver_name?: string | null
          receiving_driver_notes?: string | null
          receiving_driver_phone?: string | null
          receiving_driver_signature?: string | null
          receiving_driver_type?: string | null
          special_instructions?: string | null
          status?: string | null
          vehicle_plate?: string
          vehicle_type?: string | null
          vehicle_type_custom?: string | null
          whatsapp_phone?: string | null
          whatsapp_status?: string | null
        }
        Relationships: []
      }
      vehicle_handovers: {
        Row: {
          action_type: string | null
          approval_updated_at: string | null
          company_name: string | null
          condition_checklist: Json | null
          created_at: string | null
          created_by: string | null
          damage_summary: string | null
          date_time: string | null
          driver_approval_status: string
          giving_driver_name: string | null
          giving_driver_phone: string | null
          id: string
          lat: number | null
          lng: number | null
          location_address: string | null
          location_name: string | null
          manufacturer: string | null
          model: string | null
          notes: string | null
          odometer: number | null
          pickup_date: string | null
          pickup_time: string | null
          receiving_driver_name: string | null
          receiving_driver_phone: string | null
          reference_number: string | null
          vehicle_notes: string | null
          vehicle_plate: string | null
          vehicle_type: string | null
        }
        Insert: {
          action_type?: string | null
          approval_updated_at?: string | null
          company_name?: string | null
          condition_checklist?: Json | null
          created_at?: string | null
          created_by?: string | null
          damage_summary?: string | null
          date_time?: string | null
          driver_approval_status?: string
          giving_driver_name?: string | null
          giving_driver_phone?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_address?: string | null
          location_name?: string | null
          manufacturer?: string | null
          model?: string | null
          notes?: string | null
          odometer?: number | null
          pickup_date?: string | null
          pickup_time?: string | null
          receiving_driver_name?: string | null
          receiving_driver_phone?: string | null
          reference_number?: string | null
          vehicle_notes?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
        }
        Update: {
          action_type?: string | null
          approval_updated_at?: string | null
          company_name?: string | null
          condition_checklist?: Json | null
          created_at?: string | null
          created_by?: string | null
          damage_summary?: string | null
          date_time?: string | null
          driver_approval_status?: string
          giving_driver_name?: string | null
          giving_driver_phone?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_address?: string | null
          location_name?: string | null
          manufacturer?: string | null
          model?: string | null
          notes?: string | null
          odometer?: number | null
          pickup_date?: string | null
          pickup_time?: string | null
          receiving_driver_name?: string | null
          receiving_driver_phone?: string | null
          reference_number?: string | null
          vehicle_notes?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      vehicle_inspections: {
        Row: {
          company_name: string | null
          created_at: string | null
          created_by: string | null
          id: string
          inspection_date: string | null
          inspection_type: string | null
          inspector_name: string | null
          notes: string | null
          overall_status: string | null
          vehicle_id: string
          vehicle_plate: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          inspection_date?: string | null
          inspection_type?: string | null
          inspector_name?: string | null
          notes?: string | null
          overall_status?: string | null
          vehicle_id: string
          vehicle_plate?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          inspection_date?: string | null
          inspection_type?: string | null
          inspector_name?: string | null
          notes?: string | null
          overall_status?: string | null
          vehicle_id?: string
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      vehicle_insurance_history: {
        Row: {
          company_name: string | null
          comprehensive_insurance_cost: number | null
          created_at: string | null
          has_no_claims: boolean | null
          id: string
          insurer_name: string | null
          mandatory_insurance_cost: number | null
          updated_at: string | null
          vehicle_id: string
          year: number
        }
        Insert: {
          company_name?: string | null
          comprehensive_insurance_cost?: number | null
          created_at?: string | null
          has_no_claims?: boolean | null
          id?: string
          insurer_name?: string | null
          mandatory_insurance_cost?: number | null
          updated_at?: string | null
          vehicle_id: string
          year: number
        }
        Update: {
          company_name?: string | null
          comprehensive_insurance_cost?: number | null
          created_at?: string | null
          has_no_claims?: boolean | null
          id?: string
          insurer_name?: string | null
          mandatory_insurance_cost?: number | null
          updated_at?: string | null
          vehicle_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_insurance_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_tasks: {
        Row: {
          company_name: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          follow_up_date: string | null
          id: string
          inspection_id: string | null
          requires_follow_up: boolean
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          status: string | null
          title: string
          updated_at: string | null
          vehicle_id: string | null
          vehicle_plate: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          follow_up_date?: string | null
          id?: string
          inspection_id?: string | null
          requires_follow_up?: boolean
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          follow_up_date?: string | null
          id?: string
          inspection_id?: string | null
          requires_follow_up?: boolean
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          vehicle_id?: string | null
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_tasks_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "vehicle_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          approval_status: string | null
          assigned_driver_id: string | null
          code: string | null
          company_name: string | null
          comprehensive_insurance_doc_url: string | null
          comprehensive_insurance_expiry: string | null
          comprehensive_insurance_start: string | null
          created_at: string | null
          created_by: string | null
          current_location: string | null
          department: string | null
          engine_hours: number | null
          engine_number: string | null
          engine_volume: number | null
          equipment_details: string | null
          equipment_serial: string | null
          equipment_type: string | null
          finance_details: Json | null
          finance_track: string | null
          has_loan: boolean | null
          has_no_claims: boolean | null
          horsepower: number | null
          id: string
          import_buffer: string | null
          import_category: string | null
          import_date: string | null
          import_file_name: string | null
          import_source: string | null
          import_status: string | null
          imported_by: string | null
          inspections_certificates: Json | null
          insurance_agent: string | null
          insurance_company: string | null
          insurance_cost: number | null
          insurance_doc_url: string | null
          insurance_expiry: string | null
          insurance_start: string | null
          insurances: Json | null
          internal_number: string | null
          is_leasing: boolean | null
          is_pledged: boolean | null
          kva: number | null
          last_service_date: string | null
          leasing_end_date: string | null
          license_doc_url: string | null
          license_plate: string
          loan_details: Json | null
          loan_end_date: string | null
          maintenance_details: Json | null
          maintenance_method: string | null
          management_type: string | null
          manufacturer: string | null
          meter_type: string | null
          meter_updated_at: string | null
          model: string | null
          monthly_leasing_cost: number | null
          monthly_loan_payment: number | null
          needs_transport: boolean | null
          next_service_date: string | null
          next_service_hours: number | null
          next_service_km: number | null
          nickname: string | null
          notes: string | null
          odometer: number | null
          ownership_type: string | null
          planned_replacement_date: string | null
          pledge_details: Json | null
          road_entry_date: string | null
          sale_date: string | null
          segment: string | null
          service_notes: string | null
          service_status: string | null
          service_type: string | null
          status: string | null
          test_expiry: string | null
          third_party_insurance_doc_url: string | null
          third_party_insurance_expiry: string | null
          updated_at: string | null
          usage_type: string | null
          vehicle_images: string | null
          vehicle_manager: string | null
          vehicle_return_date: string | null
          vehicle_type: string | null
          vin: string | null
          weight_tons: number | null
          work_site: string | null
          year: number | null
        }
        Insert: {
          approval_status?: string | null
          assigned_driver_id?: string | null
          code?: string | null
          company_name?: string | null
          comprehensive_insurance_doc_url?: string | null
          comprehensive_insurance_expiry?: string | null
          comprehensive_insurance_start?: string | null
          created_at?: string | null
          created_by?: string | null
          current_location?: string | null
          department?: string | null
          engine_hours?: number | null
          engine_number?: string | null
          engine_volume?: number | null
          equipment_details?: string | null
          equipment_serial?: string | null
          equipment_type?: string | null
          finance_details?: Json | null
          finance_track?: string | null
          has_loan?: boolean | null
          has_no_claims?: boolean | null
          horsepower?: number | null
          id?: string
          import_buffer?: string | null
          import_category?: string | null
          import_date?: string | null
          import_file_name?: string | null
          import_source?: string | null
          import_status?: string | null
          imported_by?: string | null
          inspections_certificates?: Json | null
          insurance_agent?: string | null
          insurance_company?: string | null
          insurance_cost?: number | null
          insurance_doc_url?: string | null
          insurance_expiry?: string | null
          insurance_start?: string | null
          insurances?: Json | null
          internal_number?: string | null
          is_leasing?: boolean | null
          is_pledged?: boolean | null
          kva?: number | null
          last_service_date?: string | null
          leasing_end_date?: string | null
          license_doc_url?: string | null
          license_plate: string
          loan_details?: Json | null
          loan_end_date?: string | null
          maintenance_details?: Json | null
          maintenance_method?: string | null
          management_type?: string | null
          manufacturer?: string | null
          meter_type?: string | null
          meter_updated_at?: string | null
          model?: string | null
          monthly_leasing_cost?: number | null
          monthly_loan_payment?: number | null
          needs_transport?: boolean | null
          next_service_date?: string | null
          next_service_hours?: number | null
          next_service_km?: number | null
          nickname?: string | null
          notes?: string | null
          odometer?: number | null
          ownership_type?: string | null
          planned_replacement_date?: string | null
          pledge_details?: Json | null
          road_entry_date?: string | null
          sale_date?: string | null
          segment?: string | null
          service_notes?: string | null
          service_status?: string | null
          service_type?: string | null
          status?: string | null
          test_expiry?: string | null
          third_party_insurance_doc_url?: string | null
          third_party_insurance_expiry?: string | null
          updated_at?: string | null
          usage_type?: string | null
          vehicle_images?: string | null
          vehicle_manager?: string | null
          vehicle_return_date?: string | null
          vehicle_type?: string | null
          vin?: string | null
          weight_tons?: number | null
          work_site?: string | null
          year?: number | null
        }
        Update: {
          approval_status?: string | null
          assigned_driver_id?: string | null
          code?: string | null
          company_name?: string | null
          comprehensive_insurance_doc_url?: string | null
          comprehensive_insurance_expiry?: string | null
          comprehensive_insurance_start?: string | null
          created_at?: string | null
          created_by?: string | null
          current_location?: string | null
          department?: string | null
          engine_hours?: number | null
          engine_number?: string | null
          engine_volume?: number | null
          equipment_details?: string | null
          equipment_serial?: string | null
          equipment_type?: string | null
          finance_details?: Json | null
          finance_track?: string | null
          has_loan?: boolean | null
          has_no_claims?: boolean | null
          horsepower?: number | null
          id?: string
          import_buffer?: string | null
          import_category?: string | null
          import_date?: string | null
          import_file_name?: string | null
          import_source?: string | null
          import_status?: string | null
          imported_by?: string | null
          inspections_certificates?: Json | null
          insurance_agent?: string | null
          insurance_company?: string | null
          insurance_cost?: number | null
          insurance_doc_url?: string | null
          insurance_expiry?: string | null
          insurance_start?: string | null
          insurances?: Json | null
          internal_number?: string | null
          is_leasing?: boolean | null
          is_pledged?: boolean | null
          kva?: number | null
          last_service_date?: string | null
          leasing_end_date?: string | null
          license_doc_url?: string | null
          license_plate?: string
          loan_details?: Json | null
          loan_end_date?: string | null
          maintenance_details?: Json | null
          maintenance_method?: string | null
          management_type?: string | null
          manufacturer?: string | null
          meter_type?: string | null
          meter_updated_at?: string | null
          model?: string | null
          monthly_leasing_cost?: number | null
          monthly_loan_payment?: number | null
          needs_transport?: boolean | null
          next_service_date?: string | null
          next_service_hours?: number | null
          next_service_km?: number | null
          nickname?: string | null
          notes?: string | null
          odometer?: number | null
          ownership_type?: string | null
          planned_replacement_date?: string | null
          pledge_details?: Json | null
          road_entry_date?: string | null
          sale_date?: string | null
          segment?: string | null
          service_notes?: string | null
          service_status?: string | null
          service_type?: string | null
          status?: string | null
          test_expiry?: string | null
          third_party_insurance_doc_url?: string | null
          third_party_insurance_expiry?: string | null
          updated_at?: string | null
          usage_type?: string | null
          vehicle_images?: string | null
          vehicle_manager?: string | null
          vehicle_return_date?: string | null
          vehicle_type?: string | null
          vin?: string | null
          weight_tons?: number | null
          work_site?: string | null
          year?: number | null
        }
        Relationships: []
      }
      voice_campaigns: {
        Row: {
          booked_count: number | null
          company_name: string | null
          completed_calls: number | null
          created_at: string
          created_by: string | null
          flow_type: string
          id: string
          name: string
          scheduled_at: string | null
          status: string
          total_calls: number | null
          updated_at: string
        }
        Insert: {
          booked_count?: number | null
          company_name?: string | null
          completed_calls?: number | null
          created_at?: string
          created_by?: string | null
          flow_type?: string
          id?: string
          name?: string
          scheduled_at?: string | null
          status?: string
          total_calls?: number | null
          updated_at?: string
        }
        Update: {
          booked_count?: number | null
          company_name?: string | null
          completed_calls?: number | null
          created_at?: string
          created_by?: string | null
          flow_type?: string
          id?: string
          name?: string
          scheduled_at?: string | null
          status?: string
          total_calls?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      voice_prompts: {
        Row: {
          display_name: string
          fallback_sms: boolean | null
          flow_type: string
          id: string
          max_turns: number | null
          opener_text: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          display_name: string
          fallback_sms?: boolean | null
          flow_type: string
          id?: string
          max_turns?: number | null
          opener_text: string
          system_prompt: string
          updated_at?: string
        }
        Update: {
          display_name?: string
          fallback_sms?: boolean | null
          flow_type?: string
          id?: string
          max_turns?: number | null
          opener_text?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      voice_scenario_runs: {
        Row: {
          call_log_id: string | null
          company_name: string | null
          context: Json | null
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          scenario_id: string | null
          scheduled_at: string | null
          status: string
          target_name: string | null
          target_phone: string | null
          trigger_entity_id: string | null
          trigger_entity_type: string | null
        }
        Insert: {
          call_log_id?: string | null
          company_name?: string | null
          context?: Json | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          scenario_id?: string | null
          scheduled_at?: string | null
          status?: string
          target_name?: string | null
          target_phone?: string | null
          trigger_entity_id?: string | null
          trigger_entity_type?: string | null
        }
        Update: {
          call_log_id?: string | null
          company_name?: string | null
          context?: Json | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          scenario_id?: string | null
          scheduled_at?: string | null
          status?: string
          target_name?: string | null
          target_phone?: string | null
          trigger_entity_id?: string | null
          trigger_entity_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_scenario_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "voice_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_scenarios: {
        Row: {
          company_name: string | null
          created_at: string | null
          created_by: string | null
          custom_message: string | null
          custom_phone: string | null
          delay_minutes: number | null
          description: string | null
          flow_type: string
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          target_audience: string
          trigger_config: Json | null
          trigger_count: number | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_message?: string | null
          custom_phone?: string | null
          delay_minutes?: number | null
          description?: string | null
          flow_type?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
          target_audience?: string
          trigger_config?: Json | null
          trigger_count?: number | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_message?: string | null
          custom_phone?: string | null
          delay_minutes?: number | null
          description?: string | null
          flow_type?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          target_audience?: string
          trigger_config?: Json | null
          trigger_count?: number | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      work_assignment_messages: {
        Row: {
          assignment_id: string
          company_name: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          user_id: string
          user_name: string
        }
        Insert: {
          assignment_id: string
          company_name?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          user_id: string
          user_name?: string
        }
        Update: {
          assignment_id?: string
          company_name?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_assignment_messages_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "work_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      work_assignment_status_log: {
        Row: {
          assignment_id: string
          changed_by: string | null
          changed_by_name: string | null
          company_name: string | null
          created_at: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
        }
        Insert: {
          assignment_id: string
          changed_by?: string | null
          changed_by_name?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Update: {
          assignment_id?: string
          changed_by?: string | null
          changed_by_name?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_assignment_status_log_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "work_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      work_assignments: {
        Row: {
          approval_source_driver: string | null
          approval_source_manager: string | null
          companion_id: string | null
          companion_name: string | null
          companion_requested: boolean | null
          company_name: string | null
          created_at: string
          created_by: string | null
          customer_approved_at: string | null
          customer_id: string | null
          customer_name: string | null
          description: string | null
          driver_approved_at: string | null
          driver_id: string | null
          driver_name: string | null
          end_time: string | null
          id: string
          location: string | null
          manager_approved_at: string | null
          manager_approved_by: string | null
          manager_approved_name: string | null
          notes: string | null
          priority: string | null
          rejected_by: string | null
          rejection_reason: string | null
          route_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          status: string
          title: string
          updated_at: string
          vehicle_plate: string | null
        }
        Insert: {
          approval_source_driver?: string | null
          approval_source_manager?: string | null
          companion_id?: string | null
          companion_name?: string | null
          companion_requested?: boolean | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_approved_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          driver_approved_at?: string | null
          driver_id?: string | null
          driver_name?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          manager_approved_name?: string | null
          notes?: string | null
          priority?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          route_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          vehicle_plate?: string | null
        }
        Update: {
          approval_source_driver?: string | null
          approval_source_manager?: string | null
          companion_id?: string | null
          companion_name?: string | null
          companion_requested?: boolean | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_approved_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          driver_approved_at?: string | null
          driver_id?: string | null
          driver_name?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          manager_approved_name?: string | null
          notes?: string | null
          priority?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          route_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_assignments_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "companions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      export_schema_ddl: { Args: never; Returns: string }
      get_user_company: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "driver" | "fleet_manager" | "super_admin" | "private_customer"
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
    Enums: {
      app_role: ["driver", "fleet_manager", "super_admin", "private_customer"],
    },
  },
} as const
