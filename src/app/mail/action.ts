'use server'

import { getGoogleAuthorizationUrl as getAuthUrl } from "@/lib/google";

export async function getGoogleAuthUrlAction() {
    return await getAuthUrl();
}
