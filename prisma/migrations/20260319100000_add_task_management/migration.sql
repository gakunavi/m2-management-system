-- CreateTable: tasks
CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "task_no" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'todo',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "due_date" DATE,
    "created_by_id" INTEGER NOT NULL,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'company',
    "business_id" INTEGER,
    "board_id" INTEGER,
    "column_id" INTEGER,
    "parent_task_id" INTEGER,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "related_entity_type" VARCHAR(20),
    "related_entity_id" INTEGER,
    "notify_level" VARCHAR(20) NOT NULL DEFAULT 'in_app',
    "memo" TEXT,
    "task_url" VARCHAR(500),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: task_attachments
CREATE TABLE "task_attachments" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_key" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "uploaded_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: task_assignees
CREATE TABLE "task_assignees" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "user_name" VARCHAR(100) NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable: task_tags
CREATE TABLE "task_tags" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable: task_tag_on_tasks
CREATE TABLE "task_tag_on_tasks" (
    "task_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "task_tag_on_tasks_pkey" PRIMARY KEY ("task_id","tag_id")
);

-- CreateTable: task_notify_targets
CREATE TABLE "task_notify_targets" (
    "task_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "task_notify_targets_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable: task_columns
CREATE TABLE "task_columns" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "scope" VARCHAR(20) NOT NULL,
    "business_id" INTEGER,
    "board_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable: task_boards
CREATE TABLE "task_boards" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable: task_board_members
CREATE TABLE "task_board_members" (
    "board_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_board_members_pkey" PRIMARY KEY ("board_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_task_no_key" ON "tasks"("task_no");
CREATE INDEX "tasks_status_due_date_idx" ON "tasks"("status", "due_date");
CREATE INDEX "tasks_business_id_scope_status_idx" ON "tasks"("business_id", "scope", "status");
CREATE INDEX "tasks_board_id_status_idx" ON "tasks"("board_id", "status");
CREATE INDEX "tasks_column_id_sort_order_idx" ON "tasks"("column_id", "sort_order");
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks"("parent_task_id");
CREATE INDEX "tasks_related_entity_type_related_entity_id_idx" ON "tasks"("related_entity_type", "related_entity_id");
CREATE INDEX "tasks_is_archived_status_idx" ON "tasks"("is_archived", "status");

CREATE INDEX "task_attachments_task_id_idx" ON "task_attachments"("task_id");

CREATE UNIQUE INDEX "task_assignees_task_id_user_id_key" ON "task_assignees"("task_id", "user_id");
CREATE INDEX "task_assignees_user_id_idx" ON "task_assignees"("user_id");
CREATE INDEX "task_assignees_task_id_idx" ON "task_assignees"("task_id");

CREATE UNIQUE INDEX "task_tags_name_scope_owner_id_key" ON "task_tags"("name", "scope", "owner_id");
CREATE INDEX "task_tags_scope_idx" ON "task_tags"("scope");

CREATE INDEX "task_columns_scope_business_id_idx" ON "task_columns"("scope", "business_id");
CREATE INDEX "task_columns_board_id_sort_order_idx" ON "task_columns"("board_id", "sort_order");

CREATE INDEX "task_boards_created_by_id_idx" ON "task_boards"("created_by_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "task_boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "task_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_tag_on_tasks" ADD CONSTRAINT "task_tag_on_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_tag_on_tasks" ADD CONSTRAINT "task_tag_on_tasks_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "task_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_notify_targets" ADD CONSTRAINT "task_notify_targets_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_notify_targets" ADD CONSTRAINT "task_notify_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "task_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_board_members" ADD CONSTRAINT "task_board_members_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "task_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_board_members" ADD CONSTRAINT "task_board_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
