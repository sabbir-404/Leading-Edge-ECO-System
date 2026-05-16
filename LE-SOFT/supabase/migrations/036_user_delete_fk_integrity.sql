-- Migration 036: User delete FK integrity
-- User deletion should not fail because historical records reference that user.
-- Historical rows keep their business data and user references become NULL.
-- Each FK repair is column-aware because older databases may not have every module column.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'sender_id'
    ) THEN
        ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey;
        ALTER TABLE notifications
            ADD CONSTRAINT notifications_sender_id_fkey
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'recipient_id'
    ) THEN
        ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey;
        ALTER TABLE notifications
            ADD CONSTRAINT notifications_recipient_id_fkey
            FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'permission_levels' AND column_name = 'approver_user_id'
    ) THEN
        ALTER TABLE permission_levels DROP CONSTRAINT IF EXISTS permission_levels_approver_user_id_fkey;
        ALTER TABLE permission_levels
            ADD CONSTRAINT permission_levels_approver_user_id_fkey
            FOREIGN KEY (approver_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'app_license' AND column_name = 'bound_user_id'
    ) THEN
        ALTER TABLE app_license DROP CONSTRAINT IF EXISTS app_license_bound_user_id_fkey;
        ALTER TABLE app_license
            ADD CONSTRAINT app_license_bound_user_id_fkey
            FOREIGN KEY (bound_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'make_orders' AND column_name = 'salesman_id'
    ) THEN
        ALTER TABLE make_orders DROP CONSTRAINT IF EXISTS make_orders_salesman_id_fkey;
        ALTER TABLE make_orders
            ADD CONSTRAINT make_orders_salesman_id_fkey
            FOREIGN KEY (salesman_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_tracking' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE crm_tracking DROP CONSTRAINT IF EXISTS crm_tracking_user_id_fkey;
        ALTER TABLE crm_tracking
            ADD CONSTRAINT crm_tracking_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_customers' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE crm_customers DROP CONSTRAINT IF EXISTS crm_customers_user_id_fkey;
        ALTER TABLE crm_customers
            ADD CONSTRAINT crm_customers_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'system_emails' AND column_name = 'sender_id'
    ) THEN
        ALTER TABLE system_emails ALTER COLUMN sender_id DROP NOT NULL;
        ALTER TABLE system_emails DROP CONSTRAINT IF EXISTS system_emails_sender_id_fkey;
        ALTER TABLE system_emails
            ADD CONSTRAINT system_emails_sender_id_fkey
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'system_emails' AND column_name = 'receiver_id'
    ) THEN
        ALTER TABLE system_emails DROP CONSTRAINT IF EXISTS system_emails_receiver_id_fkey;
        ALTER TABLE system_emails
            ADD CONSTRAINT system_emails_receiver_id_fkey
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'internal_messages' AND column_name = 'sender_id'
    ) THEN
        ALTER TABLE internal_messages ALTER COLUMN sender_id DROP NOT NULL;
        ALTER TABLE internal_messages DROP CONSTRAINT IF EXISTS internal_messages_sender_id_fkey;
        ALTER TABLE internal_messages
            ADD CONSTRAINT internal_messages_sender_id_fkey
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'internal_messages' AND column_name = 'receiver_id'
    ) THEN
        ALTER TABLE internal_messages DROP CONSTRAINT IF EXISTS internal_messages_receiver_id_fkey;
        ALTER TABLE internal_messages
            ADD CONSTRAINT internal_messages_receiver_id_fkey
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
