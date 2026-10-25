export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          type: "Lost" | "Found";
          name: string;
          category: string;
          location: string;
          event_date: string;
          description: string;
          image_path: string;
          status: "active" | "resolved";
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      claims: {
        Row: {
          id: string;
          report_id: string;
          claimant_id: string;
          details: string;
          status: "pending" | "accepted" | "rejected";
          claimant_confirmed: boolean;
          reporter_confirmed: boolean;
          created_at: string;
        };
        Insert: {
          report_id: string;
          claimant_id: string;
          details: string;
        };
        Update: never;
        Relationships: [];
      };
      report_contacts: {
        Row: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_report: {
        Args: {
          p_type: string;
          p_name: string;
          p_category: string;
          p_location: string;
          p_event_date: string;
          p_description: string;
          p_contact: string;
          p_image_path: string;
        };
        Returns: { id: string };
      };
      report_claims: {
        Args: { p_report_id: string };
        Returns: Array<{
          id: string;
          claimant_id: string;
          details: string;
          status: "pending" | "accepted" | "rejected";
          claimant_confirmed: boolean;
          reporter_confirmed: boolean;
          created_at: string;
        }>;
      };
      my_claims: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          report_id: string;
          claim_id: string;
          status: "pending" | "accepted" | "rejected";
          claimant_confirmed: boolean;
          reporter_confirmed: boolean;
          is_reporter: boolean;
        }>;
      };
      review_claim: {
        Args: { p_claim_id: string; p_accept: boolean };
        Returns: undefined;
      };
      update_report_status: {
        Args: { p_report_id: string; p_status: string };
        Returns: undefined;
      };
      confirm_handover: {
        Args: { p_claim_id: string };
        Returns: undefined;
      };
      accepted_contact: {
        Args: { p_claim_id: string };
        Returns: { contact: string };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
