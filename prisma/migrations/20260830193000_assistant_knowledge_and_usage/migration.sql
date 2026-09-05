CREATE TABLE "assistant_knowledge_articles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "visible_roles" TEXT NOT NULL DEFAULT 'ALL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "assistant_knowledge_articles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "assistant_knowledge_articles_active_category_idx" ON "assistant_knowledge_articles"("active", "category");

CREATE TABLE "assistant_usage_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "question" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "assistant_usage_events_user_id_created_at_idx" ON "assistant_usage_events"("user_id", "created_at");
