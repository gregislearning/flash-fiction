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
      prompts: {
        Row: {
          id: string
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
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          submission_id: string
          comment_id: string
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
          message?: string
          comment_preview?: string
          unread?: boolean
          created_at?: string
          read_at?: string | null
        }
      }
    }
  }
}

export type Prompt = Database['public']['Tables']['prompts']['Row']
export type Submission = Database['public']['Tables']['submissions']['Row']
export type Vote = Database['public']['Tables']['votes']['Row']
export type SubmissionComment = Database['public']['Tables']['submission_comments']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']

export type PromptPhase = 'upcoming' | 'writing' | 'voting' | 'results'

export interface SubmissionWithVotes extends Submission {
  vote_count: number
}
