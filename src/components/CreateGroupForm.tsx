'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { createGroupAction, type CreateGroupState } from '@/app/admin/groups/actions'

const initialState: CreateGroupState = { status: 'idle' }

/** Auto-suggest a URL slug from a group name: lowercase kebab-case. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function CreateGroupForm() {
  const [state, formAction, pending] = useActionState(createGroupAction, initialState)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [copied, setCopied] = useState(false)

  // Keep slug mirrored to name until the user edits the slug directly.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  const inviteUrl =
    state.status === 'success' && state.adminInviteToken
      ? `${typeof window === 'undefined' ? '' : window.location.origin}/invite/${state.adminInviteToken}`
      : null

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Group name
          </label>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Writers' Room"
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            URL slug <span className="text-zinc-400">(permanent — /g/{slug || 'slug'})</span>
          </label>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
            placeholder="writers-room"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-mono text-sm"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Lowercase letters, numbers, and hyphens. Can&apos;t be changed later.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            First admin&apos;s email
          </label>
          <input
            name="adminEmail"
            type="email"
            required
            placeholder="admin@example.com"
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            If they already have an account they become admin immediately;
            otherwise you&apos;ll get an invite link to send them.
          </p>
        </div>

        {state.status === 'error' && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create group'}
        </button>
      </form>

      {state.status === 'success' && (
        <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 p-4 space-y-3">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Group created.{' '}
            <Link href={`/g/${state.slug}/admin`} className="underline">
              Manage it →
            </Link>
          </p>
          {inviteUrl && (
            <div>
              <p className="text-sm text-green-800 dark:text-green-200 mb-1">
                The admin doesn&apos;t have an account yet — send them this invite link:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs break-all px-2 py-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  {inviteUrl}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition whitespace-nowrap"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
