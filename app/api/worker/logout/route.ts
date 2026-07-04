import { NextResponse } from 'next/server';
import { sessionCookieOptions } from '@/lib/workerAuth';

// POST /api/worker/logout — clear the worker session and go home.
export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL('/', req.url), { status: 303 });
  const { name, ...options } = sessionCookieOptions();
  res.cookies.set(name, '', { ...options, maxAge: 0 });
  return res;
}
