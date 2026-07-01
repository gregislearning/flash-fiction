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
      groups: {
        Row: {
          id: string
          name: string
          slug: string
          listed: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          listed?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          listed?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          id: string
          group_id: string
          title: string
          description: string
          word_limit: number
          submission_start: string
          submission_end: string
          voting_end: string
          object: string | null
          location: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          title: string
          description: string
          word_limit: number
          submission_start: string
          submission_end: string
          voting_end: string
          object?: string | null
          location?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          title?: string
          description?: string
          word_limit?: number
          submission_start?: string
          submission_end?: string
          voting_end?: string
          object?: string | null
          location?: string | null
          created_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          id: string
          prompt_id: string
          user_id: string
          content: string
          word_count: number
          claimed: boolean
          author_email: string | null
          created_at: string
        }
        Insert: {
          id?: string
          prompt_id: string
          user_id: string
          content: string
          word_count: number
          claimed?: boolean
          author_email?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          prompt_id?: string
          user_id?: string
          content?: string
          word_count?: number
          claimed?: boolean
          author_email?: string | null
          created_at?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          id: string
          prompt_id: string
          submission_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          prompt_id: string
          submission_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          prompt_id?: string
          submission_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      submission_comments: {
        Row: {
          id: string
          submission_id: string
          user_id: string
          author_email: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          user_id: string
          author_email: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          submission_id?: string
          user_id?: string
          author_email?: string
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          submission_id: string
          comment_id: string
          group_id: string
          message: string
          comment_preview: string
          unread: boolean
          created_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          submission_id: string
          comment_id: string
          group_id: string
          message: string
          comment_preview: string
          unread?: boolean
          created_at?: string
          read_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          submission_id?: string
          comment_id?: string
          group_id?: string
          message?: string
          comment_preview?: string
          unread?: boolean
          created_at?: string
          read_at?: string | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          user_id: string
          role: 'admin' | 'member'
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          role: 'admin' | 'member'
          created_at?: string
        }
        Update: {
          group_id?: string
          user_id?: string
          role?: 'admin' | 'member'
          created_at?: string
        }
        Relationships: []
      }
      group_invitations: {
        Row: {
          id: string
          group_id: string
          email: string
          role: 'admin' | 'member'
          invited_by: string | null
          token: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          email: string
          role?: 'admin' | 'member'
          invited_by?: string | null
          token?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          email?: string
          role?: 'admin' | 'member'
          invited_by?: string | null
          token?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_submissions: {
        Args: { p_group_id: string; q: string; lim?: number }
        Returns: {
          id: string
          prompt_id: string
          prompt_title: string
          prompt_phase: string
          snippet: string
          rank: number
          claimed: boolean
          author_email: string | null
          created_at: string
        }[]
      }
      create_group: {
        Args: { p_name: string; p_slug: string; p_admin_email: string }
        Returns: { group_id: string; slug: string; admin_invite_token: string | null }
      }
      accept_invitation: {
        Args: { p_token: string }
        Returns: { group_slug: string; group_name: string }
      }
      get_invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          group_name: string
          group_slug: string
          email: string
          role: 'admin' | 'member'
          accepted: boolean
        } | null
      }
      my_pending_invitations: {
        Args: Record<string, never>
        Returns: { token: string; group_name: string; group_slug: string; role: 'admin' | 'member' }[]
      }
      claim_my_invitations: {
        Args: Record<string, never>
        Returns: number
      }
      is_group_admin: {
        Args: { g: string; u: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { g: string; u: string }
        Returns: boolean
      }
      get_group_members: {
        Args: { p_group_id: string }
        Returns: { user_id: string; email: string; role: 'admin' | 'member'; joined_at: string }[]
      }
    }
  }
}

export type Group = Database['public']['Tables']['groups']['Row']
export type GroupMember = Database['public']['Tables']['group_members']['Row']
export type GroupInvitation = Database['public']['Tables']['group_invitations']['Row']
export type Prompt = Database['public']['Tables']['prompts']['Row']
export type Submission = Database['public']['Tables']['submissions']['Row']
export type Vote = Database['public']['Tables']['votes']['Row']
export type SubmissionComment = Database['public']['Tables']['submission_comments']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']

export type PromptPhase = 'upcoming' | 'writing' | 'voting' | 'results'

export interface SubmissionWithVotes extends Submission {
  vote_count: number
}

export type SearchResult = {
  id: string
  prompt_id: string
  prompt_title: string
  prompt_phase: 'voting' | 'results'
  snippet: string
  rank: number
  claimed: boolean
  author_email: string | null
  created_at: string
}
