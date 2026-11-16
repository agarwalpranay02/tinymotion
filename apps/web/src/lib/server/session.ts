import "server-only";
import { headers } from "next/headers";
import { getAuth } from "./auth";

export async function getSession() {
  try {
    const auth = await getAuth();
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
}
