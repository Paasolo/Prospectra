export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; full_name: string | null; avatar_url: string | null } & Timestamps;
        Insert: { id: string; email: string; full_name?: string | null; avatar_url?: string | null };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["workspaces"]["Insert"]>;
        Relationships: [];
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
        } & Timestamps;
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
        };
        Update: Partial<Database["public"]["Tables"]["workspace_members"]["Insert"]>;
        Relationships: [];
      };
      workspace_invitations: {
        Row: {
          id: string;
          workspace_id: string;
          email: string;
          role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
          token: string;
          invited_by: string | null;
          accepted_at: string | null;
          revoked_at: string | null;
          expires_at: string;
        } & Timestamps;
        Insert: {
          workspace_id: string;
          email: string;
          role?: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
          token: string;
          invited_by?: string | null;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_invitations"]["Insert"]>;
        Relationships: [];
      };
      workspace_settings: {
        Row: {
          workspace_id: string;
          industry: string | null;
          company_size: string | null;
          website_url: string | null;
          product_description: string | null;
          target_customers: string | null;
          target_markets: string[] | null;
          sales_objectives: string | null;
          onboarding_completed_at: string | null;
          onboarding_step: number;
        } & Timestamps;
        Insert: {
          workspace_id: string;
          industry?: string | null;
          company_size?: string | null;
          website_url?: string | null;
          product_description?: string | null;
          target_customers?: string | null;
          target_markets?: string[] | null;
          sales_objectives?: string | null;
          onboarding_completed_at?: string | null;
          onboarding_step?: number;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_settings"]["Insert"]>;
        Relationships: [];
      };
      prospects: {
        Row: {
          id: string;
          workspace_id: string;
          company_id: string | null;
          full_name: string | null;
          email: string | null;
          job_title: string | null;
          stage:
            | "NEW"
            | "QUALIFIED"
            | "CONTACTED"
            | "ENGAGED"
            | "MEETING_BOOKED"
            | "CUSTOMER"
            | "DISQUALIFIED";
          normalized_email: string | null;
          owner_user_id: string | null;
          phone: string | null;
          department: string | null;
          seniority: string | null;
          location: string | null;
          linkedin_url: string | null;
          source: string | null;
          tags: string[];
          email_verified: boolean;
          merged_into_prospect_id: string | null;
          metadata: Json;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          domain: string | null;
          website_url: string | null;
          industry: string | null;
          employee_count: number | null;
          normalized_domain: string | null;
          metadata: Json;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          objective: string | null;
          list_id: string | null;
          sending_account_id: string | null;
          timezone: string;
          daily_limit: number;
          send_window_start_minutes: number;
          send_window_end_minutes: number;
          send_days: number[];
          scheduled_for: string | null;
          exclusion_rules: Json;
          audience_ids: string[];
          stop_on_reply: boolean;
          stop_on_unsubscribe: boolean;
          stop_on_bounce: boolean;
          stop_on_complaint: boolean;
          duplicated_from: string | null;
          status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
          created_by: string | null;
          activated_at: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      email_messages: {
        Row: {
          id: string;
          workspace_id: string;
          campaign_id: string | null;
          prospect_id: string | null;
          conversation_id: string | null;
          direction: "outbound" | "inbound";
          provider: string | null;
          provider_status: string | null;
          provider_message_id: string | null;
          provider_thread_id: string | null;
          delivery_state: string;
          subject: string | null;
          body: string | null;
          recipient: string | null;
          sending_account_id: string | null;
          attempted_at: string | null;
          provider_response: Json;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      meetings: {
        Row: {
          id: string;
          workspace_id: string;
          title: string;
          description: string | null;
          starts_at: string | null;
          ends_at: string | null;
          timezone: string;
          location: string | null;
          attendees: Json;
          prospect_id: string | null;
          company_id: string | null;
          conversation_id: string | null;
          campaign_id: string | null;
          provider: string | null;
          provider_event_id: string | null;
          provider_confirmed: boolean;
          provider_error: string | null;
          status: string;
          connected_account_id: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      connected_accounts: {
        Row: {
          id: string;
          workspace_id: string;
          kind: string;
          provider: string;
          email_address: string | null;
          sending_identity: string | null;
          status: string;
          daily_limit: number;
          health: Json;
          last_error: string | null;
          token_expires_at: string | null;
          selected_calendar_id: string | null;
          timezone: string;
          working_start_minutes: number;
          working_end_minutes: number;
          working_days: number[];
          buffer_minutes: number;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      ai_conversations: {
        Row: {
          id: string;
          workspace_id: string;
          created_by: string | null;
          title: string;
          context: Json;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      ai_messages: {
        Row: {
          id: string;
          workspace_id: string;
          conversation_id: string;
          role: string;
          content: string;
          structured: Json | null;
          status: string;
          error_code: string | null;
          error_detail: string | null;
          model: string | null;
          usage: Json | null;
          request_key: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      ai_usage_log: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string | null;
          kind: string;
          model: string | null;
          prompt_tokens: number;
          completion_tokens: number;
          estimated_cost_usd: number | null;
          status: string;
          request_key: string | null;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      email_templates: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          category: string;
          subject: string;
          body: string;
          created_by: string | null;
          duplicated_from: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      email_drafts: {
        Row: {
          id: string;
          workspace_id: string;
          prospect_id: string | null;
          company_id: string | null;
          icp_id: string | null;
          template_id: string | null;
          email_type: string;
          tone: string | null;
          length: string | null;
          call_to_action: string | null;
          instructions: string | null;
          subject: string;
          body: string;
          explanation: string | null;
          variables: Json;
          warnings: Json;
          model: string | null;
          usage: Json | null;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      campaign_steps: {
        Row: {
          id: string;
          workspace_id: string;
          campaign_id: string;
          position: number;
          subject: string;
          body: string;
          delay_days: number;
          branch_condition: string;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      campaign_enrollments: {
        Row: {
          id: string;
          workspace_id: string;
          campaign_id: string;
          prospect_id: string;
          status: string;
          stop_reason: string | null;
          current_step: number;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      outreach_jobs: {
        Row: {
          id: string;
          workspace_id: string;
          campaign_id: string;
          enrollment_id: string;
          step_position: number;
          status: string;
          run_at: string;
          attempts: number;
          max_attempts: number;
          last_error: string | null;
          provider_message_id: string | null;
          reconcile: boolean;
          idempotency_key: string;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      suppressions: {
        Row: { id: string; workspace_id: string; email: string; reason: string; created_at: string };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      inbox_conversations: {
        Row: {
          id: string;
          workspace_id: string;
          prospect_id: string | null;
          company_id: string | null;
          campaign_id: string | null;
          subject: string | null;
          provider: string | null;
          provider_thread_id: string | null;
          assigned_to: string | null;
          status: string;
          unread: boolean;
          last_message_at: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      inbox_notes: {
        Row: { id: string; workspace_id: string; conversation_id: string; author_id: string | null; body: string; created_at: string };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      credit_accounts: {
        Row: {
          id: string;
          workspace_id: string;
          balance: number;
          low_balance_threshold: number;
        } & Timestamps;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          monthly_price_cents: number;
          annual_price_cents: number;
          currency: string;
          included_credits: number;
          team_member_limit: number | null;
          campaign_limit: number | null;
          prospect_limit: number | null;
          ai_allowance: number | null;
          enrichment_allowance: number | null;
          features: Json;
          is_active: boolean;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          workspace_id: string;
          plan_id: string;
          status: string;
          provider: string | null;
          provider_subscription_id: string | null;
          provider_customer_id: string | null;
          billing_interval: string | null;
          currency: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          workspace_id: string;
          credit_account_id: string;
          amount: number;
          balance_after: number;
          reason: string;
          reference_type: string | null;
          reference_id: string | null;
          entry_type: string;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      credit_reservations: {
        Row: {
          id: string;
          workspace_id: string;
          amount: number;
          settled_amount: number | null;
          status: string;
          reason: string;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          workspace_id: string;
          provider: string;
          provider_invoice_id: string;
          status: string;
          amount_cents: number;
          currency: string;
          hosted_url: string | null;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      refunds: {
        Row: {
          id: string;
          workspace_id: string;
          provider: string;
          amount_cents: number;
          currency: string;
          status: string;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      billing_profiles: {
        Row: {
          workspace_id: string;
          legal_name: string | null;
          billing_email: string | null;
          tax_id: string | null;
          address: Json;
          updated_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      notification_preferences: {
        Row: { user_id: string; workspace_id: string; type: string; in_app: boolean; email: boolean };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      platform_admins: {
        Row: { user_id: string; created_at: string };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      icp_profiles: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          criteria: Json;
          quality_score: number | null;
          status: string;
          source: string;
          recommendation: Json;
          search_filters: Json;
          quality: Json;
          archived_at: string | null;
          activated_at: string | null;
          duplicated_from: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      website_analyses: {
        Row: {
          id: string;
          workspace_id: string;
          submitted_url: string;
          normalized_domain: string | null;
          company_name: string | null;
          instructions: string | null;
          extracted_content: Json;
          crawled_urls: Json;
          ai_output: Json | null;
          ai_model: string | null;
          usage: Json;
          estimated_cost_usd: number | null;
          status: string;
          error_code: string | null;
          error_detail: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          workspace_id: string;
          status: string;
          website_url: string | null;
          offer_description: string | null;
          company_name: string | null;
          prospect_cap: number;
          offer_summary: string | null;
          website_analysis_id: string | null;
          competitors: Json;
          estimated_credits: number;
          reserved_credits: number;
          consumed_credits: number;
          reservation_id: string | null;
          discovery_configured: boolean;
          mailbox_connected: boolean;
          error_code: string | null;
          error_detail: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      agent_segments: {
        Row: {
          id: string;
          workspace_id: string;
          run_id: string;
          position: number;
          name: string;
          who_buys: string;
          fit_score: number;
          evidence_note: string;
          job_titles: Json;
          industries: Json;
          geographies: Json;
          keywords: Json;
          status: string;
          discovery_state: string;
          setup_message: string | null;
          prospect_ids: string[];
          draft_ids: string[];
          list_id: string | null;
          campaign_id: string | null;
          icp_profile_id: string | null;
          sends: number;
          positive_replies: number;
          credits_spent: number;
          approved_at: string | null;
          approved_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      prospect_lists: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      prospect_list_members: {
        Row: {
          id: string;
          workspace_id: string;
          list_id: string;
          prospect_id: string;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      discovery_searches: {
        Row: {
          id: string;
          workspace_id: string;
          icp_profile_id: string | null;
          query: Json;
          status: string;
          provider: string | null;
          kind: string | null;
          estimated_credits: number | null;
          consumed_credits: number;
          error_code: string | null;
          error_detail: string | null;
          result_count: number;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      discovery_search_results: {
        Row: {
          id: string;
          workspace_id: string;
          search_id: string;
          company_id: string | null;
          prospect_id: string | null;
          payload: Json;
          score: number | null;
          provider: string | null;
          provider_record_id: string | null;
          retrieved_at: string | null;
          original_source: string | null;
          confidence: string | null;
          usage_restrictions: string | null;
          entity_kind: string | null;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      pipeline_stages: {
        Row: {
          id: string;
          workspace_id: string;
          code: string;
          label: string;
          position: number;
          is_enabled: boolean;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      prospect_notes: {
        Row: {
          id: string;
          workspace_id: string;
          prospect_id: string;
          body: string;
          created_by: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      prospect_activities: {
        Row: {
          id: string;
          workspace_id: string;
          prospect_id: string;
          activity_type: string;
          summary: string;
          metadata: Json;
          actor_user_id: string | null;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      prospect_merges: {
        Row: {
          id: string;
          workspace_id: string;
          surviving_prospect_id: string;
          merged_prospect_id: string;
          match_reason: string;
          confidence: string;
          snapshot: Json;
          merged_by: string | null;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      enrichment_jobs: {
        Row: {
          id: string;
          workspace_id: string;
          prospect_id: string;
          status: string;
          attempt_count: number;
          max_attempts: number;
          provider: string | null;
          error_code: string | null;
          error_detail: string | null;
          credits_consumed: number;
          created_by: string | null;
          completed_at: string | null;
        } & Timestamps;
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      enrichment_field_values: {
        Row: {
          id: string;
          workspace_id: string;
          prospect_id: string;
          job_id: string | null;
          field_name: string;
          field_value: string;
          source: string;
          verified: boolean;
          retrieved_at: string;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      scoring_configs: {
        Row: {
          workspace_id: string;
          weights: Json;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      prospect_scores: {
        Row: {
          id: string;
          workspace_id: string;
          prospect_id: string;
          icp_profile_id: string | null;
          scoring_version: string;
          score: number | null;
          category: string;
          positive_factors: Json;
          negative_factors: Json;
          explanation: string;
          ai_explanation: string | null;
          recommended_action: string;
          inputs: Json;
          created_at: string;
        };
        Insert: { [key: string]: Json | undefined };
        Update: { [key: string]: Json | undefined };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_workspace_with_owner: {
        Args: { p_name: string; p_slug: string };
        Returns: Database["public"]["Tables"]["workspaces"]["Row"];
      };
      is_workspace_member: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      ensure_default_pipeline_stages: {
        Args: { p_workspace_id: string };
        Returns: null;
      };
    };
    Enums: {
      workspace_role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
      prospect_stage:
        | "NEW"
        | "QUALIFIED"
        | "CONTACTED"
        | "ENGAGED"
        | "MEETING_BOOKED"
        | "CUSTOMER"
        | "DISQUALIFIED";
      campaign_status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
    };
    CompositeTypes: Record<string, never>;
  };
};
