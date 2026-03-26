import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow unrestricted access to the login page and the login API
  if (pathname === '/login' || pathname === '/api/auth/login') {
    return NextResponse.next();
  }

  // Check for the authentication cookie
  const authToken = req.cookies.get('srs_auth_token')?.value;

  if (authToken === 'authenticated') {
    return NextResponse.next();
  }

  // If not authenticated, redirect to the login page
  const loginUrl = new URL('/login', req.url);
  return NextResponse.redirect(loginUrl);
}

// This config tells the middleware to protect EVERY page, 
// but ignore static files like images and Next.js background scripts so it doesn't crash.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};