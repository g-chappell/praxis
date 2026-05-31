import { type NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

export const config = {
  // Only gate /dashboard. The matcher MUST NOT include /signin or
  // /api/auth, or sign-in itself would redirect to itself.
  matcher: ['/dashboard/:path*'],
};

export function middleware(request: NextRequest) {
  // Cookie-presence check only. The dashboard page itself validates the
  // session against the DB via `getAuth().api.getSession()` — that's the
  // canonical guard. Middleware just spares the trip when the user is
  // obviously not signed in.
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL('/signin', request.url);
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
