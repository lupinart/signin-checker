import { access } from "node:fs/promises";

const requiredPages = ["dist/index.html", "dist/admin.html"];

for (const page of requiredPages) {
  await access(page);
}

console.log(`Verified ${requiredPages.length} published pages.`);
