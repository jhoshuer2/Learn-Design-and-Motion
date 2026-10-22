import { PrismaClient } from "@prisma/client";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";

const db = new PrismaClient();
publishContent(db, loadContent())
  .then(() => console.log("seed ok"))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
