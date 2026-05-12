'use server'

import { getGoogleAuthorizationUrl as getAuthUrl } from "@/lib/google";

export async function getGoogleAuthUrlAction() {
    try {
        return await getAuthUrl();
    } catch (error) {
        console.error("Failed to generate Google Auth URL:", error);
        throw error;
    }
}
