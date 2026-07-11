-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "user_email" VARCHAR(255) NOT NULL,
    "user_password_hash" VARCHAR(255) NOT NULL,
    "user_password_encrypted" VARCHAR(512),
    "user_name" VARCHAR(100) NOT NULL,
    "user_role" VARCHAR(20) NOT NULL,
    "user_partner_id" INTEGER,
    "user_is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" SERIAL NOT NULL,
    "business_code" VARCHAR(20) NOT NULL,
    "business_name" VARCHAR(100) NOT NULL,
    "business_description" TEXT,
    "business_config" JSONB NOT NULL DEFAULT '{}',
    "business_is_active" BOOLEAN NOT NULL DEFAULT true,
    "business_sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_status_definitions" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "status_code" VARCHAR(50) NOT NULL,
    "status_label" VARCHAR(100) NOT NULL,
    "status_priority" INTEGER NOT NULL,
    "status_color" VARCHAR(20),
    "status_is_final" BOOLEAN NOT NULL DEFAULT false,
    "status_is_lost" BOOLEAN NOT NULL DEFAULT false,
    "status_sort_order" INTEGER NOT NULL DEFAULT 0,
    "status_is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_status_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movement_templates" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "step_number" INTEGER NOT NULL,
    "step_code" VARCHAR(50) NOT NULL,
    "step_name" VARCHAR(100) NOT NULL,
    "step_description" TEXT,
    "step_is_sales_linked" BOOLEAN NOT NULL DEFAULT false,
    "step_linked_status_code" VARCHAR(50),
    "step_linked_field_key" VARCHAR(100),
    "step_config" JSONB NOT NULL DEFAULT '{}',
    "step_is_active" BOOLEAN NOT NULL DEFAULT true,
    "visible_to_partner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "movement_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_business_assignments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "assignment_role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_business_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_table_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "table_key" VARCHAR(100) NOT NULL,
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_table_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_table_views" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "table_key" VARCHAR(100) NOT NULL,
    "view_name" VARCHAR(100) NOT NULL,
    "settings" JSONB NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saved_table_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industries" (
    "id" SERIAL NOT NULL,
    "industry_name" VARCHAR(100) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "customer_code" VARCHAR(20) NOT NULL,
    "customer_name" VARCHAR(200) NOT NULL,
    "customer_salutation" VARCHAR(100),
    "customer_type" VARCHAR(20) NOT NULL DEFAULT '未設定',
    "customer_postal_code" VARCHAR(10),
    "customer_address" TEXT,
    "customer_phone" VARCHAR(20),
    "customer_fax" VARCHAR(20),
    "customer_email" VARCHAR(255),
    "customer_website" VARCHAR(500),
    "customer_corporate_number" VARCHAR(13),
    "customer_invoice_number" VARCHAR(14),
    "customer_capital" BIGINT,
    "customer_established_date" DATE,
    "customer_folder_url" VARCHAR(500),
    "customer_fiscal_month" SMALLINT,
    "customer_notes" TEXT,
    "customer_custom_data" JSONB NOT NULL DEFAULT '{}',
    "customer_is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "industry_id" INTEGER,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "contact_name" VARCHAR(100) NOT NULL,
    "contact_department" VARCHAR(100),
    "contact_position" VARCHAR(100),
    "contact_is_representative" BOOLEAN NOT NULL DEFAULT false,
    "contact_phone" VARCHAR(20),
    "contact_fax" VARCHAR(20),
    "contact_email" VARCHAR(255),
    "contact_business_card_front_url" VARCHAR(500),
    "contact_business_card_back_url" VARCHAR(500),
    "contact_is_primary" BOOLEAN NOT NULL DEFAULT false,
    "contact_sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contact_business_links" (
    "id" SERIAL NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_contact_business_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_business_links" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "link_status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "link_custom_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_business_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_business_links" (
    "id" SERIAL NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "link_status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "commission_rate" DECIMAL(5,2),
    "contact_person" VARCHAR(100),
    "link_custom_data" JSONB NOT NULL DEFAULT '{}',
    "business_tier" VARCHAR(50),
    "business_tier_number" VARCHAR(50),
    "business_parent_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "partner_business_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" SERIAL NOT NULL,
    "partner_code" VARCHAR(20) NOT NULL,
    "partner_tier" VARCHAR(50),
    "partner_name" VARCHAR(200) NOT NULL,
    "partner_salutation" VARCHAR(100),
    "partner_type" VARCHAR(20) NOT NULL DEFAULT '未設定',
    "partner_postal_code" VARCHAR(10),
    "partner_address" TEXT,
    "partner_phone" VARCHAR(20),
    "partner_fax" VARCHAR(20),
    "partner_email" VARCHAR(255),
    "partner_website" VARCHAR(500),
    "partner_established_date" DATE,
    "industry_id" INTEGER,
    "partner_folder_url" VARCHAR(500),
    "partner_notes" TEXT,
    "partner_custom_data" JSONB NOT NULL DEFAULT '{}',
    "partner_is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "parent_id" INTEGER,
    "partner_tier_number" VARCHAR(50),
    "partner_bp_form_key" VARCHAR(500),
    "partner_bp_form_url" VARCHAR(500),
    "partner_capital" BIGINT,
    "partner_corporate_number" VARCHAR(13),
    "partner_invoice_number" VARCHAR(14),

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_contacts" (
    "id" SERIAL NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "contact_name" VARCHAR(100) NOT NULL,
    "contact_department" VARCHAR(100),
    "contact_position" VARCHAR(100),
    "contact_is_representative" BOOLEAN NOT NULL DEFAULT false,
    "contact_phone" VARCHAR(20),
    "contact_fax" VARCHAR(20),
    "contact_email" VARCHAR(255),
    "contact_business_card_front_url" VARCHAR(500),
    "contact_business_card_back_url" VARCHAR(500),
    "contact_is_primary" BOOLEAN NOT NULL DEFAULT false,
    "contact_sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_contact_business_links" (
    "id" SERIAL NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "business_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_contact_business_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_bank_accounts" (
    "id" SERIAL NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "business_id" INTEGER,
    "bank_name" VARCHAR(100) NOT NULL,
    "branch_name" VARCHAR(100) NOT NULL,
    "account_type" VARCHAR(10) NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "account_holder" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "partner_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_bank_accounts" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "business_id" INTEGER,
    "bank_name" VARCHAR(100) NOT NULL,
    "branch_name" VARCHAR(100) NOT NULL,
    "account_type" VARCHAR(10) NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "account_holder" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "partner_id" INTEGER,
    "project_no" VARCHAR(30) NOT NULL,
    "project_sales_status" VARCHAR(50) NOT NULL,
    "project_expected_close_month" VARCHAR(7),
    "project_assigned_user_id" INTEGER,
    "project_notes" TEXT,
    "project_custom_data" JSONB NOT NULL DEFAULT '{}',
    "project_status_changed_at" TIMESTAMPTZ(6),
    "project_is_active" BOOLEAN NOT NULL DEFAULT true,
    "portal_visible" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "project_assigned_user_name" VARCHAR(100),
    "project_renovation_number" VARCHAR(100),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_movements" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "template_id" INTEGER NOT NULL,
    "movement_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "movement_started_at" TIMESTAMPTZ(6),
    "movement_completed_at" TIMESTAMPTZ(6),
    "movement_notes" TEXT,
    "movement_data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "project_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_comments" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "comment_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,

    CONSTRAINT "project_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_files" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_storage_key" VARCHAR(500) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_mime_type" VARCHAR(100) NOT NULL,
    "file_category" VARCHAR(100),
    "file_description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_targets" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "target_month" VARCHAR(7) NOT NULL,
    "target_amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL,
    "kpi_key" VARCHAR(50) NOT NULL DEFAULT 'revenue',

    CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_categories" (
    "id" SERIAL NOT NULL,
    "category_name" VARCHAR(100) NOT NULL,
    "category_description" TEXT,
    "category_sort_order" INTEGER NOT NULL DEFAULT 0,
    "category_is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,

    CONSTRAINT "qa_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_items" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "business_id" INTEGER,
    "item_title" VARCHAR(200) NOT NULL,
    "item_question" TEXT NOT NULL,
    "item_answer" TEXT NOT NULL,
    "item_status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "item_is_public" BOOLEAN NOT NULL DEFAULT false,
    "item_view_count" INTEGER NOT NULL DEFAULT 0,
    "item_sort_order" INTEGER NOT NULL DEFAULT 0,
    "item_published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "qa_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_attachments" (
    "id" SERIAL NOT NULL,
    "qa_item_id" INTEGER NOT NULL,
    "attachment_name" VARCHAR(255) NOT NULL,
    "attachment_original_name" VARCHAR(255) NOT NULL,
    "attachment_storage_key" VARCHAR(500) NOT NULL,
    "attachment_url" VARCHAR(500) NOT NULL,
    "attachment_size" INTEGER NOT NULL,
    "attachment_mime_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" INTEGER,

    CONSTRAINT "qa_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" SERIAL NOT NULL,
    "inquiry_subject" VARCHAR(200) NOT NULL,
    "inquiry_body" TEXT NOT NULL,
    "inquiry_status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "inquiry_business_id" INTEGER,
    "inquiry_category_id" INTEGER,
    "inquiry_project_id" INTEGER,
    "inquiry_assigned_user_id" INTEGER,
    "inquiry_response" TEXT,
    "inquiry_responded_at" TIMESTAMPTZ(6),
    "inquiry_responded_by" INTEGER,
    "inquiry_is_converted_to_qa" BOOLEAN NOT NULL DEFAULT false,
    "inquiry_converted_qa_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_attachments" (
    "id" SERIAL NOT NULL,
    "inquiry_id" INTEGER NOT NULL,
    "attachment_name" VARCHAR(255) NOT NULL,
    "attachment_original_name" VARCHAR(255) NOT NULL,
    "attachment_storage_key" VARCHAR(500) NOT NULL,
    "attachment_url" VARCHAR(500) NOT NULL,
    "attachment_size" INTEGER NOT NULL,
    "attachment_mime_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" INTEGER,

    CONSTRAINT "inquiry_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notification_type" VARCHAR(30) NOT NULL,
    "notification_title" VARCHAR(200) NOT NULL,
    "notification_message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "related_entity" VARCHAR(50),
    "related_entity_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_documents" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "partner_id" INTEGER,
    "document_type" VARCHAR(20) NOT NULL,
    "document_title" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_storage_key" VARCHAR(500) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_mime_type" VARCHAR(100) NOT NULL,
    "target_month" VARCHAR(7),
    "document_description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,
    "last_notified_at" TIMESTAMPTZ(6),
    "last_notified_by" INTEGER,
    "document_sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "business_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_reminders" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "assigned_to" INTEGER NOT NULL,
    "reminder_date" DATE NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "notify_email" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMPTZ(6),
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(6),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "target_scope" VARCHAR(20) NOT NULL DEFAULT 'internal',
    "published_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "business_id" INTEGER,
    "title" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "table_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" SERIAL NOT NULL,
    "setting_key" VARCHAR(100) NOT NULL,
    "setting_value" TEXT NOT NULL,
    "is_encrypted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "task_assignees" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "user_name" VARCHAR(100) NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "task_tag_on_tasks" (
    "task_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "task_tag_on_tasks_pkey" PRIMARY KEY ("task_id","tag_id")
);

-- CreateTable
CREATE TABLE "task_notify_targets" (
    "task_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "task_notify_targets_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "task_boards" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_board_members" (
    "board_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "tab_order" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_board_members_pkey" PRIMARY KEY ("board_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_user_email_key" ON "users"("user_email");

-- CreateIndex
CREATE INDEX "users_user_role_idx" ON "users"("user_role");

-- CreateIndex
CREATE INDEX "users_user_is_active_idx" ON "users"("user_is_active");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_business_code_key" ON "businesses"("business_code");

-- CreateIndex
CREATE INDEX "businesses_business_is_active_business_sort_order_idx" ON "businesses"("business_is_active", "business_sort_order");

-- CreateIndex
CREATE INDEX "idx_businesses_code_active" ON "businesses"("business_code", "business_is_active");

-- CreateIndex
CREATE INDEX "idx_businesses_sort_order" ON "businesses"("business_sort_order");

-- CreateIndex
CREATE INDEX "idx_business_statuses_sort" ON "business_status_definitions"("business_id", "status_sort_order");

-- CreateIndex
CREATE INDEX "idx_business_statuses_final" ON "business_status_definitions"("business_id", "status_is_final");

-- CreateIndex
CREATE INDEX "idx_business_statuses_lost" ON "business_status_definitions"("business_id", "status_is_lost");

-- CreateIndex
CREATE UNIQUE INDEX "business_status_definitions_business_id_status_code_key" ON "business_status_definitions"("business_id", "status_code");

-- CreateIndex
CREATE INDEX "idx_movement_templates_sort" ON "movement_templates"("business_id", "step_number");

-- CreateIndex
CREATE UNIQUE INDEX "movement_templates_business_id_step_number_key" ON "movement_templates"("business_id", "step_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_template_business_code" ON "movement_templates"("business_id", "step_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_business_assignments_user_id_business_id_key" ON "user_business_assignments"("user_id", "business_id");

-- CreateIndex
CREATE INDEX "user_table_preferences_user_id_idx" ON "user_table_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_table_preferences_user_id_table_key_key" ON "user_table_preferences"("user_id", "table_key");

-- CreateIndex
CREATE INDEX "saved_table_views_user_id_table_key_idx" ON "saved_table_views"("user_id", "table_key");

-- CreateIndex
CREATE INDEX "saved_table_views_table_key_is_shared_idx" ON "saved_table_views"("table_key", "is_shared");

-- CreateIndex
CREATE UNIQUE INDEX "industries_industry_name_key" ON "industries"("industry_name");

-- CreateIndex
CREATE INDEX "industries_is_active_display_order_idx" ON "industries"("is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");

-- CreateIndex
CREATE INDEX "idx_customers_code_active" ON "customers"("customer_code", "customer_is_active");

-- CreateIndex
CREATE INDEX "idx_customers_name" ON "customers"("customer_name");

-- CreateIndex
CREATE INDEX "idx_customers_industry_id" ON "customers"("industry_id");

-- CreateIndex
CREATE INDEX "idx_customers_type" ON "customers"("customer_type");

-- CreateIndex
CREATE INDEX "idx_customers_created_at" ON "customers"("created_at");

-- CreateIndex
CREATE INDEX "idx_customers_active_updated" ON "customers"("customer_is_active", "updated_at");

-- CreateIndex
CREATE INDEX "customer_contacts_customer_id_idx" ON "customer_contacts"("customer_id");

-- CreateIndex
CREATE INDEX "idx_contact_business_links_business" ON "customer_contact_business_links"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_contact_business_links_contact_id_business_id_key" ON "customer_contact_business_links"("contact_id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_business_links_customer_id_business_id_key" ON "customer_business_links"("customer_id", "business_id");

-- CreateIndex
CREATE INDEX "idx_partner_business_links_business" ON "partner_business_links"("business_id");

-- CreateIndex
CREATE INDEX "idx_partner_business_links_biz_tier" ON "partner_business_links"("business_id", "business_tier");

-- CreateIndex
CREATE INDEX "idx_partner_business_links_biz_parent" ON "partner_business_links"("business_parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_business_links_partner_id_business_id_key" ON "partner_business_links"("partner_id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_partner_code_key" ON "partners"("partner_code");

-- CreateIndex
CREATE INDEX "idx_partners_code_active" ON "partners"("partner_code", "partner_is_active");

-- CreateIndex
CREATE INDEX "idx_partners_name" ON "partners"("partner_name");

-- CreateIndex
CREATE INDEX "idx_partners_industry_id" ON "partners"("industry_id");

-- CreateIndex
CREATE INDEX "idx_partners_type" ON "partners"("partner_type");

-- CreateIndex
CREATE INDEX "idx_partners_created_at" ON "partners"("created_at");

-- CreateIndex
CREATE INDEX "idx_partners_active_updated" ON "partners"("partner_is_active", "updated_at");

-- CreateIndex
CREATE INDEX "idx_partners_parent_id" ON "partners"("parent_id");

-- CreateIndex
CREATE INDEX "idx_partners_tier_number" ON "partners"("partner_tier_number");

-- CreateIndex
CREATE INDEX "partner_contacts_partner_id_idx" ON "partner_contacts"("partner_id");

-- CreateIndex
CREATE INDEX "idx_partner_contact_business_links_business" ON "partner_contact_business_links"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_contact_business_links_contact_id_business_id_key" ON "partner_contact_business_links"("contact_id", "business_id");

-- CreateIndex
CREATE INDEX "idx_partner_bank_accounts_partner" ON "partner_bank_accounts"("partner_id");

-- CreateIndex
CREATE INDEX "idx_customer_bank_accounts_customer" ON "customer_bank_accounts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_no_key" ON "projects"("project_no");

-- CreateIndex
CREATE INDEX "idx_projects_business_status" ON "projects"("business_id", "project_sales_status");

-- CreateIndex
CREATE INDEX "idx_projects_customer_id" ON "projects"("customer_id");

-- CreateIndex
CREATE INDEX "idx_projects_partner_id" ON "projects"("partner_id");

-- CreateIndex
CREATE INDEX "idx_projects_assigned_user_id" ON "projects"("project_assigned_user_id");

-- CreateIndex
CREATE INDEX "idx_projects_no" ON "projects"("project_no");

-- CreateIndex
CREATE INDEX "idx_projects_status_changed" ON "projects"("project_status_changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_project_movements_project" ON "project_movements"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_movements_project_id_template_id_key" ON "project_movements"("project_id", "template_id");

-- CreateIndex
CREATE INDEX "project_comments_project_id_created_at_idx" ON "project_comments"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_project_files_project_id" ON "project_files"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_files_project_category" ON "project_files"("project_id", "file_category");

-- CreateIndex
CREATE INDEX "idx_sales_targets_business_month_kpi" ON "sales_targets"("business_id", "target_month", "kpi_key");

-- CreateIndex
CREATE UNIQUE INDEX "sales_targets_business_id_target_month_kpi_key_key" ON "sales_targets"("business_id", "target_month", "kpi_key");

-- CreateIndex
CREATE INDEX "qa_categories_category_is_active_category_sort_order_idx" ON "qa_categories"("category_is_active", "category_sort_order");

-- CreateIndex
CREATE INDEX "qa_items_category_id_item_sort_order_idx" ON "qa_items"("category_id", "item_sort_order");

-- CreateIndex
CREATE INDEX "qa_items_item_status_idx" ON "qa_items"("item_status");

-- CreateIndex
CREATE INDEX "qa_items_business_id_idx" ON "qa_items"("business_id");

-- CreateIndex
CREATE INDEX "qa_attachments_qa_item_id_idx" ON "qa_attachments"("qa_item_id");

-- CreateIndex
CREATE INDEX "inquiries_inquiry_status_idx" ON "inquiries"("inquiry_status");

-- CreateIndex
CREATE INDEX "inquiries_inquiry_business_id_idx" ON "inquiries"("inquiry_business_id");

-- CreateIndex
CREATE INDEX "inquiries_inquiry_category_id_idx" ON "inquiries"("inquiry_category_id");

-- CreateIndex
CREATE INDEX "inquiries_created_by_idx" ON "inquiries"("created_by");

-- CreateIndex
CREATE INDEX "inquiries_inquiry_assigned_user_id_idx" ON "inquiries"("inquiry_assigned_user_id");

-- CreateIndex
CREATE INDEX "inquiry_attachments_inquiry_id_idx" ON "inquiry_attachments"("inquiry_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_user_id_endpoint_key" ON "push_subscriptions"("user_id", "endpoint");

-- CreateIndex
CREATE INDEX "business_documents_business_id_document_type_idx" ON "business_documents"("business_id", "document_type");

-- CreateIndex
CREATE INDEX "business_documents_business_id_document_type_target_month_idx" ON "business_documents"("business_id", "document_type", "target_month");

-- CreateIndex
CREATE INDEX "business_documents_partner_id_document_type_idx" ON "business_documents"("partner_id", "document_type");

-- CreateIndex
CREATE INDEX "project_reminders_assigned_to_reminder_date_is_completed_idx" ON "project_reminders"("assigned_to", "reminder_date", "is_completed");

-- CreateIndex
CREATE INDEX "project_reminders_project_id_idx" ON "project_reminders"("project_id");

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at" DESC);

-- CreateIndex
CREATE INDEX "announcements_target_scope_published_at_idx" ON "announcements"("target_scope", "published_at" DESC);

-- CreateIndex
CREATE INDEX "chat_conversations_user_id_updated_at_idx" ON "chat_conversations"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_setting_key_key" ON "system_settings"("setting_key");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_task_no_key" ON "tasks"("task_no");

-- CreateIndex
CREATE INDEX "tasks_status_due_date_idx" ON "tasks"("status", "due_date");

-- CreateIndex
CREATE INDEX "tasks_business_id_scope_status_idx" ON "tasks"("business_id", "scope", "status");

-- CreateIndex
CREATE INDEX "tasks_board_id_status_idx" ON "tasks"("board_id", "status");

-- CreateIndex
CREATE INDEX "tasks_column_id_sort_order_idx" ON "tasks"("column_id", "sort_order");

-- CreateIndex
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks"("parent_task_id");

-- CreateIndex
CREATE INDEX "tasks_related_entity_type_related_entity_id_idx" ON "tasks"("related_entity_type", "related_entity_id");

-- CreateIndex
CREATE INDEX "tasks_is_archived_status_idx" ON "tasks"("is_archived", "status");

-- CreateIndex
CREATE INDEX "task_attachments_task_id_idx" ON "task_attachments"("task_id");

-- CreateIndex
CREATE INDEX "task_assignees_user_id_idx" ON "task_assignees"("user_id");

-- CreateIndex
CREATE INDEX "task_assignees_task_id_idx" ON "task_assignees"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignees_task_id_user_id_key" ON "task_assignees"("task_id", "user_id");

-- CreateIndex
CREATE INDEX "task_tags_scope_idx" ON "task_tags"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "task_tags_name_scope_owner_id_key" ON "task_tags"("name", "scope", "owner_id");

-- CreateIndex
CREATE INDEX "task_columns_scope_business_id_idx" ON "task_columns"("scope", "business_id");

-- CreateIndex
CREATE INDEX "task_columns_board_id_sort_order_idx" ON "task_columns"("board_id", "sort_order");

-- CreateIndex
CREATE INDEX "task_boards_created_by_id_idx" ON "task_boards"("created_by_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_partner_id_fkey" FOREIGN KEY ("user_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_status_definitions" ADD CONSTRAINT "business_status_definitions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movement_templates" ADD CONSTRAINT "movement_templates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_business_assignments" ADD CONSTRAINT "user_business_assignments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_business_assignments" ADD CONSTRAINT "user_business_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_table_preferences" ADD CONSTRAINT "user_table_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_table_views" ADD CONSTRAINT "saved_table_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contact_business_links" ADD CONSTRAINT "customer_contact_business_links_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contact_business_links" ADD CONSTRAINT "customer_contact_business_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "customer_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_business_links" ADD CONSTRAINT "customer_business_links_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_business_links" ADD CONSTRAINT "customer_business_links_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_business_links" ADD CONSTRAINT "partner_business_links_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_business_links" ADD CONSTRAINT "partner_business_links_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_business_links" ADD CONSTRAINT "partner_business_links_business_parent_id_fkey" FOREIGN KEY ("business_parent_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contact_business_links" ADD CONSTRAINT "partner_contact_business_links_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contact_business_links" ADD CONSTRAINT "partner_contact_business_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "partner_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_bank_accounts" ADD CONSTRAINT "customer_bank_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_bank_accounts" ADD CONSTRAINT "customer_bank_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_assigned_user_id_fkey" FOREIGN KEY ("project_assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_movements" ADD CONSTRAINT "project_movements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_movements" ADD CONSTRAINT "project_movements_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "movement_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_categories" ADD CONSTRAINT "qa_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_items" ADD CONSTRAINT "qa_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_items" ADD CONSTRAINT "qa_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "qa_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_items" ADD CONSTRAINT "qa_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_items" ADD CONSTRAINT "qa_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_attachments" ADD CONSTRAINT "qa_attachments_qa_item_id_fkey" FOREIGN KEY ("qa_item_id") REFERENCES "qa_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_attachments" ADD CONSTRAINT "qa_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_inquiry_business_id_fkey" FOREIGN KEY ("inquiry_business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_inquiry_category_id_fkey" FOREIGN KEY ("inquiry_category_id") REFERENCES "qa_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_inquiry_project_id_fkey" FOREIGN KEY ("inquiry_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_inquiry_assigned_user_id_fkey" FOREIGN KEY ("inquiry_assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_inquiry_responded_by_fkey" FOREIGN KEY ("inquiry_responded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_inquiry_converted_qa_id_fkey" FOREIGN KEY ("inquiry_converted_qa_id") REFERENCES "qa_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_last_notified_by_fkey" FOREIGN KEY ("last_notified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reminders" ADD CONSTRAINT "project_reminders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reminders" ADD CONSTRAINT "project_reminders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reminders" ADD CONSTRAINT "project_reminders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "task_boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "task_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tag_on_tasks" ADD CONSTRAINT "task_tag_on_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tag_on_tasks" ADD CONSTRAINT "task_tag_on_tasks_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "task_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_notify_targets" ADD CONSTRAINT "task_notify_targets_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_notify_targets" ADD CONSTRAINT "task_notify_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "task_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_board_members" ADD CONSTRAINT "task_board_members_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "task_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_board_members" ADD CONSTRAINT "task_board_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================
-- schema.prisma では表現できない CHECK 制約
-- （旧 20260326100000_fix_self_referencing_partners 由来）
-- 代理店が自分自身を親に設定できないようにする
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_no_self_parent'
  ) THEN
    ALTER TABLE "partners"
      ADD CONSTRAINT partner_no_self_parent
      CHECK ("parent_id" IS NULL OR "parent_id" != "id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_business_link_no_self_parent'
  ) THEN
    ALTER TABLE "partner_business_links"
      ADD CONSTRAINT partner_business_link_no_self_parent
      CHECK ("business_parent_id" IS NULL OR "business_parent_id" != "partner_id");
  END IF;
END $$;
