import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to view your profile." }, { status: 401 });
  try {
    const result = await db.query(`SELECT phone, to_char(birthday, 'YYYY-MM-DD') AS birthday, profile_image AS "profileImage", banner_image AS "bannerImage", updated_at AS "updatedAt" FROM account_profiles WHERE user_id=$1`, [session.user.id]);
    const profile = result.rows[0] ?? { phone: "", birthday: null, profileImage: "", bannerImage: "" };
    if (!profile.profileImage) profile.profileImage = session.user.image ?? "";
    return Response.json({ profile });
  } catch { return Response.json({ error: "Could not load account details." }, { status: 503 }); }
}
export async function PUT(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user) return Response.json({ error: "Sign in to update your profile." }, { status: 401 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "Enter valid profile details." }, { status: 400 });
    const value = body as Record<string, unknown>;
    const name = typeof value.name === "string" ? value.name.trim() : session.user.name.trim();
    const phone = typeof value.phone === "string" ? value.phone.trim() : "";
    const birthday = typeof value.birthday === "string" && value.birthday ? value.birthday : null;
    const profileImage = typeof value.profileImage === "string" ? value.profileImage : "";
    const bannerImage = typeof value.bannerImage === "string" ? value.bannerImage : "";
    const image = typeof value.image === "string" ? value.image : profileImage || null;
    const validMedia = (media: string) => media === "" || (media.startsWith("data:image/jpeg;base64,") && media.length <= 1_250_000);
    if (!name || name.length > 100 || (image !== null && image.length > 1_250_000) || phone.length > 40 || (birthday !== null && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) || !validMedia(profileImage) || !validMedia(bannerImage)) return Response.json({ error: "Check your name, contact details, and image sizes before saving." }, { status: 400 });

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const profile = await client.query(`INSERT INTO account_profiles (user_id,phone,birthday,profile_image,banner_image) VALUES ($1,$2,$3::date,$4,$5) ON CONFLICT (user_id) DO UPDATE SET phone=EXCLUDED.phone,birthday=EXCLUDED.birthday,profile_image=EXCLUDED.profile_image,banner_image=EXCLUDED.banner_image,updated_at=now() RETURNING phone,to_char(birthday, 'YYYY-MM-DD') AS birthday,profile_image AS "profileImage",banner_image AS "bannerImage",updated_at AS "updatedAt"`, [session.user.id, phone, birthday, profileImage, bannerImage]);
      await client.query(`UPDATE "user" SET name=$2,image=$3,"updatedAt"=now() WHERE id=$1`, [session.user.id, name, image]);
      await client.query("COMMIT");
      return Response.json({ profile: profile.rows[0], user: { name, image } });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch { return Response.json({ error: "Could not save account details." }, { status: 503 }); }
}
