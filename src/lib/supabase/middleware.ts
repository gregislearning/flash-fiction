import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Cross-group super-admin surface (group creation) — site-wide is_admin only.
  const isSuperAdminRoute = pathname.startsWith('/admin')

  // Per-group admin surface (prompt management + invites) — the group admin of
  // that slug OR a super-admin. The slug is in the path, so the guard can
  // authorize against it via the same is_group_admin the DB RLS uses.
  const groupAdminMatch = pathname.match(/^\/g\/([^/]+)\/admin(?:\/|$)/)

  if (isSuperAdminRoute || groupAdminMatch) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/signin'
      return NextResponse.redirect(url)
    }

    const isSuperAdmin = user.user_metadata?.is_admin === true
    let authorized = isSuperAdmin

    if (!authorized && groupAdminMatch) {
      // Resolve slug → group id, then defer to is_group_admin (membership role).
      const slug = decodeURIComponent(groupAdminMatch[1])
      const { data: group } = await supabase
        .from('groups')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (group) {
        const { data: isAdmin } = await supabase.rpc('is_group_admin', {
          g: group.id,
          u: user.id,
        })
        authorized = isAdmin === true
      }
    }

    if (!authorized) {
      const url = request.nextUrl.clone()
      url.pathname = groupAdminMatch ? `/g/${decodeURIComponent(groupAdminMatch[1])}` : '/'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
