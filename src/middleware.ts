import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // --- COOKIE CHECK REMOVED ---
  // iOS Safari aggressively deletes client-side cookies in PWAs.
  // If we check for 'srs_auth_token' here, it will falsely kick you to /login.
  // Instead, we let our SessionGuard component handle auth on the client side 
  // where it can safely read the highly-persistent localStorage token.

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};