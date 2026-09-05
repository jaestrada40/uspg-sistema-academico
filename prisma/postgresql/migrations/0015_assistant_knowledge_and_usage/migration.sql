CREATE TABLE "assistant_knowledge_articles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "visible_roles" TEXT NOT NULL DEFAULT 'ALL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "assistant_knowledge_articles_active_category_idx" ON "assistant_knowledge_articles"("active", "category");

CREATE TABLE "assistant_usage_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "conversation_id" TEXT,
  "question" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "assistant_usage_events_user_id_created_at_idx" ON "assistant_usage_events"("user_id", "created_at");
