import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminPromptForm from '@/components/AdminPromptForm'
import AdminPromptList from '@/components/AdminPromptList'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()

  // Check if user is authenticated and is admin
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const isAdmin = user.user_metadata?.is_admin === true

  if (!isAdmin) {
    redirect('/')
  }

  // Get all prompts
  const { data: prompts } = await supabase
    .from('prompts')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-[calc(100vh-65px)] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            Admin Panel
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Create and manage flash fiction prompts
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">
              Create New Prompt
            </h2>
            <AdminPromptForm />
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">
              Existing Prompts
            </h2>
            <AdminPromptList prompts={prompts || []} />
          </div>
        </div>
      </div>
    </main>
  )
}
