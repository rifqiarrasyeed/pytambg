import { cookies } from "next/headers";

export async function POST() {
  const store = await cookies();
  store.delete("mbg_active_tenant");
  return Response.json({ ok: true, message: "Logout client harus memanggil next-auth signOut()." });
}

