export default function Loading() {
  return (
    <main className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-900 dark:border-t-white rounded-full animate-spin" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Searching…</p>
      </div>
    </main>
  )
}
