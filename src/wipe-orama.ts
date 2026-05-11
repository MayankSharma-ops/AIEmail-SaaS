import { Prisma, PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
    const res = await db.account.updateMany({
        data: {
            binaryIndex: Prisma.DbNull
        }
    });
    console.log(`Wiped ${res.count} account indexes.`);
}

main().catch(console.error).finally(() => db.$disconnect());
