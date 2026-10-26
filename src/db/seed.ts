import { ensureSystemCategories } from "./seed-categories";

ensureSystemCategories()
  .then(() => {
    console.info("System categories ensured.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
