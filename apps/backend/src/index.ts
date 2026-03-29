import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { cookie } from "@elysiajs/cookie";
import { prisma } from "../prisma/db";
import { createOAuthClient, getAuthUrl } from "./auth";
import { getCourses, getCourseWorks, getSubmissions } from "./classroom";
import type { ApiResponse, HealthCheck, User } from "shared";

// Simple in-memory token store (ganti dengan database/session untuk production)
const tokenStore = new Map<string, { access_token: string; refresh_token?: string }>();

const app = new Elysia()
  // !!! 1. Modifikasi CORS agar dapat diakses oleh web frontend deployment HTTPS
  .use(
    cors({
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true, // WAJIB untuk /auth/me yang mengecek session/cookie
      allowedHeaders: ["Content-Type", "Authorization"]
    })
  )
  .use(swagger())
  .use(cookie())

  // !!! 2. Tambahkan onRequest ini untuk beri pengamanan API_KEY data `/users`
  .onRequest(({ request, set }) => {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/users")) {
      const origin = request.headers.get("origin");
      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
      const key = url.searchParams.get("key");

      // 1. Izinkan jika datang dari Frontend resmi (AJAX/Fetch)
      if (origin === frontendUrl) {
        return;
      }

      // 2. Jika tidak dari Frontend, WAJIB cek API_KEY
      if (key !== process.env.API_KEY) {
        set.status = 401;
        return { message: "Unauthorized: Access denied without valid API Key" };
      }
    }
  })

  // Health check
  .get("/", (): ApiResponse<HealthCheck> => ({
    data: { status: "ok" },
    message: "server running",
  }))

  // Users (dari Phase 2)
  .get("/users", async () => {
    const users = await prisma.user.findMany();
    const response: ApiResponse<User[]> = {
      data: users,
      message: "User list retrieved",
    };
    return response;
  })

  // --- AUTH ROUTES ---

  // Redirect mahasiswa ke halaman login Google
  .get("/auth/login", ({ redirect }) => {
    const oauth2Client = createOAuthClient();
    const url = getAuthUrl(oauth2Client);
    return redirect(url);
  })

  // Google callback setelah login
  .get("/auth/callback", async ({ query, set, cookie: { session }, redirect }) => {
    const { code } = query as { code: string };

    if (!code) {
      set.status = 400;
      return { error: "Missing authorization code" };
    }

    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    // Simpan token dengan session ID sederhana
    const sessionId = crypto.randomUUID();
    tokenStore.set(sessionId, {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? undefined,
    });
    
    if (!session) return;

    // Set cookie session
    session.value = sessionId;
    session.maxAge = 60 * 60 * 24; // 1 hari
    session.path = "/";

    // !!! 3. Tambahkan KONFIGURASI PRODUCTION
    session.httpOnly = true;
    session.secure = true;    // WAJIB: Cookie hanya dikirim lewat HTTPS
    session.sameSite = "none"; // WAJIB: Agar cookie bisa dikirim antar domain berbeda

    // Redirect ke frontend menggunakan env variable
    return redirect(`${process.env.FRONTEND_URL}/classroom`);
  })

  // Cek status login
  .get("/auth/me", ({ cookie: { session } }) => {
    const sessionId = session?.value as string;
    if (!sessionId || !tokenStore.has(sessionId)) {
      return { loggedIn: false };
    }
    return { loggedIn: true, sessionId };
  })

  // Logout
  .post("/auth/logout", ({ cookie: { session } }) => {
    if(!session) return { success: false };

    const sessionId = session?.value as string;
    if (sessionId) {
      tokenStore.delete(sessionId);
      session.remove();
    }
    return { success: true };
  })

  // --- CLASSROOM ROUTES ---

  // Ambil daftar courses mahasiswa
  .get("/classroom/courses", async ({ cookie: { session }, set }) => {
    const sessionId = session?.value as string;
    const tokens = sessionId ? tokenStore.get(sessionId) : null;

    if (!tokens) {
      set.status = 401;
      return { error: "Unauthorized. Silakan login terlebih dahulu." };
    }

    const courses = await getCourses(tokens.access_token);
    return { data: courses, message: "Courses retrieved" };
  })

  // Ambil coursework + submisi untuk satu course
  .get("/classroom/courses/:courseId/submissions", async ({ params, cookie: { session }, set }) => {
    const sessionId = session?.value as string;
    const tokens = sessionId ? tokenStore.get(sessionId) : null;

    if (!tokens) {
      set.status = 401;
      return { error: "Unauthorized. Silakan login terlebih dahulu." };
    }

    const { courseId } = params;

    const [courseWorks, submissions] = await Promise.all([
      getCourseWorks(tokens.access_token, courseId),
      getSubmissions(tokens.access_token, courseId),
    ]);

    // Gabungkan coursework dengan submisi
    const submissionMap = new Map(submissions.map((s) => [s.courseWorkId, s]));

    const result = courseWorks.map((cw) => ({
      courseWork: cw,
      submission: submissionMap.get(cw.id) ?? null,
    }));

    return { data: result, message: "Course submissions retrieved" };
  });

// !!! 4. Logging khusus mode non-production
if (process.env.NODE_ENV != "production") {
  app.listen(3000);
  console.log(`🦊 Backend → http://localhost:3000`);
  console.log(`🦊 FRONTEND_URL → ${process.env.FRONTEND_URL}`);
  console.log(`🦊 DATABASE_URL: ${process.env.DATABASE_URL}`);
  console.log(`🦊 GOOGLE_REDIRECT_URI: ${process.env.GOOGLE_REDIRECT_URI}`);
}

// !!! 5. Tambahkan export agar Elysia dapat dibaca Vercel serverless
export default app;
export type App = typeof app;

// test vercel 3
