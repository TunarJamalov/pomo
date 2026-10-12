import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const actionId = request.headers.get("next-action");

  if (request.method === "POST" && actionId && actionId.length < 20) {
    return new NextResponse("Invalid Server Action", { status: 400 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
