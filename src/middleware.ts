import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // Grab the authorization header from the incoming request
  const basicAuth = req.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');

    // We pull the credentials from your environment variables, 
    // with fallbacks just in case you forget to set them in Vercel.
    const validUser = process.env.BASIC_AUTH_USER || 'emmett';
    const validPass = process.env.BASIC_AUTH_PASS || 'albania2026';

    if (user === validUser && pwd === validPass) {
      return NextResponse.next();
    }
  }

  // If no auth header or wrong credentials, trigger the browser's native login popup
  return new NextResponse('Authentication required to access this application.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  });
}

// This config tells the middleware to protect EVERY page, 
// but ignore static files like images and Next.js background scripts so it doesn't crash.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};