import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'

  if (code) {
    const supabaseResponse = NextResponse.redirect(new URL(next, requestUrl.origin))

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    await supabase.auth.exchangeCodeForSession(code)

    // Belt-and-suspenders invite auto-claim: now that the email is verified,
    // join the user to any group they have an open invite for. Idempotent and
    // verified-email-gated in the DB (claim_my_invitations). Fail soft — a claim
    // hiccup must never block sign-in; the empty-state "Accept" button backstops.
    try {
      await supabase.rpc('claim_my_invitations')
    } catch {
      // ignore — membership can still be claimed from the invite link / empty state
    }

    return supabaseResponse
  }

  // No code: redirect to sign-in
  return NextResponse.redirect(new URL('/auth/signin', requestUrl.origin))
}
