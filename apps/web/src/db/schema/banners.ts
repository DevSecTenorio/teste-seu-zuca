import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const banners = pgTable("banners", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  highlight: text("highlight"),
  subtitle: text("subtitle"),
  imageUrl: text("image_url").notNull(),
  link: text("link"),
  // Admin can bake the title/highlight/subtitle into the uploaded image itself and turn this off
  // to avoid showing the text twice over the banner.
  showTitle: boolean("show_title").notNull().default(true),
  order: integer("order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
