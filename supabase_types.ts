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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_intent_cache: {
        Row: {
          created_at: string
          id: string
          input_tokens: number | null
          model_used: string
          output_tokens: number | null
          prompt_hash: string
          prompt_preview: string | null
          response: Json
          thinking_level: string
          thought_process: string | null
          total_tokens: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          model_used: string
          output_tokens?: number | null
          prompt_hash: string
          prompt_preview?: string | null
          response: Json
          thinking_level: string
          thought_process?: string | null
          total_tokens?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          model_used?: string
          output_tokens?: number | null
          prompt_hash?: string
          prompt_preview?: string | null
          response?: Json
          thinking_level?: string
          thought_process?: string | null
          total_tokens?: number | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          changed_at: string | null
          id: number
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          changed_at?: string | null
          id?: number
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          changed_at?: string | null
          id?: number
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          backup_date: string | null
          counts: Json | null
          created_at: string | null
          error_message: string | null
          id: number
          operation: string
          origin: string | null
          status: string | null
        }
        Insert: {
          backup_date?: string | null
          counts?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: number
          operation: string
          origin?: string | null
          status?: string | null
        }
        Update: {
          backup_date?: string | null
          counts?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: number
          operation?: string
          origin?: string | null
          status?: string | null
        }
        Relationships: []
      }
      historical_imports: {
        Row: {
          created_at: string | null
          data: Json
          id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
        }
        Relationships: []
      }
      history_records: {
        Row: {
          created_at: string | null
          data: Json
          id: string
          import_batch_id: string | null
          import_source: string | null
          semana: string | null
          status: string
          updated_at: string | null
          week_id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          id: string
          import_batch_id?: string | null
          import_source?: string | null
          semana?: string | null
          status?: string
          updated_at?: string | null
          week_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
          import_batch_id?: string | null
          import_source?: string | null
          semana?: string | null
          status?: string
          updated_at?: string | null
          week_id?: string
        }
        Relationships: []
      }
      local_needs_preassignments: {
        Row: {
          assigned_at: string | null
          assigned_to_part_id: string | null
          assignee_name: string
          created_at: string | null
          id: string
          order_position: number
          target_week: string | null
          theme: string
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to_part_id?: string | null
          assignee_name: string
          created_at?: string | null
          id?: string
          order_position?: number
          target_week?: string | null
          theme: string
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to_part_id?: string | null
          assignee_name?: string
          created_at?: string | null
          id?: string
          order_position?: number
          target_week?: string | null
          theme?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_needs_preassignments_assigned_to_part_id_fkey"
            columns: ["assigned_to_part_id"]
            isOneToOne: false
            referencedRelation: "workbook_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      publishers: {
        Row: {
          created_at: string | null
          data: Json
          id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
        }
        Relationships: []
      }
      scheduled_assignments: {
        Row: {
          approval_date: string | null
          approved_by_elder_id: string | null
          approved_by_elder_name: string | null
          created_at: string | null
          date: string
          duration_min: number | null
          end_time: string | null
          id: string
          pairing_reason: string | null
          part_id: string
          part_title: string
          part_type: string
          principal_publisher_id: string | null
          principal_publisher_name: string
          promoted_at: string | null
          promoted_to_history_id: string | null
          rejection_reason: string | null
          room: string | null
          score: number | null
          secondary_publisher_id: string | null
          secondary_publisher_name: string | null
          selection_reason: string | null
          start_time: string | null
          status: string
          teaching_category: string
          updated_at: string | null
          week_id: string
        }
        Insert: {
          approval_date?: string | null
          approved_by_elder_id?: string | null
          approved_by_elder_name?: string | null
          created_at?: string | null
          date: string
          duration_min?: number | null
          end_time?: string | null
          id?: string
          pairing_reason?: string | null
          part_id: string
          part_title: string
          part_type: string
          principal_publisher_id?: string | null
          principal_publisher_name: string
          promoted_at?: string | null
          promoted_to_history_id?: string | null
          rejection_reason?: string | null
          room?: string | null
          score?: number | null
          secondary_publisher_id?: string | null
          secondary_publisher_name?: string | null
          selection_reason?: string | null
          start_time?: string | null
          status?: string
          teaching_category: string
          updated_at?: string | null
          week_id: string
        }
        Update: {
          approval_date?: string | null
          approved_by_elder_id?: string | null
          approved_by_elder_name?: string | null
          created_at?: string | null
          date?: string
          duration_min?: number | null
          end_time?: string | null
          id?: string
          pairing_reason?: string | null
          part_id?: string
          part_title?: string
          part_type?: string
          principal_publisher_id?: string | null
          principal_publisher_name?: string
          promoted_at?: string | null
          promoted_to_history_id?: string | null
          rejection_reason?: string | null
          room?: string | null
          score?: number | null
          secondary_publisher_id?: string | null
          secondary_publisher_name?: string | null
          selection_reason?: string | null
          start_time?: string | null
          status?: string
          teaching_category?: string
          updated_at?: string | null
          week_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      special_events: {
        Row: {
          applied_at: string | null
          boletim_number: number | null
          boletim_year: number | null
          created_at: string | null
          created_by: string | null
          details: Json | null
          duration: number | null
          guidelines: string | null
          id: string
          is_applied: boolean | null
          observations: string | null
          responsible: string | null
          template_id: string
          theme: string | null
          updated_at: string | null
          week: string
        }
        Insert: {
          applied_at?: string | null
          boletim_number?: number | null
          boletim_year?: number | null
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          duration?: number | null
          guidelines?: string | null
          id?: string
          is_applied?: boolean | null
          observations?: string | null
          responsible?: string | null
          template_id: string
          theme?: string | null
          updated_at?: string | null
          week: string
        }
        Update: {
          applied_at?: string | null
          boletim_number?: number | null
          boletim_year?: number | null
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          duration?: number | null
          guidelines?: string | null
          id?: string
          is_applied?: boolean | null
          observations?: string | null
          responsible?: string | null
          template_id?: string
          theme?: string | null
          updated_at?: string | null
          week?: string
        }
        Relationships: []
      }
      workbook_batches: {
        Row: {
          draft_count: number | null
          file_name: string
          id: string
          is_active: boolean | null
          promoted_at: string | null
          promoted_count: number | null
          promoted_to_participation_ids: string[] | null
          refined_count: number | null
          total_parts: number | null
          upload_date: string | null
          week_range: string | null
        }
        Insert: {
          draft_count?: number | null
          file_name: string
          id?: string
          is_active?: boolean | null
          promoted_at?: string | null
          promoted_count?: number | null
          promoted_to_participation_ids?: string[] | null
          refined_count?: number | null
          total_parts?: number | null
          upload_date?: string | null
          week_range?: string | null
        }
        Update: {
          draft_count?: number | null
          file_name?: string
          id?: string
          is_active?: boolean | null
          promoted_at?: string | null
          promoted_count?: number | null
          promoted_to_participation_ids?: string[] | null
          refined_count?: number | null
          total_parts?: number | null
          upload_date?: string | null
          week_range?: string | null
        }
        Relationships: []
      }
      workbook_parts: {
        Row: {
          affected_by_event_id: string | null
          approved_at: string | null
          approved_by_id: string | null
          batch_id: string
          cancel_reason: string | null
          completed_at: string | null
          created_at: string | null
          date: string
          descricao: string | null
          detalhes_parte: string | null
          duracao: string | null
          funcao: string
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          local_needs_theme: string | null
          match_confidence: number | null
          modalidade: string | null
          original_duration: string | null
          part_title: string
          pending_event_id: string | null
          raw_publisher_name: string | null
          rejected_reason: string | null
          resolved_publisher_id: string | null
          resolved_publisher_name: string | null
          section: string
          seq: number
          status: string
          tipo_parte: string
          updated_at: string | null
          week_display: string
          week_id: string
          year: number | null
        }
        Insert: {
          affected_by_event_id?: string | null
          approved_at?: string | null
          approved_by_id?: string | null
          batch_id: string
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string | null
          date: string
          descricao?: string | null
          detalhes_parte?: string | null
          duracao?: string | null
          funcao?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          local_needs_theme?: string | null
          match_confidence?: number | null
          modalidade?: string | null
          original_duration?: string | null
          part_title: string
          pending_event_id?: string | null
          raw_publisher_name?: string | null
          rejected_reason?: string | null
          resolved_publisher_id?: string | null
          resolved_publisher_name?: string | null
          section: string
          seq: number
          status?: string
          tipo_parte: string
          updated_at?: string | null
          week_display: string
          week_id: string
          year?: number | null
        }
        Update: {
          affected_by_event_id?: string | null
          approved_at?: string | null
          approved_by_id?: string | null
          batch_id?: string
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string | null
          date?: string
          descricao?: string | null
          detalhes_parte?: string | null
          duracao?: string | null
          funcao?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          local_needs_theme?: string | null
          match_confidence?: number | null
          modalidade?: string | null
          original_duration?: string | null
          part_title?: string
          pending_event_id?: string | null
          raw_publisher_name?: string | null
          rejected_reason?: string | null
          resolved_publisher_id?: string | null
          resolved_publisher_name?: string | null
          section?: string
          seq?: number
          status?: string
          tipo_parte?: string
          updated_at?: string | null
          week_display?: string
          week_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workbook_parts_affected_by_event_id_fkey"
            columns: ["affected_by_event_id"]
            isOneToOne: false
            referencedRelation: "special_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_parts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "workbook_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_parts_pending_event_id_fkey"
            columns: ["pending_event_id"]
            isOneToOne: false
            referencedRelation: "special_events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      exec_sql: { Args: { sql: string }; Returns: undefined }
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
